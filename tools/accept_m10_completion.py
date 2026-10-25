"""Bounded real CPU matches through HTTP; one active profile, no builds.
Requires a fresh installed-baseline-raw.json captured before diagnostics.
"""
import base64,json,time,sys
from bridge import ROOT,WORLD_ID,call
D=ROOT/'docs/evidence/m10-completion';D.mkdir(exist_ok=True)
assert (D/'installed-baseline-raw.json').exists()
def save(name,v): (D/(name+'.json')).write_text(json.dumps(v,indent=2)+'\n');return v
def script(source,timeout=10):return call('engine_run_script',{'source':source,'timeoutMs':timeout*1000},timeout+5)['value']
def wait(fn,seconds=120):
 end=time.monotonic()+seconds;last=None
 while time.monotonic()<end:
  try:
   v=fn()
   if v:return v
  except Exception as e:last=str(e)
  time.sleep(.5)
 raise TimeoutError(last or 'Readiness deadline')
def menu():return call('engine_menu_input',timeout=10)
def focus(label):
 for _ in range(180):
  m=menu();c=next((c for c in m.get('controls',[]) if c.get('focused')),None)
  if c and c['label'].strip().casefold()==label.casefold():return
  call('engine_key',{'key':'Tab'},timeout=10)
 raise RuntimeError('No focusable '+label)
def pic(name):
 r=call('engine_screenshot',{'format':'jpeg','maxWidth':1200},timeout=15)
 (D/(name+'.jpg')).write_bytes(base64.b64decode(r['mcpImage']['data']))
def state():return script("""const m=talus.state.getJson('indigo.match');return {world:talus.world.id,clock:talus.sim.clock,paused:talus.sim.paused,error:talus.state.get('indigo.error'),match:m,events:talus.state.getJson('indigo.events'),generation:talus.world.generation.status(),camera:talus.camera.view,live:m?.roster.filter(p=>!p.eliminated).map(p=>({id:p.entityId,live:talus.entities.get(p.entityId)?.isLive,position:talus.entities.get(p.entityId)?.position}))};""")
def ready():
 s=state()
 if s.get('error'):raise RuntimeError(s['error'])
 return s if s.get('match',{}).get('phase')=='ready' else None
count=int(sys.argv[1]);recipe=sys.argv[2];seconds=int(sys.argv[3]) if len(sys.argv)>3 else 180
name=f'cpu-{count}-{recipe}'
params={'deploy':'yes','humans':0,'computers':count,'turnSeconds':30,'namesText':'\n'.join(f'M10C {count} Pilot {i+1}' for i in range(count)),'generation':{'recipe':recipe},'seriesLength':3,'personaSeed':'M10-completion'}
observing=len(sys.argv)>4 and sys.argv[4]=='observe'
if observing:
 s=state();assert s['match']['phase']!='deploying';script('talus.sim.resume();return true')
else:
 if len(sys.argv)<5 or sys.argv[4]!='resume':call('engine_new_game',{'template':WORLD_ID,'name':'M10 completion '+name,'seed':2533500+count,'params':params},timeout=30)
 s=wait(ready,600);save(name+'-ready',s);pic(name+'-ready')
 m=menu()
 if m.get('file')=='Menus/shop.html':call('engine_menu_input',{'action':'back'})
 call('engine_menu_input',{'action':'focus'});focus('Begin match');script('talus.sim.resume();return true')
 call('engine_menu_input',{'action':'confirm'})
end=time.monotonic()+seconds;last=None;samples=[];events={};fault=None
if observing:
 samples=json.loads((D/(name+'-samples.json')).read_text())
 events={json.dumps(e,sort_keys=True):e for e in json.loads((D/(name+'-events.json')).read_text())}
while time.monotonic()<end:
 s=state();m=s['match'];key=(m['turnNumber'],m['phase'])
 if key!=last:print(name,round(s['clock'],2),*key,'alive',sum(not p['eliminated'] for p in m['roster']),flush=True);last=key
 for e in s.get('events') or []:events[json.dumps(e,sort_keys=True)]=e
 samples.append({'clock':s['clock'],'phase':m['phase'],'turn':m['turnNumber'],'remaining':m['remaining'],'live':s['live']})
 if s.get('error') or m['phase']=='fault':fault=s.get('error') or m['message'];break
 if m['phase']=='finished':time.sleep(4);pic(name+'-results');break
 if any(not r['live'] for r in s['live']):fault='Living tank outside active ring';break
 time.sleep(.8)
s=state();save(name+'-final',s);save(name+'-events',list(events.values()));save(name+'-samples',samples[-600:])
summary={'count':count,'recipe':recipe,'phase':s['match']['phase'],'turn':s['match']['turnNumber'],'fault':fault,'winner':s['match']['winner'],'roster':[{k:p.get(k) for k in ['name','personaId','weaponId','kills','shots','hits','damage','cashEarned','tactic']} for p in s['match']['roster']]}
save(name+'-summary',summary);print(json.dumps(summary),flush=True)
# Native navigation saves the outgoing world; finish the current sequence first.
wait(lambda:script("const s=talus.game.saveStatus,m=talus.state.getJson('indigo.match');const stable=s.allowed && (['ready','finished'].includes(m.phase)||m.roster[m.focusIndex].aimedTurn===m.turnNumber);if(stable)talus.sim.pause();return stable"),120)
time.sleep(1)
if fault:raise RuntimeError(fault)
