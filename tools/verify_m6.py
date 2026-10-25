"""CPU-only live M6 diagnostics. No browser profiles; forced choices exist only in test saves."""
import argparse,base64,json,time
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script
from m4_support import launch,begin,state,wait_state
from m6_support import restore,capture_baseline
p=argparse.ArgumentParser();p.add_argument('--label',required=True);p.add_argument('--effects',default='furnace,magazine,thermite,oil,volcano,cryo,sprinkler,fireworks,popcorn,meteor');a=p.parse_args()
out=ROOT/f'docs/evidence/m6-{a.label}.json';assert not out.exists()
baseline=capture_baseline()
report={'baseline':{'world':baseline['world']},'cases':[],'checks':{}}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
def check(name,value):
 report['checks'][name]=bool(value);save();print(('PASS ' if value else 'FAIL ')+name,flush=True);assert value,name
source=(ROOT/'world/Scripts/match.ts').read_text()
selection='const fx = pool[Math.floor(chaosRandom() * pool.length)]'
assert source.count(selection)==1
probe=source.replace(selection,"const forced = tank?.blackboard.get('custom.qaDeathEffect'); const fx = forced ? pool.find((v:any)=>v.id===forced) : pool[Math.floor(chaosRandom() * pool.length)]; if(!fx) throw new Error('Unknown QA effect')")
observer="""
if(!talus.editor.available){
 const data={events:[],samples:[]};let ticks=0;
 for(const kind of ['launch','detonate','hit','end'])talus.on('projectile.'+kind,e=>{
   data.events.push({kind,id:e.projectileId,owner:e.owner?.id,target:e.targetStableId,amount:e.amount,clock:talus.sim.clock});
 });
 talus.on('tick.sim.post',()=>{ticks++;if(ticks%6)return;const m=talus.state.getJson('indigo.match');if(!m)return;
   const v=talus.camera.view,b=v.simulationBounds;
   const alive=m.roster.filter(p=>!p.eliminated).map(p=>talus.entities.get(p.entityId)?.snapshot());
   data.samples.push({clock:talus.sim.clock,phase:m.phase,turn:m.turnNumber,jobs:m.chaos.jobs.length,zoom:v.zoom,
     active:alive.every(s=>s?.alive&&s.residency==='live'&&b&&s.x-20>=b.x&&s.x+20<b.x+b.w&&s.y-20>=b.y&&s.y+20<b.y+b.h)});
   if(data.samples.length>3000)data.samples.shift();talus.state.setJson('m6.qa',data);
 });
}
"""
try:
 for fx in a.effects.split(','):
  print('Starting '+fx,flush=True)
  ready=launch(a.label+'-'+fx,2,7,seconds=5,names=['M6 QA A','M6 QA B'],version=6)
  wid=ready['worldId'];case={'effect':fx,'worldId':wid};report['cases'].append(case);save()
  catalog=json.loads((ROOT/'world/Game/chaos.json').read_text())
  assert any(v['id']==fx and v.get('mode') in ['spray','magazine','shells'] for v in catalog['effects']), 'Effect requires a new engine capability'
  for v in catalog['effects']:v['enabled']=v['id']==fx
  call('write_world_file',{'worldId':wid,'path':'Game/chaos.json','content':json.dumps(catalog)})
  call('write_world_file',{'worldId':wid,'path':'Scripts/match.ts','content':probe})
  call('write_world_file',{'worldId':wid,'path':'Scripts/m6-qa.ts','content':observer})
  script('await talus.sleepTicks(12);return true')
  case['kill']=script("const m=talus.state.getJson('indigo.match');const e=talus.entities.get(m.roster[1].entityId);e.blackboard.set('custom.qaDeathEffect',"+json.dumps(fx)+");return e.kill(m.roster[0].entityId)")
  begin()
  if fx=='furnace':
   script('await talus.sleepTicks(180);return true')
   screen=call('engine_screenshot',{'format':'jpeg','maxWidth':1200});(ROOT/f'docs/evidence/m6-{a.label}-furnace.jpg').write_bytes(base64.b64decode(screen['mcpImage']['data']))
  final=wait_state(lambda s:s['match']['phase'] in ['finished','fault'],seconds=150)
  case['final']=final;case['audit']=script("return talus.state.getJson('m6.qa')");save()
  check(fx+': no script fault',not final['error'] and final['match']['phase']=='finished')
  events=final['events'];queued=[e for e in events if e['kind']=='chaos-queued'];ends=[e for e in events if e['kind']=='chaos-ended']
  check(fx+': one death, one selected effect, one completion',len(queued)==1 and len(ends)==1 and ends[0]['effect']==fx)
  check(fx+': no premature victory',not final['match']['chaos']['jobs'] and final['match']['chaos']['quiet']>=3 and final['match']['winner']=='M6 QA A')
  check(fx+': 25% camera and survivor active',all(s['active'] and s['zoom']==.25 for s in case['audit']['samples']))
  cfg=next(x for x in json.loads((ROOT/'world/Game/chaos.json').read_text())['effects'] if x['id']==fx)
  check(fx+': duration honored',ends[0]['elapsed']>=cfg['duration'])
  if cfg['mode']=='spray':check(fx+': repeated spray allocations accepted',ends[0]['livePulses']>=cfg['duration']/cfg['interval']*.5)
  else:
   ev=case['audit']['events'];launched=[e for e in ev if e['kind']=='launch'];ended=[e for e in ev if e['kind']=='end'];detonated=[e for e in ev if e['kind']=='detonate']
   check(fx+': exact real shell count',len(launched)==cfg['count'] and len(ended)==cfg['count'] and len(detonated)==cfg['count'])
   case['burstSeconds']=max(e['clock'] for e in launched)-min(e['clock'] for e in launched)
  save()
finally:
 restore(baseline);report['restoredWorld']=baseline['world'];save()
