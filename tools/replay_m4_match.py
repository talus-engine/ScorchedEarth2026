"""Run a fresh CPU-only match, validating turns, elimination and score totals."""
import argparse
import time
from m4_support import *
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--label',required=True);p.add_argument('--count',type=int,default=3);p.add_argument('--seed',type=int,default=0);p.add_argument('--seconds',type=int,default=420)
p.add_argument('--current',action='store_true',help='Begin or resume the current diagnostic match')
p.add_argument('--max-turns',type=int,default=24,help='Bound repeated misses without forcing a game result')
a=p.parse_args();assert not (ROOT/('docs/evidence/m4-'+a.label+'.json')).exists()
initial=wait_state(lambda s:s['match'] is not None and s['match']['phase'] in ('ready','focusing','turn','flight','settling')) if a.current else launch(a.label,a.count,a.seed)
assert initial['match']['computers']==a.count and initial['match']['humans']==0 and initial['match']['seed']==a.seed
r={'initial':initial,'snapshots':[],'checks':[]};r['worldId']=r['initial']['worldId'];evidence(a.label,r)
if initial['match']['phase']=='ready':
    r['initialWeapon']=script("const m=talus.state.getJson('indigo.match');return talus.entities.get(m.roster[m.focusIndex].entityId).weapon.state")
    w=r['initialWeapon']
    assert w['pinned'] and abs(w['power']-.7)<1e-6 and abs(w['angle']+3.141592653589793/4)<1e-6,w
    evidence(a.label,r)
if initial['paused']:script('talus.sim.resume();return true')
if initial['match']['phase']=='ready':begin()
deadline=time.monotonic()+a.seconds;last=None
while time.monotonic()<deadline:
    s=state();m=s['match'];stamp=(m['turnNumber'],m['phase'])
    if stamp!=last:
        r['snapshots'].append(s);evidence(a.label,r);last=stamp
        print('Turn',stamp,[(p['name'],round(p['health'] or 0))for p in s['roster']],flush=True)
    if s['error']or m['phase']=='fault':r['fault']=s;evidence(a.label,r);raise RuntimeError(s['error']or m['message'])
    if m['phase']=='finished':break
    if m['turnNumber']>=a.max_turns and m['phase'] in ('focusing','turn'):
        script('talus.sim.pause();return true');r['stopped']=state()
        r['stoppedReason']='Reached diagnostic turn limit; game outcome was not forced'
        r['accepted']=False;evidence(a.label,r);save_world()
        print(r['stoppedReason'],flush=True);raise SystemExit(2)
    time.sleep(.5)
else:r['timeout']=state();evidence(a.label,r);raise TimeoutError('CPU match incomplete')
r['final']=s;events=s['events'];eliminated=set();order_ok=True;shot_turns=[]
for e in events:
    if e['kind']=='eliminated':eliminated.add(e['name'])
    if e['kind']=='turn' and e['name']in eliminated:order_ok=False
    if e['kind']=='launch':shot_turns.append(e['turn'])
checks={
 'CPU-only requested roster':m['humans']==0 and m['computers']==a.count,
 'last survivor wins or no survivors draw':([p['name']for p in m['roster']if not p['eliminated']]==[m['winner']] if m['winner'] else all(p['eliminated']for p in m['roster'])),
 'eliminated tanks are skipped':order_ok and len(eliminated)==sum(p['eliminated']for p in m['roster']),
 'one shot per turn':len(shot_turns)==len(set(shot_turns)),
 'engine ballistic graph aims and fires':any(e['kind']=='cpu-aimed'for e in events)and bool(shot_turns),
 'damage and hit feedback occur':any(e['kind']=='hit'and e['amount']>0 for e in events)and bool(s['ui']['lastHit']),
 'all impacts complete one bounded wait':sum(e['kind']=='end'for e in events)==sum(e['kind']=='settled'for e in events)and all(e['ticks']<=180 for e in events if e['kind']=='settled'),
 'parked shooter keeps attribution':any(e['kind']=='end'and e['shooterResidency']=='stored'for e in events),
 'kill credit matches attributed eliminations':sum(p['kills']for p in m['roster'])==sum(e['kind']=='eliminated'and bool(e.get('killer'))for e in events),
 'winner recorded once':s['scores']['matches'][s['worldId']]['winner']==m['winner'],
 'no script faults':not call('engine_script_status',{'script':'match'})['faulted'],
}
r['checks']=[{'name':k,'passed':v}for k,v in checks.items()];r['accepted']=all(checks.values());evidence(a.label,r);save_world()
for k,v in checks.items():print(('PASS 'if v else'FAIL ')+k,flush=True)
assert r['accepted']
