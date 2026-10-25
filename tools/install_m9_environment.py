"""Bind the engine-generated parallax and native 90/10 weather to both arenas."""
import json
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script
assert call('engine_describe_context')['world']['isEditorMode']
bg=json.loads((ROOT/'assets/m9-background-result.json').read_text())['backgroundId']
source='''const weather={id:'indigo-distant-thunder-weather',name:'Indigo — passing rain',layers:[{weatherId:'weather_clear',chance:90},{weatherId:'weather_light_rain',chance:10}]};
await talus.editor.records.save('weatherSet',weather);
const out=[];
for(const start of [0,256]){const cells=[];for(let x=start;x<start+200;x++)for(let y=0;y<20;y++)cells.push({x,y});
out.push(await talus.editor.layout.paint(cells,{layer:'background',id:BACKGROUND}));
out.push(await talus.editor.layout.paint(cells,{layer:'weather',id:weather.id}));}
await talus.editor.save();return {background:BACKGROUND,weather,edits:out};'''.replace('BACKGROUND',json.dumps(bg))
result=script(source)
(ROOT/'assets/m9-environment-installed.json').write_text(json.dumps(result,indent=2)+'\n')
print(result)
