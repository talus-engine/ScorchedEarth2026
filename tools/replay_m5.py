"""Independently replay M5 against the installed app, without cloning a profile."""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from bridge import ROOT, call
from audit_m2 import script
from m4_support import launch, begin, state, wait_state

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--label', required=True)
a = p.parse_args()
out = ROOT / f'docs/evidence/m5-{a.label}-replay.json'
course_path = ROOT / f'docs/evidence/m5-{a.label}-course.json'
assert not out.exists() and not course_path.exists(), 'Choose a fresh evidence label'
baseline = script("return {worldId:talus.world.id,preferences:talus.installed.get('indigo'),scores:talus.installed.get('indigo.scores')}")
report = {'baseline': baseline, 'checks': {}, 'phases': []}

def save():
    out.write_text(json.dumps(report, indent=2) + '\n')

def check(name, passed):
    report['checks'][name] = bool(passed)
    save()
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    assert passed, name

observer = """
if (!talus.editor.available) {
  let ticks=0, violations=[], transitions=[], events=[], samples=[];
  talus.on('entity.residency',e=>{
    const m=talus.state.getJson('indigo.match'),p=m?.roster.find(p=>p.entityId===e.entityKey);
    if(p&&!p.eliminated)transitions.push({id:e.entityKey,residency:e.entity.residency,alive:e.entity.snapshot()?.alive,tick:ticks});
  });
  for(const kind of ['launch','detonate','hit','end'])talus.on('projectile.'+kind,e=>{
    events.push({kind,id:e.projectileId,target:e.targetStableId,amount:e.amount,tick:ticks});
  });
  talus.on('tick.sim.post',()=>{
    const m=talus.state.getJson('indigo.match');if(!m)return;ticks++;
    const view=talus.camera.view,b=view.simulationBounds,roster=[];
    for(const p of m.roster){
      if(p.eliminated||!p.entityId)continue;
      const s=talus.entities.get(p.entityId)?.snapshot();if(!s?.alive)continue;
      roster.push({id:s.id,x:s.x,y:s.y,health:s.health,residency:s.residency});
      const inside=b&&s.x-20>=b.x&&s.x+20<b.x+b.w&&s.y-20>=b.y&&s.y+20<b.y+b.h;
      if((s.residency!=='live'||!inside||view.zoom!==.25)&&violations.length<100)
        violations.push({tick:ticks,phase:m.phase,s,view});
    }
    if(ticks%60===0){
      if(samples.length<1200)samples.push({tick:ticks,phase:m.phase,roster,view});
      talus.state.setJson('m5.verification',{ticks,violations,transitions,events,samples});
    }
  });
}
"""

