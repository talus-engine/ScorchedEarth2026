"""Save and reopen the completed diagnostic match, checking score idempotence."""
import json
import time
from bridge import ROOT, call
from audit_m2 import script

out=ROOT/'docs/evidence/m3-score-reopen.json'
if out.exists():raise RuntimeError('Preserve existing evidence')
def state():
    return script("return {worldId:talus.world.id,match:talus.state.getJson('indigo.match'),scores:talus.installed.get('indigo.scores'),preferences:talus.installed.get('indigo'),ui:talus.ui.get(),error:talus.state.get('indigo.error')}")
before=state()
assert before['match']['phase']=='finished'
report={'before':before}
out.write_text(json.dumps(report,indent=2)+'\n')
call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':3000})
call('engine_continue_game',{'worldId':before['worldId']})
time.sleep(2)
deadline=time.monotonic()+60
while time.monotonic()<deadline:
    try:
        after=state()
        if after['worldId']==before['worldId'] and after['match'] and after['ui'].get('finished'):break
    except RuntimeError as e:
        if not any(x in str(e) for x in ('HTTP 502','HTTP 503','page still booting')):raise
    time.sleep(.5)
else:raise TimeoutError('Completed save did not reopen')
report['after']=after
checks={
    'completed match reopens with winner and roster intact':after['match']['phase']=='finished' and after['match']['winner']==before['match']['winner'] and after['match']['roster']==before['match']['roster'],
    'score ledger does not count the same match twice':after['scores']==before['scores'],
    'player names and settings remain remembered':after['preferences']==before['preferences'],
    'scoreboard is restored and script is healthy':bool(after['ui'].get('scores')) and not after['error'],
}
report['checks']=[{'name':k,'passed':v}for k,v in checks.items()]
report['accepted']=all(checks.values())
out.write_text(json.dumps(report,indent=2)+'\n')
for k,v in checks.items():print(('PASS 'if v else'FAIL ')+k)
assert report['accepted']
