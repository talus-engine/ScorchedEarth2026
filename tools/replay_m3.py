"""Drive the first real M3 human/CPU turns through HUD and keyboard input."""
import argparse
import json
import time
from bridge import ROOT, call
from audit_m2 import script

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--label',default='first-turns')
a=p.parse_args()
out=ROOT/('docs/evidence/m3-'+a.label+'.json')
if out.exists():raise RuntimeError('Preserve prior evidence: choose a fresh report path')
report={'checks':[],'snapshots':{}}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
def check(name,ok):
    report['checks'].append({'name':name,'passed':bool(ok)});save();print(('PASS 'if ok else'FAIL ')+name,flush=True)
    if not ok:raise AssertionError(name)
def state():
    return script("const m=talus.state.getJson('indigo.match');return {worldId:talus.world.id,match:m,error:talus.state.get('indigo.error'),events:talus.state.getJson('indigo.events'),roster:m?.roster.map(p=>{if(!p.entityId)return null;const e=talus.entities.get(p.entityId);return {snapshot:e.snapshot(),angle:e.blackboard.get('custom.angle'),power:e.blackboard.get('custom.power'),weapon:e.weapon.state}}),ui:talus.ui.get(),input:talus.players.get(0).readInput()}")
def until(fn,seconds=75):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        s=state()
        if s['error']:
            report['fault']=s;save();raise RuntimeError(s['error'])
        if s['match'] and fn(s):return s
        time.sleep(.4)
    report['timeout']=state();save();raise TimeoutError('M3 test wait')
def hold(key,ticks):
    call('engine_key',{'key':key,'action':'down'})
    try:script(f'await talus.sleepTicks({ticks});return true')
    finally:call('engine_key',{'key':key,'action':'up'})

report['snapshots']['ready']=until(lambda s:s['match']['phase']=='ready')
report['worldId']=report['snapshots']['ready']['worldId'];save()
# Begin button observed at 1075,609 on the 1200px screenshot of the 1920px window.
call('engine_mouse',{'action':'click','x':1720,'y':974})
s=until(lambda s:s['match']['phase']=='turn');report['snapshots']['humanStart']=s
check('human turn starts with keyboard enabled',s['input']['enabled'] and s['match']['turnNumber']==1)
hold('d',30);moved=state();report['snapshots']['moved']=moved
check('human positioning moves the tank',moved['roster'][0]['snapshot']['x']>s['roster'][0]['snapshot']['x']+5)
hold('ArrowUp',10);aimed=state();report['snapshots']['aimed']=aimed
check('power input updates blackboard and HUD',aimed['roster'][0]['power']>70 and aimed['ui']['current']['power']==aimed['roster'][0]['power'])
call('engine_key',{'key':'Space'})
s=until(lambda s:s['match']['phase']=='flight');report['snapshots']['flight']=s
check('fire launches one shell and locks human input',not s['input']['enabled'] and sum(e['kind']=='launch'for e in s['events'])==1)
call('engine_key',{'key':'Space'})
s=until(lambda s:s['match']['turnNumber']>=2);report['snapshots']['cpuStart']=s
check('impact settles before the next tank turn',any(e['kind']=='settled'for e in s['events']))
s=until(lambda s:sum(e['kind']=='launch'for e in s['events'])>=2);report['snapshots']['cpuFlight']=s
check('NPC command graph plans and fires the computer shot',any(e['kind']=='cpu-plan'for e in s['events']))
s=until(lambda s:s['match']['turnNumber']>=3);report['snapshots']['humanReturn']=s
check('camera returns after computer impact and shooter can park',s['match']['focusIndex']==0 and any(e['kind']=='end'and e['shooterResidency']=='stored'for e in s['events']))
call('engine_key',{'key':'Enter'})
s=until(lambda s:s['match']['turnNumber']>=4);report['snapshots']['passed']=s
check('Enter passes the human turn without pausing',any(e['kind']=='pass'for e in s['events']))
s=until(lambda s:s['match']['turnNumber']>=5);report['snapshots']['humanTimeoutStart']=s
s=until(lambda s:any(e['kind']=='timeout'for e in s['events']),seconds=45);report['snapshots']['timeoutTurn']=s
check('turn timer expires and advances without firing',s['match']['turnNumber']>=6)
report['scriptStatus']=call('engine_script_status',{'script':'match'})
check('no script faults',not report['scriptStatus']['faulted'])
report['accepted']=True;save()
