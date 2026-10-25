import json,time
from bridge import ROOT,call
from audit_m2 import script
for _ in range(100):
 try:
  r=script('return {editor:talus.editor.available,id:talus.world.id,ready:!!talus.ui.get().installed,match:talus.state.getJson("indigo.match")}')
  if not r['editor'] and r['ready'] and not r['match']:break
 except RuntimeError:pass
 time.sleep(.2)
else:raise TimeoutError('Material diagnostic world did not load')
source='''talus.ui.closeMenu();talus.camera.frame(null);talus.camera.follow('off');talus.camera.centerOn({x:6400,y:400});await talus.sleepTicks(15);
const bounds={x:5800,y:0,w:1400,h:512};
const recipe=element=>({id:'m9-probe-'+element,name:element,description:'Physical acceptance probe',tags:['probe'],macro:{mode:'volumetric',support:'none',strata:[{element,thickness:[1,1]}]},micro:{noise:{algorithm:'value',frequency:.05,octaves:1,persistence:.5,lacunarity:2}}});
const put=async(element,shape)=>{const cells='radius'in shape?shape.radius**2*4:shape.w*shape.h;return await talus.world.terrainWork({kind:'recipe',shape,bounds,replacement:'empty',budget:{cells,particles:cells,work:cells},recipe:recipe(element),seed:9024})};
const count=rect=>{const out={};for(let y=rect.y;y<rect.y+rect.h;y++)for(let x=rect.x;x<rect.x+rect.w;x++){const el=talus.world.cell(x,y)?.element?.name||'EMPTY';out[el]=(out[el]||0)+1}return out};
const writes=[];
writes.push(await put('STONE',{x:6000,y:452,w:512,h:8}));
writes.push(await put('WOOD',{x:6072,y:420,w:16,h:16}));
const woodBefore=count({x:6072,y:420,w:16,h:16});
writes.push(await put('FIRE',{x:6076,y:437,w:8,h:8}));
const fireTemperature=talus.world.temperature({x:6076,y:437,w:8,h:8});
writes.push(await put('STONE',{x:6200,y:436,w:32,h:16}));
const stoneBefore=count({x:6200,y:436,w:32,h:16});
writes.push(await put('HYDROCHLORIC_ACID',{x:6204,y:420,w:24,h:12}));
writes.push(await put('LAVA',{x:6320,y:424,w:16,h:16}));
const lavaTemperature=talus.world.temperature({x:6320,y:424,w:16,h:16});
writes.push(await put('LIQUID_NITROGEN',{x:6420,y:424,w:16,h:16}));
const nitrogenTemperature=talus.world.temperature({x:6420,y:424,w:16,h:16});
const largeFire=await put('FIRE',{x:6660,y:220,radius:96});
const largeTemperature=talus.world.temperature({x:6564,y:124,w:192,h:192});
await talus.sleepTicks(180);
return {world:talus.world.id,writes,woodBefore,woodAfter:count({x:6060,y:410,w:40,h:42}),stoneBefore,stoneAfter:count({x:6200,y:436,w:32,h:16}),fireTemperature,lavaTemperature,nitrogenTemperature,largeFire,largeTemperature};'''
(ROOT/'artifacts/m9-material-probe.ts').write_text(source)
result=script(source);(ROOT/'docs/evidence/m9-material-probe.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result),flush=True)
