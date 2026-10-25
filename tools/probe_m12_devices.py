"""Physical native device probe in an explicit, fresh no-match diagnostic world."""
import argparse
import json
from pathlib import Path
from bridge import call, script
from accept_m10_series import screenshot, write

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--run-dir',required=True,type=Path)
a=p.parse_args();root=a.run_dir
ledger=json.loads((root/'run.json').read_text());assert not ledger['restored']
w=call('engine_describe_context')['world']
assert not w['isEditorMode'] and w.get('engineBooted'),w
world=w['worldId'];assert world!=ledger['template']
assert script("return talus.state.getJson('indigo.match')===null;")['value'], 'No-match device harness required'
if world not in ledger['observedWorlds']:ledger['observedWorlds'].append(world);write(root/'run.json',ledger)
source=r'''
if(talus.world.id!==WORLD || talus.state.getJson('indigo.match'))throw Error('Wrong diagnostic');
talus.ui.closeMenu();talus.sim.pause();talus.camera.follow('off');talus.camera.frame(null);talus.camera.setZoom(.5);talus.camera.centerOn(33152,128);
const bounds={x:32768,y:0,w:768,h:256},receipts=[];
const put=async(label,element,x,y,w=1,h=1)=>{
 const shape={x:x-2,y:y-2,w:w+4,h:h+4},cells=shape.w*shape.h;
 const r=await talus.world.terrainWork({kind:'vector',catalog:'procedural-m11',shape,bounds,replacement:'empty',targetLayer:'world',layerPolicy:'active-only',seed:7361,
 budget:{cells,particles:cells,work:cells},vector:{geometry:{kind:'vector',id:'builtin:square',center:{x:x+w/2,y:y+h/2},width:w,height:h,rotationDeg:0},fill:{kind:'element',element},output:{kind:'particles'}}});
 receipts.push({label,element,x,y,w,h,receipt:r});if(r.status!=='completed')throw Error(label+': '+r.reason);return r;
};
const defs=[['water','TERRA_WATER_SOURCE','WATER',12],['oil','TERRA_OIL_SOURCE','CRUDE_OIL',30],['fire','TERRA_FIRE_SOURCE','FIRE',12],['lava','TERRA_LAVA_SOURCE','LAVA',60]];
const panels=[];
for(let i=0;i<defs.length;i++){
 const [id,device,material,period]=defs[i],x=32800+i*128,y=128;
 await put(id+' floor','STONE',x-28,y+48,56,6);await put(id+' left','STONE',x-28,y-20,6,68);await put(id+' right','STONE',x+22,y-20,6,68);
 const r=await put(id+' source',device,x,y);if(r.accepted!==1)throw Error('Device must be exactly one cell: '+id+'/'+r.accepted);
 panels.push({id,device,material,period,x,y});
}
const drain={x:33360,y:160};
await put('drain fixture floor','STONE',drain.x-12,drain.y+5,24,4);
await put('drain fixture solid','STONE',drain.x-4,drain.y,1,1);
await put('drain fixture powder','SAND',drain.x+4,drain.y,1,1);
await put('drain fixture water','WATER',drain.x,drain.y-3,1,1);
await put('liquid drain','TERRA_LIQUID_DRAIN',drain.x,drain.y);
const scan=()=>panels.map(p=>{const counts={};for(let y=32;y<182;y++)for(let x=p.x-30;x<p.x+30;x++){const n=talus.world.cell(x,y)?.element?.name;if(n)counts[n]=(counts[n]||0)+1}return {...p,counts}});
const scanDrain=()=>{const counts={};for(let y=drain.y-8;y<drain.y+9;y++)for(let x=drain.x-12;x<drain.x+12;x++){const n=talus.world.cell(x,y)?.element?.name;if(n)counts[n]=(counts[n]||0)+1}return counts};
const before={clock:talus.sim.clock,panels:scan(),drain:scanDrain()};
talus.sim.resume();await talus.sleepTicks(180);talus.sim.pause();
const after={clock:talus.sim.clock,panels:scan(),drain:scanDrain()};
const checks={oneDeviceEach:after.panels.every(p=>p.counts[p.device]===1),water:after.panels[0].counts.WATER>0,oil:after.panels[1].counts.CRUDE_OIL>0,fire:after.panels[2].counts.FIRE>0,lava:after.panels[3].counts.LAVA>0,drainsWater:before.drain.WATER===1&&!after.drain.WATER,preservesSolid:after.drain.STONE===before.drain.STONE,preservesPowder:after.drain.SAND===before.drain.SAND};
return {world:talus.world.id,receipts,before,after,checks,save:talus.game.saveStatus};
'''.replace('WORLD',json.dumps(world),1)
result=script(source,90);write(root/'device-physical-initial.json',result)
# Synchronous world.cell uses the resident CPU snapshot. Ask the public native
# sampler for fresh GPU-backed cells before judging moving material counts.
points=[{'x':x,'y':y} for x in (32790,32820,32918,32948,33046,33076,33174,33204,33350,33370) for y in (40,100,150,176)]
fresh=call('engine_sample_points',{'points':points,'layer':'foreground'})
write(root/'device-freshness.json',fresh)
readback=script("const panels=[];for(const x of [32800,32928,33056,33184]){const counts={};for(let y=32;y<182;y++)for(let xx=x-30;xx<x+30;xx++){const n=talus.world.cell(xx,y)?.element?.name;if(n)counts[n]=(counts[n]||0)+1}panels.push(counts)}const drain={};for(let y=152;y<169;y++)for(let x=33348;x<33372;x++){const n=talus.world.cell(x,y)?.element?.name;if(n)drain[n]=(drain[n]||0)+1}return {clock:talus.sim.clock,panels,drain};")['value']
v=result['value'];v['freshReadback']=readback;c=v['checks']
for i,(name,material) in enumerate([('water','WATER'),('oil','CRUDE_OIL'),('fire','FIRE'),('lava','LAVA')]):c[name]=readback['panels'][i].get(material,0)>0
c['drainsWater']=v['before']['drain'].get('WATER')==1 and readback['drain'].get('WATER',0)==0
c['preservesPowder']=readback['drain'].get('SAND',0)==v['before']['drain'].get('SAND',0)
c['preservesSolid']=readback['drain'].get('STONE',0)==v['before']['drain'].get('STONE',0)
write(root/'device-physical.json',result)
print(json.dumps(c),flush=True)
screenshot(root,'native-devices')
assert all(result['value']['checks'].values()), 'Inspect physical device evidence'
