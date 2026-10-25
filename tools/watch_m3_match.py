"""Observe a real computer match through completion, retaining turn evidence."""
import argparse
import json
import time
from bridge import ROOT, call
from audit_m2 import script

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--label',required=True)
p.add_argument('--begin',action='store_true')
p.add_argument('--seconds',type=int,default=240)
a=p.parse_args()
out=ROOT/('docs/evidence/m3-'+a.label+'.json')
if out.exists():p.error('Choose a fresh label')
report={'snapshots':[],'checks':[]}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
def state():
    return script("const m=talus.state.getJson('indigo.match');return {worldId:talus.world.id,match:m,error:talus.state.get('indigo.error'),events:talus.state.getJson('indigo.events'),ui:talus.ui.get(),dialogueActive:talus.dialogue.active,roster:m?.roster.map(p=>talus.entities.get(p.entityId)?.snapshot()),scores:talus.installed.get('indigo.scores')}")
end=time.monotonic()+a.seconds
last=None
while time.monotonic()<end:
    s=state();m=s['match']
    if not m or m['phase']=='deploying':time.sleep(.5);continue
    report['worldId']=s['worldId']
    if a.begin:
        assert m['phase']=='ready'
        report['initial']=s;save()
        call('engine_mouse',{'action':'click','x':1720,'y':974})
        a.begin=False;time.sleep(.5);continue
    stamp=(m['turnNumber'],m['phase'])
    if stamp!=last:
        report['snapshots'].append(s);save();last=stamp
        print(f'Turn {stamp[0]}: {stamp[1]} — '+', '.join(str(round(r['health'] or 0)) for r in s['roster']),flush=True)
    if s['error'] or m['phase']=='fault':
        report['error']=s;save();raise RuntimeError(s['error']or m['message'])
    if m['phase']=='finished':
        report['final']=s
        events=s['events']
        checks={
          'one survivor ends the match':sum(not r['eliminated']for r in m['roster'])==1 and bool(m['winner']),
          'CPU graph plans and launches both tanks':len({e['owner']for e in events if e['kind']=='launch'})==2 and len({e['name']for e in events if e['kind']=='cpu-plan'})==2,
          'one launch per firing turn':len([e for e in events if e['kind']=='launch'])==len({e['turn']for e in events if e['kind']=='launch'}),
          'at least one damaging hit':any(e['kind']=='hit'and e['amount']>0 for e in events),
          'credited kill recorded':sum(r['kills']for r in m['roster'])==1,
          'shooter can park during flight':any(e['kind']=='end'and e['shooterResidency']=='stored'for e in events),
          'all completed impacts settle':all(not e['timedOut']for e in events if e['kind']=='settled') and sum(e['kind']=='settled'for e in events)==sum(e['kind']=='end'for e in events),
          'score stored once for this world':s['scores']['matches'][s['worldId']]['winner']==m['winner'],
          'winner has an installation-level win':s['scores']['players'][m['winner'].lower()]['wins']>=1,
        }
        report['scriptStatus']=call('engine_script_status',{'script':'match'})
        checks['no script faults']=not report['scriptStatus']['faulted']
        report['checks']=[{'name':k,'passed':v}for k,v in checks.items()];report['accepted']=all(checks.values());save()
        for k,v in checks.items():print(('PASS 'if v else'FAIL ')+k,flush=True)
        if not report['accepted']:raise AssertionError('Match acceptance failed')
        break
    time.sleep(.6)
else:
    report['timeout']=state();save();raise TimeoutError('Match did not finish within the observation window')
