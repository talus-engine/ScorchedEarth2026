"""Concurrent death hazards and natural CPU combat, using the real installed game."""
import argparse,json,time
from bridge import ROOT,call
from audit_m2 import script
from m4_support import launch,begin,state,wait_state
from m6_support import restore,navigate_game,capture_baseline
p=argparse.ArgumentParser();p.add_argument('--label',required=True);p.add_argument('--furnace',action='store_true');a=p.parse_args()
out=ROOT/f'docs/evidence/m6-{a.label}-combat.json';assert not out.exists()
base=capture_baseline();report={'checks':{},'transitions':[]}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
def check(name,value):report['checks'][name]=bool(value);save();print(('PASS 'if value else 'FAIL ')+name,flush=True);assert value,name
try:
 ready=launch(a.label,4,7,seconds=5,names=['M6 Combat A','M6 Combat B','M6 Combat C','M6 Combat D'],version=6);report['ready']=ready;wid=ready['worldId'];save()
 if a.furnace:
  # Override only this disposable world's catalog, not production selection.
  catalog=json.loads((ROOT/'world/Game/chaos.json').read_text())
  for fx in catalog['effects']:fx['enabled']=fx['id']=='furnace'
  call('write_world_file',{'worldId':wid,'path':'Game/chaos.json','content':json.dumps(catalog)})
  call('write_world_file',{'worldId':wid,'path':'Scripts/match.ts','content':(ROOT/'world/Scripts/match.ts').read_text()})
  script('await talus.sleepTicks(12);const m=talus.state.getJson("indigo.match");talus.entities.get(m.roster[3].entityId).kill(m.roster[0].entityId);return true')
 observer='''if(!talus.editor.available){const samples=[];let tick=0;talus.on('tick.sim.post',()=>{if(++tick%6)return;const m=talus.state.getJson('indigo.match');if(!m)return;const b=talus.camera.view.simulationBounds;const points=m.roster.filter(p=>!p.eliminated).map(p=>talus.entities.get(p.entityId)?.snapshot());samples.push({clock:talus.sim.clock,turn:m.turnNumber,phase:m.phase,jobs:m.chaos.jobs.map(j=>({effect:j.effect,elapsed:j.elapsed})),zoom:talus.camera.view.zoom,active:points.every(s=>s?.alive&&s.residency==='live'&&b&&s.x-20>=b.x&&s.x+20<b.x+b.w&&s.y-20>=b.y&&s.y+20<b.y+b.h)});if(samples.length>4000)samples.shift();talus.state.setJson('m6.combatQA',samples)})}'''
 call('write_world_file',{'worldId':wid,'path':'Scripts/m6-combat-qa.ts','content':observer})
 begin();deadline=time.monotonic()+420;previous=None
 while time.monotonic()<deadline:
  s=state();m=s['match'];now=(m['phase'],m['turnNumber'],len(m['chaos']['jobs']))
  if now!=previous:report['transitions'].append({'clock':s['clock'],'phase':now[0],'turn':now[1],'jobs':now[2]});save();print(now,flush=True);previous=now
  if m['phase']in('finished','fault'):break
  time.sleep(.5)
 else:raise TimeoutError('CPU match exceeded diagnostic deadline')
 report['final']=s;report['audit']=script('return talus.state.getJson("m6.combatQA")');save()
 check('CPU-only match completes without a script fault',m['humans']==0 and m['phase']=='finished' and not s['error'])
 events=s['events'];q=[e for e in events if e['kind']=='chaos-queued'];ends=[e for e in events if e['kind']=='chaos-ended']
 check('each death gets one completed effect',len(q)==len(ends)==sum(p['eliminated']for p in m['roster']) and len(set(e['owner']for e in q))==len(q))
 check('secondary shells never steal the main shot',[e['owner']for e in events if e['kind']=='launch']==[e['owner']for e in events if e['kind']=='fire-request'])
 check('all survivors stay active at 25%',all(v['active'] and v['zoom']==.25 for v in report['audit']))
 check('result follows all scheduled hazards',not m['chaos']['jobs'] and m['chaos']['quiet']>=3)
 check('result agrees with the physical survivors',sum(bool(r and r['alive'])for r in s['roster'])==(1 if m['winner'] else 0))
 if a.furnace:check('later turns run while the ten-second emitter is active',any(v['turn']>=2 and any(j['effect']=='furnace' and j['elapsed']<10 for j in v['jobs'])for v in report['audit']))
 # Reopen a completed game and confirm the score write stays idempotent.
 before=s['scores'];saved=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800});report['save']=saved;save()
 check('normal save had focus',saved.get('focused') is True)
 navigate_game(wid)
 reopened=wait_state(lambda s:s['worldId']==wid and s['match']and s['match']['phase']=='finished' and s['ui'].get('finished'),120)
 report['reopened']={'match':reopened['match'],'scores':reopened['scores']};check('completed result and scores survive reopening exactly once',reopened['scores']==before and reopened['match']['winner']==m['winner'])
finally:
 restore(base);save()
