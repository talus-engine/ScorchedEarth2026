"""Save/reopen a CPU-only match at a precise turn lifecycle phase."""
import argparse
from m4_support import *
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--phase',choices=['aiming','focusing','firing','flight','settling'],required=True)
p.add_argument('--label',required=True)
p.add_argument('--current',action='store_true',help='Use an already-ready two-CPU diagnostic match')
a=p.parse_args();assert not (ROOT/('docs/evidence/m4-'+a.label+'.json')).exists()
r={'initial':state() if a.current else launch(a.label,2,0),'phase':a.phase}
assert r['initial']['match']['phase']=='ready' and r['initial']['match']['humans']==0
evidence(a.label,r)
begin()
condition="m.phase==='turn' && m.roster[m.focusIndex].aimedTurn===m.turnNumber" if a.phase=='aiming' else 'm.phase==='+json.dumps(a.phase)
# Pause through the public API within one simulation tick of the requested state.
paused=script("for(let n=0;n<1800;n++){const m=talus.state.getJson('indigo.match');if(m && ("+condition+")){talus.sim.pause();return {match:m,projectiles:talus.projectiles.find().map(p=>p.snapshot())}}await talus.sleepTicks(1)}throw new Error('Capture phase timeout')")
r['capture']=paused;r['before']=state();wid=r['before']['worldId'];evidence(a.label,r);print('Captured',a.phase,wid,flush=True)
save_world();r['afterSave']=state();evidence(a.label,r)
call('engine_set_mode',{'mode':'editor','template':WORLD_ID})
deadline=time.monotonic()+60
while time.monotonic()<deadline:
    try:
        ctx=call('engine_describe_context')['world']
        if ctx['isEditorMode'] and ctx['engineBooted']:break
    except RuntimeError:pass
    time.sleep(.3)
else:raise TimeoutError('Editor navigation')
call('engine_continue_game',{'worldId':wid})
wait_state(lambda s:s['worldId']==wid and s['match'] is not None)
script('talus.sim.resume();return true')
# Observe successful continuation through the next turn, or retain the explicit failure.
after=wait_state(lambda s:s['worldId']==wid and s['match'] is not None and (s['error'] or s['match']['phase']=='fault' or s['match']['turnNumber']>r['before']['match']['turnNumber']),90)
script('talus.sim.pause();return true');r['after']=state()
old=r['before']['match'];new=r['after']['match'];events=r['after']['events'];turn=old['turnNumber']
launches=[e for e in events if e['kind']=='launch' and e['turn']==turn]
ends=[e for e in events if e['kind']=='end'and e['turn']==turn]
checks={
 'same saved roster and world':r['after']['worldId']==wid and [x['entityId']for x in old['roster']]==[x['entityId']for x in new['roster']],
 'phase resumes without fault':not r['after']['error'] and new['phase']!='fault',
 'turn advances once after resolution':new['turnNumber']==turn+1,
 'one original shot and one completed resolution':len(launches)==1 and len(ends)==1,
 'one settle result':sum(e['kind']=='settled'and e['turn']==turn for e in events)==1,
 'impact wait completes within its limit':any(e['kind']=='settled'and e['turn']==turn and e['ticks']<=180 for e in events),
}
r['checks']=[{'name':k,'passed':v}for k,v in checks.items()];r['accepted']=all(checks.values());evidence(a.label,r)
for k,v in checks.items():print(('PASS 'if v else'FAIL ')+k,flush=True)
print('Result',new['phase'],r['after']['error'],flush=True)
# A failure is evidence for the engine handoff, never repaired by this harness.
