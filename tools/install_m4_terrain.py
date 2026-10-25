"""Install noise-mixed surface/interior and a full bottom row of stone."""
import json
import time
from bridge import ROOT, WORLD_ID, call
from install_m2 import script

ctx=call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId']==WORLD_ID
before=script('return await talus.editor.layout.cells()')
backup=ROOT/'docs/evidence/m4-terrain-before.json'
if not backup.exists(): backup.write_text(json.dumps(before,indent=2)+'\n')
assert all(c.get('areaId') in ('indigo-slate','indigo-mixed') for c in before)
script('return await talus.editor.layout.erase('+json.dumps([{'x':c['x'],'y':c['y']} for c in before])+',"tiles")')
result=call('import_wfc_tiles',{'svg':(ROOT/'assets/mixed-reach.svg').read_text(),'tileSizeChunks':4,'interiorSocket':'*'},timeout=180)
(ROOT/'docs/evidence/m4-terrain-import.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['tilesSaved']==24 and not result['bagProblems'],result
assert not result['report']['unresolved'] and result['report']['fallbackCells']==0
assert all(i['tile']=='mixed-sky' and i['problem'].startswith('no matter')for i in result['issues'])
assert result['areas'][0]['anchors']==250 and not result['areas'][0]['skipped']
print('Imported 24 tiles / 250 anchors',flush=True)
layout=script('''const cells=await talus.editor.layout.cells();
const clip=await talus.editor.layout.copy(cells.map(c=>({x:c.x,y:c.y})));
for(const entry of clip.entries){
 const row=entry.dy/4,col=entry.dx/4;
 let north='sky',south='sky',east='sky',west='sky';
 if(row===2){south='mixed';east=col===49?'h128':'h64|h128|h192';west=col===0?'h128':'h64|h128|h192';}
 if(row===3){north='mixed';south='bedrock';east='mixed';west='mixed';}
 if(row===4){north='bedrock';south='bedrock';east='bedrock';west='bedrock';}
 entry.cell.wfcSockets={north,south,east,west};
}
const result=await talus.editor.layout.paste(clip,{x:0,y:0},'replace');
if(result.skipped.length)throw new Error(JSON.stringify(result.skipped));
await talus.editor.layout.setMetadata({description:'Indigo artillery — Mixed Reach, a seeded 50 by 5 tile battlefield. Dirt and sand with stone pockets over a solid stone bottom row.'});
talus.camera.centerOn({x:6400,y:768});
await talus.editor.save();return {result};''')
# Saving refreshes the live layout session asynchronously; wait for readback.
for attempt in range(30):
 layout.update(script('return {description:await talus.editor.layout.describe(),cells:await talus.editor.layout.cells()};'))
 if len(layout['cells'])==250:break
 time.sleep(.2)
(ROOT/'docs/evidence/m4-mixed-layout.json').write_text(json.dumps(layout,indent=2)+'\n')
assert len(layout['cells'])==250
config=json.loads((ROOT/'world/Game/arena.json').read_text())
config['biome']={'id':'mixed-reach','name':'Mixed Reach','areaId':'indigo-mixed'}
config['terrain']={'brushRecipe':'indigo-mixed-earth','materials':['DIRT','SAND','STONE'],'solidBottomTileRow':4}
(ROOT/'world/Game/arena.json').write_text(json.dumps(config,indent=2)+'\n')
for path in ['Game/arena.json','Menus/setup.html','Menus/hud.html','Scripts/match.ts']:
 call('write_world_file',{'worldId':WORLD_ID,'path':path,'content':(ROOT/'world'/path).read_text()})
print('Saved mixed terrain with solid stone from y=1024 through y=1279',flush=True)
