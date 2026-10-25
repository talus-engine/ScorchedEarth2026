"""Controlled physical chain reaction: a dead tank kills its weakened neighbor."""
import json
from bridge import ROOT,call
from audit_m2 import script
from m4_support import launch,begin,wait_state
from m6_support import restore,capture_baseline
out=ROOT/'docs/evidence/m6-2497-chain-recheck.json';assert not out.exists()
base=capture_baseline();report={'checks':{}}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
def check(name,value):report['checks'][name]=bool(value);save();print(('PASS 'if value else 'FAIL ')+name,flush=True);assert value,name
try:
 s=launch('chain',2,7,seconds=5,names=['M6 Chain A','M6 Chain B'],version=6);wid=s['worldId'];report['worldId']=wid
 cfg=json.loads((ROOT/'world/Game/chaos.json').read_text())
 for fx in cfg['effects']:fx['enabled']=fx['id']=='magazine'
 call('write_world_file',{'worldId':wid,'path':'Game/chaos.json','content':json.dumps(cfg)})
 call('write_world_file',{'worldId':wid,'path':'Scripts/match.ts','content':(ROOT/'world/Scripts/match.ts').read_text()})
 report['arranged']=script('''await talus.sleepTicks(12);const m=talus.state.getJson('indigo.match'),a=talus.entities.get(m.roster[0].entityId),b=talus.entities.get(m.roster[1].entityId),p=a.position;b.teleport({x:p.x+44,y:p.y});b.damage(99,{source:'env:m6-test',type:'true'});await talus.sleepTicks(12);return {a:a.snapshot(),b:b.snapshot()}''');save()
 check('neighbor has one HP before blast',report['arranged']['b']['health']==1)
 script("const m=talus.state.getJson('indigo.match');return talus.entities.get(m.roster[0].entityId).kill('env:m6-test')")
 begin()
 final=wait_state(lambda s:s['match']['phase']in['finished','fault'],120);report['final']=final;save()

 m=final['match'];events=final['events'];ended=[e for e in events if e['kind']=='chaos-ended'];eliminated=[e for e in events if e['kind']=='eliminated']
 check('physical chain reaction finishes as a draw',m['phase']=='finished' and not m['winner'] and all(p['eliminated']for p in m['roster']) and not final['error'])
 check('both deaths emit 100 real shells',len(ended)==2 and all(e['launched']==e['ended']==100 for e in ended))
 check('already dead tank receives its posthumous kill',m['roster'][0]['kills']==1 and any(e.get('name')=='M6 Chain B' and e.get('killer')=='M6 Chain A'for e in eliminated))
 check('draw is recorded after the chain and bounded aftermath',len(m['chaos']['jobs'])==0 and m['chaos']['quiet']>=3 and final['scores']['matches'][wid]['winner']is None)
 report['remainingProjectiles']=script('return talus.projectiles.find().map(p=>p.snapshot())')
 check('no projectile remains after the chain',not report['remainingProjectiles'])
finally:
 restore(base);save()
