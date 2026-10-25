"""Small CPU-only diagnostics using the existing Talus profile and public API."""
import json,base64,sys,time
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script

def read():
 return script('const m=talus.state.getJson("indigo.match");return {world:talus.world.id,clock:talus.sim.clock,paused:talus.sim.paused,error:talus.state.get("indigo.error"),match:m,events:talus.state.getJson("indigo.events"),audit:talus.state.getJson("m9.audit"),camera:talus.camera.view,roster:m?.roster.map(p=>p.entityId?talus.entities.get(p.entityId)?.snapshot():null)}')
def capture(label):
 s=read();(ROOT/f'docs/evidence/m9-{label}.json').write_text(json.dumps(s,indent=2)+'\n')
 r=call('engine_screenshot',{'format':'jpeg','maxWidth':1200});(ROOT/f'docs/evidence/m9-{label}.jpg').write_bytes(base64.b64decode(r['mcpImage']['data']))
 print(json.dumps({'world':s['world'],'phase':s['match']['phase'] if s['match'] else None,'turn':s['match'].get('turnNumber') if s['match'] else None,'error':s['error'],'clock':s['clock']}),flush=True)
 return s

def observe():
 source='''if(!talus.editor.available){
 let n=0;const rows=[];const push=v=>{rows.push(v);if(rows.length>3500)rows.shift();talus.state.setJson('m9.audit',rows)};
 for(const event of ['projectile.launch','projectile.end','damage','death'])talus.on(event,e=>push({event,clock:talus.sim.clock,id:e.projectileId,owner:e.owner?.id,entity:e.entity?.id,amount:e.amount,blocked:e.blocked}));
 talus.on('tick.sim.post',()=>{if(++n%12)return;const m=talus.state.getJson('indigo.match');if(!m)return;const v=talus.camera.view,b=v.simulationBounds;const tanks=m.roster.filter(p=>!p.eliminated).map(p=>talus.entities.get(p.entityId)?.snapshot());push({event:'frame',clock:talus.sim.clock,phase:m.phase,turn:m.turnNumber,cue:m.presentation?.active,zoom:v.zoom,camera:v.position,viewport:v.viewport,active:tanks.every(s=>s?.residency==='live'&&b&&s.x-20>=b.x&&s.x+20<b.x+b.w&&s.y-20>=b.y&&s.y+20<b.y+b.h),positions:tanks.map(s=>s?{x:s.x,y:s.y}:null)});});
}'''
 wid=script('return talus.world.id');call('write_world_file',{'worldId':wid,'path':'Scripts/m9-observer.ts','content':source});print('observer',wid,flush=True)
if __name__=='__main__':
 action=sys.argv[1]
 if action=='capture':capture(sys.argv[2])
 elif action=='observe':observe()
 elif action=='screen':
  r=call('engine_screenshot',{'format':'jpeg','maxWidth':1200});(ROOT/'artifacts/m9-current.jpg').write_bytes(base64.b64decode(r['mcpImage']['data']));print('artifacts/m9-current.jpg')
 elif action=='wait':
  end=time.monotonic()+int(sys.argv[2]);last=None
  while time.monotonic()<end:
   s=read();m=s['match']
   key=(m['phase'],m['turnNumber']) if m else None
   if key!=last:print(key,s['error'],flush=True);last=key
   if m and m['phase'] in ['finished','fault']:capture(sys.argv[3]);break
   time.sleep(.5)
