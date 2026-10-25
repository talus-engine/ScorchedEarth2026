"""Place a diagnostic tank beyond the floor and verify normal OOB elimination."""
import json
import time
from bridge import ROOT, call
from audit_m2 import script

out=ROOT/'docs/evidence/m3-bounds.json'
if out.exists():raise RuntimeError('Preserve existing evidence')
def state():
    return script("const m=talus.state.getJson('indigo.match');return {worldId:talus.world.id,match:m,events:talus.state.getJson('indigo.events'),roster:m.roster.map(p=>talus.entities.get(p.entityId).snapshot()),scores:talus.installed.get('indigo.scores'),error:talus.state.get('indigo.error')}")
deadline=time.monotonic()+60
while time.monotonic()<deadline:
    before=state();m=before['match']
    assert not before['error'] and m['phase'] not in ('fault','finished')
    if m['phase']=='turn' and m['roster'][m['focusIndex']]['control']=='human':break
    time.sleep(.3)
else:raise TimeoutError('No human turn')
assert all(p['name'].startswith('M3 Test ') for p in m['roster']), 'Only the disposable test roster is authorized for this diagnostic'
victim=m['roster'][m['focusIndex']]
report={'before':before,'controlledTrigger':'Teleport the current test tank below y=1280; normal tick hook must eliminate it.'}
out.write_text(json.dumps(report,indent=2)+'\n')
script("const m=talus.state.getJson('indigo.match');const e=talus.entities.get(m.roster[m.focusIndex].entityId);e.teleport(e.x,m.bounds.y+m.bounds.h+64);await talus.sleepTicks(12);return true")
after=state();report['after']=after
checks={
    'out-of-bounds tick kills the actual NPC':any(e['kind']=='eliminated'and e['name']==victim['name']and e['reason']=='out of bounds'for e in after['events']) and not after['roster'][victim['index']]['alive'],
    'one remaining tank immediately wins':after['match']['phase']=='finished' and after['match']['winner']!=victim['name'],
    'environmental death gives no player kill':sum(p['kills']for p in after['match']['roster'])==0,
    'result persisted for this world':after['scores']['matches'][after['worldId']]['winner']==after['match']['winner'],
    'no game error':not after['error'],
}
report['checks']=[{'name':k,'passed':v}for k,v in checks.items()];report['accepted']=all(checks.values())
out.write_text(json.dumps(report,indent=2)+'\n')
for k,v in checks.items():print(('PASS 'if v else'FAIL ')+k)
assert report['accepted']
