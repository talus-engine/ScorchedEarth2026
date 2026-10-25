import sys,json,time,pathlib,base64
sys.path.insert(0,'/Users/tonygermaneri/gh/indigo/tools')
from bridge import call,WORLD_ID,ROOT
D=pathlib.Path('/private/tmp/talus-m10-followup')
def save(name,value):
 (D/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n');return value
def script(source,timeout=30):
 r=call('engine_run_script',{'source':source,'timeoutMs':timeout*1000},timeout+5)
 if r.get('error'):raise RuntimeError(r)
 return r.get('value')
def wait(fn,seconds=75):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:
   v=fn()
   if v:return v
  except Exception as e:last=e
  time.sleep(.5)
 raise TimeoutError('Readiness deadline')
def menu(file=None):
 m=call('engine_menu_input',timeout=10)
 return m if m.get('controls') and (file is None or m.get('file')==file) else None
def focus(label):
 for _ in range(240):
  m=menu();c=next((c for c in m['controls'] if c['focused']),None)
  if c and c['label'].strip().lower()==label.lower():return m
  call('engine_key',{'key':'Tab'},timeout=10)
 raise RuntimeError('No focusable '+label)
def pic(name):
 r=call('engine_screenshot',{'format':'jpeg','maxWidth':1400},timeout=20)
 (D/(name+'.jpg')).write_bytes(base64.b64decode(r['mcpImage']['data']))
def state():
 return script("const m=talus.state.getJson('indigo.match');return {world:talus.world.id,seed:talus.world.seed,paused:talus.sim.paused,error:talus.state.get('indigo.error'),match:m,events:talus.state.getJson('indigo.events'),generation:talus.world.generation.status(),camera:talus.camera.view,params:talus.game.params}")
cmd=sys.argv[1]
if cmd=='install':
 call('engine_set_mode',{'mode':'editor','template':WORLD_ID})
 wait(lambda:call('engine_describe_context',timeout=10)['world'].get('isEditorMode'))
 wait(lambda:script('return talus.editor.available && talus.installed.keys().length >= 0'))
 save('template-before-files',{p:call('read_world_file',{'worldId':WORLD_ID,'path':p}) for p in ['Scripts/match.ts','Menus/setup.html','Menus/shop.html']})
 for p in ['Menus/setup.html','Menus/shop.html','Scripts/match.ts']:
  print('write',p,flush=True);call('write_world_file',{'worldId':WORLD_ID,'path':p,'content':(ROOT/'world'/p).read_text()},timeout=40)
 arena=json.loads((ROOT/'world/Game/arena.json').read_text())
 save('graph-installed',call('save_behavior_graph',{'graphId':arena['cpuGraph'],'graphName':'Indigo CPU turn','graphType':'command','graphData':json.loads((ROOT/'world/Graphs/cpu-turn.json').read_text()),'description':'Choose a target; survey the native impact or carrier-to-apex corridor; preserve staged speech and one shot.'}))
 save('template-saved',script('await talus.editor.save();return true',60))
elif cmd=='menus':
 save('games-before-menu',call('engine_list_games'))
 call('engine_set_mode',{'mode':'menu','template':WORLD_ID});time.sleep(2);save('title',wait(lambda:menu('Menus/title.html')))
 focus('Options');call('engine_menu_input',{'action':'confirm'});time.sleep(1)
 m=save('options',menu());assert m['presentation']['backdropRetained'] and m['presentation']['themeApplied'],m
 pic('options');call('engine_menu_input',{'action':'back'});m=wait(lambda:menu('Menus/title.html'))
 assert next(c['label'] for c in m['controls'] if c['focused'])=='Options',m
 save('options-return',m)
 assert call('engine_list_games')['games']==json.loads((D/'games-before-menu.json').read_text())['games']
 print('PASS actual Options backdrop/theme/focus and no saves',flush=True)
elif cmd=='forms':
 call('engine_set_mode',{'mode':'menu','template':WORLD_ID});time.sleep(2);wait(lambda:menu('Menus/title.html'))
 focus('New game');call('engine_menu_input',{'action':'confirm'});wait(lambda:menu('Menus/setup.html'))
 focus('Advanced battlefield settings');call('engine_menu_input',{'action':'confirm'})
 focus('Landscape recipe')
 def choose(value):
  for _ in range(15):
   m=menu();c=next(c for c in m['controls'] if c['focused'])
   if c['value']==value:return m
   call('engine_menu_input',{'action':'confirm'})
  raise RuntimeError('Recipe not found '+value)
 choose('dune-sea');save('form-zone',menu())
 focus('Ridge height');call('engine_key',{'key':'a','modifiers':['meta']});call('engine_type',{'text':'91'})
 save('form-zone-edited',menu());focus('Landscape recipe');choose('bunker-grid');save('form-maze',menu())
 assert not any(c['label']=='Ridge height' for c in menu()['controls'])
 # Native gamepad left returns to random, preserving each scoped draft.
 for _ in range(12):call('engine_menu_input',{'gamepad':{'buttons':[0]*14+[1],'axes':[]}})
 save('form-random',menu());pic('advanced-settings')
 print('Recorded schema-scoped recipe switching',flush=True)
elif cmd=='form-launch':
 assert menu()['file']=='Menus/setup.html'
 def replace(label,text):
  focus(label);call('engine_key',{'key':'a','modifiers':['meta']});call('engine_type',{'text':str(text)})
 before=call('engine_list_games')['games']
 replace('Ridge height',9999);focus('Deploy tanks');call('engine_menu_input',{'action':'confirm'});time.sleep(.5)
 save('invalid-form',menu());pic('invalid-form')
 assert call('engine_list_games')['games']==before
 assert menu()['presentation']['kind']=='native' and menu()['presentation']['themeApplied']
 call('engine_menu_input',{'action':'confirm'});wait(lambda:menu('Menus/setup.html'))
 replace('Ridge height',91)
 catalog=json.loads((ROOT/'world/Game/terrain-recipes.json').read_text())
 for recipe in catalog['recipes']:replace(recipe['label']+' weight',1 if recipe['id']=='bunker-grid' else 0)
 replace('humans',0);replace('computers',2);replace('World seed',2533410)
 name=next(c['label'] for c in menu()['controls'] if c['tag']=='textarea');replace(name,'2534 Ember\n2534 Mint')
 save('form-before-launch',menu());focus('Deploy tanks');call('engine_menu_input',{'action':'confirm'})
 def ready():
  s=state()
  return s if s['match'] and s['match']['phase']=='ready' else None
 s=save('maze-ready',wait(ready,120));pic('maze-ready');assert s['generation']['recipeId']=='bunker-grid'
 assert s['params']['generation']['weights']['bunker-grid']==1 and s['params']['generation']['recipeParameters']['dune-sea']['height']==91
 print('PASS invalid request creates no save; typed random request launches the selected native maze',flush=True)
elif cmd in ['zone','maze']:
 recipe='dune-sea' if cmd=='zone' else 'bunker-grid'
 save(cmd+'-launch',call('engine_new_game',{'template':WORLD_ID,'name':'M10 2534 '+cmd+' acceptance','seed':2533410,'params':{'deploy':'yes','humans':0,'computers':2,'turnSeconds':30,'namesText':'2534 Ember\n2534 Mint','generation':{'recipe':recipe}}}))
 def ready():
  s=state()
  if s.get('error'):raise RuntimeError(s['error'])
  return s if s['match'] and s['match']['phase']=='ready' else None
 s=save(cmd+'-ready',wait(ready,120));print(json.dumps({'world':s['world'],'phase':s['match']['phase'],'roster':s['match']['roster']}),flush=True);pic(cmd+'-ready')
elif cmd=='state':
 s=save('live-state',state());print(json.dumps({k:s[k] for k in ['world','error','generation']}));print(json.dumps(s['match']['phase']))
elif cmd=='zone-audit':
 s=state();assert s['generation']['recipeId']=='dune-sea'
 r=script("""const m=talus.state.getJson('indigo.match'),points=[];
 const old=talus.camera.view.frame;talus.camera.frame(null);talus.camera.follow('off');
 for(let group=0;group<7;group++){
  const start=group*8,end=Math.min(50,start+8);if(start>=50)break;
  talus.camera.centerOn((start+end)*128,768);talus.sim.resume();await talus.sleepTicks(60);
  for(let col=start;col<end;col++)for(const dx of [1,128,254]){
    const x=col*256+dx;let top=null,material=null;
    for(let y=400;y<1024;y++){const e=talus.world.cell(x,y)?.element;if(e){top=y;material=e.name;break}}
    points.push({col,x,top,material,floor:talus.world.cell(x,1100)?.element?.name});
  }
 }
 if(old)talus.camera.frame(old.spec);talus.camera.centerOn(6400,640);talus.sim.pause();
 return {points,generation:talus.world.generation.status()};""",100)
 save('zone-corridor',r);assert len(r['points'])==150 and all(p['top'] is not None and p['top']<900 and p['floor']=='STONE' for p in r['points']),r
 print('PASS native hills and foundation at 150 samples across all 50 columns',flush=True)
elif cmd=='zone-source-audit':
 r=script("""talus.sim.pause();const rows=[];
 for(let col=0;col<50;col++)for(const dx of [1,128,254]){
  const x=col*256+dx;rows.push({col,x,top:await talus.world.findSurface(x,400,624),floor:await talus.world.findSurface(x,1100,1),bottom:await talus.world.findSurface(x,1279,1)});
 }
 const live=[];for(let x=5888;x<6912;x+=64){let maxAir=0,run=0,started=false,stone=0;
 for(let y=400;y<1024;y++){const el=talus.world.cell(x,y)?.element;if(el){started=true;run=0}else if(started){run++;maxAir=Math.max(run,maxAir)}}
 for(let y=1024;y<1280;y++)if(talus.world.cell(x,y)?.element?.name==='STONE')stone++;
 live.push({x,maxAir,stone});}
 return {rows,live,camera:talus.camera.view,roster:talus.state.getJson('indigo.match').roster.map(p=>talus.entities.get(p.entityId).snapshot())};""",90)
 save('zone-source-corridor',r)
 assert len(r['rows'])==150 and all(p['top'] is not None and 500<p['top']<800 and p['floor']==1100 and p['bottom']==1279 for p in r['rows'])
 assert all(p['maxAir']<64 and p['stone']==256 for p in r['live'])
 assert all(p['residency']=='live' for p in r['roster'])
 print('PASS all 50 source columns, real resident hills, no chunk bands, complete sampled foundation and both tanks resident',flush=True)
 call('engine_menu_input',{'action':'back'});pic('zone-hills')
elif cmd=='zone-crater':
 s=state();world=s['world'];assert s['match']['phase']=='ready'
 r=script("""const shape={x:6400,y:750,w:8,h:8};let before=0;
 for(let y=750;y<758;y++)for(let x=6400;x<6408;x++)if(talus.world.cell(x,y)?.element)before++;
 const receipt=await talus.world.terrainWork({kind:'excavate',shape,bounds:shape,replacement:'eligible',materials:['DIRT','SAND','STONE'].map(n=>({element:talus.elements.get(n).id,hardness:1})),budget:{cells:64,particles:64,work:64}});
 return {before,receipt,save:talus.game.saveStatus,params:talus.game.params,shop:talus.ui.get('shop')};""",30)
 save('zone-crater-before-reopen',r);assert r['before']==64 and r['receipt']['removed']==64 and r['save']['allowed']
 assert r['shop']['generation']==r['params']['generation']
 call('engine_continue_game',{'worldId':world});time.sleep(2)
 wait(lambda:state()['match']['phase']=='ready',90)
 r=script("""talus.sim.pause();let occupied=0,floor=0;for(let y=750;y<758;y++)for(let x=6400;x<6408;x++)if(talus.world.cell(x,y)?.element)occupied++;
 for(let y=1024;y<1280;y++)if(talus.world.cell(6400,y)?.element?.name==='STONE')floor++;
 return {occupied,floor,params:talus.game.params,generation:talus.world.generation.status(),error:talus.state.get('indigo.error')};""")
 save('zone-crater-after-reopen',r);assert r['occupied']==0 and r['floor']==256 and not r['error']
 print('PASS exact 64-cell intentional crater and foundation survive save/reopen; shop carries the typed request',flush=True)
elif cmd=='plan':
 s=state();m=s['match'];assert m['phase']=='ready'
 r=script("""talus.sim.pause();const m=talus.state.getJson('indigo.match');
 const a=talus.entities.get(m.roster[0].entityId),b=talus.entities.get(m.roster[1].entityId);
 const before=a.weapon.state;const plan=await a.weapon.plan({target:b.position,preferHighArc:true,maxCandidates:64,maxChunks:256,maxSeconds:20});
 return {a:{id:a.id,position:a.position},b:{id:b.id,position:b.position},before,after:a.weapon.state,plan};""",90)
 save('valley-plan',r);print(json.dumps(r),flush=True)
elif cmd=='battle':
 s=state();assert s['match']['phase']=='ready'
 save('battle-before',s)
 call('engine_menu_input',{'action':'back'});time.sleep(.2)
 call('engine_menu_input',{'action':'focus'});focus('Begin match');script('talus.sim.resume();return true')
 call('engine_menu_input',{'action':'confirm'})
 samples=[];last=None;end=time.monotonic()+90
 try:
  while time.monotonic()<end:
   r=script("""const m=talus.state.getJson('indigo.match');return {clock:talus.sim.clock,phase:m.phase,turn:m.turnNumber,error:talus.state.get('indigo.error'),speech:m.presentation.active,
   roster:m.roster.map(p=>({id:p.entityId,alive:!p.eliminated,live:talus.entities.get(p.entityId).isLive,position:talus.entities.get(p.entityId).position})),
   projectiles:talus.projectiles.find().map(p=>p.snapshot()),events:talus.state.getJson('indigo.events')};""",10)
   if r['error']:raise RuntimeError(r['error'])
   samples.append({k:v for k,v in r.items() if k!='events'})
   if (r['turn'],r['phase'])!=last:print(r['clock'],r['turn'],r['phase'],flush=True);last=(r['turn'],r['phase'])
   if any(not p['live'] for p in r['roster'] if p['alive']):raise AssertionError('Survivor parked')
   if any(e.get('kind')=='attack-resolved' or e.get('event')=='attack-resolved' for e in (r['events'] or [])):break
   if r['turn']>2:break
   time.sleep(.15)
 finally:
  script('talus.sim.pause();return true');save('battle-samples',samples);save('battle-after',state());pic('battle-after')
 print('Stopped bounded combat replay',flush=True)
elif cmd=='restore':
 rows=json.loads((D/'installed-baseline.json').read_text())['results'][0]['rows']
 save('restored',script('const baseline='+json.dumps({r[0]:json.loads(r[1]) for r in rows})+';for(const key of talus.installed.keys())if(!Object.hasOwn(baseline,key))talus.installed.delete(key);for(const [k,v]of Object.entries(baseline))talus.installed.set(k,v);return talus.installed.keys()'))
 call('engine_set_mode',{'mode':'menu','template':WORLD_ID});time.sleep(2);wait(lambda:menu('Menus/title.html'))
 now=save('installed-after',call('run_sql_readonly',{'sql':"SELECT key,value_json FROM installed_game_state WHERE game_id='"+WORLD_ID+"' ORDER BY key"}))
 assert rows==now['results'][0]['rows'],'Account strings differ'
 print('PASS exact account restoration',flush=True)