try:
    save()
    print('Replaying the restored-actor step course', flush=True)
    script('talus.sim.resume();return true')
    with (ROOT / f'artifacts/m5-{a.label}-course.log').open('w') as log:
        subprocess.run([sys.executable, '-u', str(ROOT/'tools/probe_m5_movement.py'),
                        '--label', a.label+'-course', '--version', '5',
                        '--course-offset-x', '1000', '--stream'], check=True, stdout=log, stderr=subprocess.STDOUT)
    course = json.loads(course_path.read_text())
    report['course'] = {'evidence': course_path.name, 'checks': course['checks']}
    for name, passed in course['checks'].items():
        check('movement: ' + name, passed)

    print('Starting a fresh four-CPU match', flush=True)
    ready = launch(a.label+'-combat', 4, 7, seconds=5,
                   names=[f'M5 Verify {i}' for i in range(1,5)], version=5)
    report['ready'] = ready
    wid = ready['worldId']
    report['observerWrite'] = call('write_world_file', {'worldId': wid,
        'path': 'Scripts/m5-verification.ts', 'content': observer})
    script('await talus.sleepTicks(65);return true')
    report['cameraReady'] = call('engine_camera')
    check('real 25% zoom and all tanks fit', report['cameraReady']['zoom']==.25
          and report['cameraReady']['frame']['result']['fitsViewport']
          and report['cameraReady']['frame']['result']['fitsSimulation'])
    check('observer installation retains roster identity',
          [s['id'] for s in ready['roster']] == [s['id'] for s in state()['roster']])
    begin()
    deadline = time.monotonic()+360
    stamp = None
    while time.monotonic()<deadline:
        s = state()
        m = s['match']
        now = (m['turnNumber'],m['phase'])
        if now != stamp:
            report['phases'].append({'turn': now[0], 'phase': now[1],
                                     'health': [p['health'] for p in s['roster']]})
            save()
            print('Turn', now[0], now[1], report['phases'][-1]['health'], flush=True)
            stamp = now
        assert not s['error'] and m['phase']!='fault', s
        if m['phase']=='finished':
            break
        time.sleep(.5)
    else:
        raise TimeoutError('Four-CPU match did not finish')
    script('await talus.sleepTicks(65);return true')
    report['final'] = state()
    report['audit'] = script("return talus.state.getJson('m5.verification')")
    audit = report['audit']
    check('one survivor wins without a script fault',
          sum(p['alive'] for p in report['final']['roster'])==1
          and bool(report['final']['match']['winner']) and not report['final']['error'])
    check('every surviving hull remains in the active ring on every observed tick',
          audit['ticks']>120 and not audit['violations'])
    check('no living roster actor parks',
          not any(t['alive'] and t['residency']!='live' for t in audit['transitions']))
    launches = [e for e in audit['events'] if e['kind']=='launch']
    check('real shells launch', len(launches)>0)
    check('every shot detonates and ends exactly once, after hits', all(
        len([e for e in audit['events'] if e['id']==shot['id'] and e['kind']=='detonate'])==1
        and len([e for e in audit['events'] if e['id']==shot['id'] and e['kind']=='end'])==1
        and [e['kind'] for e in audit['events'] if e['id']==shot['id']][-1]=='end'
        for shot in launches))
    check('damage is observed', any(e['kind']=='hit' and (e.get('amount') or 0)>0 for e in audit['events']))
    report['saveKey'] = call('engine_key', {'key':'s','modifiers':['meta'],'settleMs':2500})
    check('save shortcut reaches the app', report['saveKey']['focused'])
    call('engine_set_mode', {'mode':'menu'})
    time.sleep(2)
    call('engine_continue_game', {'worldId':wid})
    reopened = wait_state(lambda s:s['worldId']==wid and s['match'] and
                          s['match']['phase']=='finished' and s['ui'].get('finished'),120)
    report['reopened'] = reopened
    report['cameraReopened'] = call('engine_camera')
    check('save/reopen preserves identity, health and result',
          [(p['id'],p['health']) for p in report['final']['roster']]
          == [(p['id'],p['health']) for p in reopened['roster']]
          and report['final']['match']['winner']==reopened['match']['winner'])
    check('save/reopen preserves 25% zoom and simulation frame',
          report['cameraReopened']['zoom']==.25 and
          report['cameraReopened']['frame']['result']['fitsSimulation'])
    check('save/reopen does not duplicate scores',report['final']['scores']==reopened['scores'])
finally:
    # These are isolated diagnostics: restore exactly the pre-test preferences
    # and scores, then return to the untouched ready game supplied by the user.
    report['restoredSettings'] = script(
        "talus.installed.set('indigo',"+json.dumps(baseline['preferences'])+
        ");talus.installed.set('indigo.scores',"+json.dumps(baseline['scores'])+
        ");return {preferences:talus.installed.get('indigo'),scores:talus.installed.get('indigo.scores')}")
    save()
    call('engine_set_mode', {'mode':'menu'})
    deadline = time.monotonic()+30
    while time.monotonic()<deadline:
        if call('engine_describe_context')['world']['worldId'] is None:
            break
        time.sleep(.3)
    else:
        raise TimeoutError('Return to title screen did not complete')
    call('engine_continue_game', {'worldId':baseline['worldId']})
    report['returned'] = wait_state(lambda s:s['worldId']==baseline['worldId']
        and s['match'] and s['ui'].get('ready') and not s['error'],120)
    save()
    assert report['restoredSettings']=={k:baseline[k] for k in ['preferences','scores']}
report['accepted'] = all(report['checks'].values())
save()
print('ACCEPTED',sum(report['checks'].values()),'checks;',out,flush=True)
