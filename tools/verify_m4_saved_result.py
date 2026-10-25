"""Reopen a completed CPU-only M4 match and verify its result is not scored twice."""
import argparse
from m4_support import *

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--label',required=True)
a=p.parse_args()
assert not (ROOT/('docs/evidence/m4-'+a.label+'.json')).exists()
before=state()
assert before['match']['phase']=='finished' and before['match']['humans']==0
preferences=script("return talus.installed.get('indigo')")
report={'before':before,'preferencesBefore':preferences}
evidence(a.label,report)
save_world()
call('engine_set_mode',{'mode':'editor','template':WORLD_ID})
wait_state(lambda s:s['worldId']==WORLD_ID)
call('engine_continue_game',{'worldId':before['worldId']})
after=wait_state(lambda s:s['worldId']==before['worldId'] and s['match'] is not None and s['ui'].get('finished'))
report['after']=after
report['preferencesAfter']=script("return talus.installed.get('indigo')")
checks={
    'completed roster and winner retained':after['match']['phase']=='finished' and after['match']['roster']==before['match']['roster'] and after['match']['winner']==before['match']['winner'],
    'score ledger unchanged by reopening':after['scores']==before['scores'],
    'remembered settings unchanged':report['preferencesAfter']==preferences,
    'scoreboard restored without fault':bool(after['ui'].get('scores')) and not after['error'],
}
report['checks']=[{'name':k,'passed':v} for k,v in checks.items()]
report['accepted']=all(checks.values());evidence(a.label,report)
for k,v in checks.items():print(('PASS ' if v else 'FAIL ')+k,flush=True)
assert report['accepted']
