"""Install final title files and destructible native emitter materials in Indigo.

Requires the root editor. Does not Save/rewrite the older Title child working
copy; its explicit source refresh is coordinated with ENGINE.
"""
import hashlib
import json
from bridge import ROOT, WORLD_ID, call, script

context=call('engine_describe_context')['world']
assert context['isEditorMode'] and context['templateId']==WORLD_ID, 'Open Indigo root first'
defs=json.loads((ROOT/'world/Game/title-emitters.json').read_text())['devices']
result=script('''
const defs=DEFS, out=[];
for(const d of defs){
 const fields=JSON.parse(JSON.stringify(d.fields));
 fields.params.emitElement=talus.elements.get(d.emits).id;
 fields.highTemperatureTransition=talus.elements.get("FIRE").id;
 let e=talus.elements.get(d.name);
 const validation=await (e||talus.elements.get(d.basedOn)).validate(fields);
 if(!validation.ok)throw Error(JSON.stringify(validation));
 if(!e)e=await talus.elements.create({name:d.name,basedOn:d.basedOn,fields});
 const saved=JSON.parse(await e.exportJson());
 for(const [key,value] of Object.entries(fields)){
  if(key==='params'){for(const [k,v] of Object.entries(value))if(saved.params?.[k]!==v)throw Error(d.name+'.params.'+k);}
  else if(!(value===null && saved[key]==null) && JSON.stringify(saved[key])!==JSON.stringify(value))throw Error(d.name+'.'+key);
 }
 out.push({name:d.name,id:e.id,emits:d.emits});
}return out;
'''.replace('DEFS',json.dumps(defs)),60)
assert not result.get('error'),result
paths=['Game/title-logo-pattern.js','Game/title-logo.json','Game/title-emitters.json','Menus/Scenes/title.json','Menus/title.html','Menus/arcade.css']
receipts=[]
for path in paths:
    text=(ROOT/'world'/path).read_text()
    call('write_world_file',{'worldId':WORLD_ID,'path':path,'content':text})
    assert call('read_world_file',{'worldId':WORLD_ID,'path':path})['content']==text
    receipts.append({'path':path,'sha256':hashlib.sha256(text.encode()).hexdigest(),'readback':True})
validation=call('engine_menu_scene',{'worldId':WORLD_ID,'scene':'menu:title','action':'validate'})
saved=script('await talus.editor.save();return true;')
assert saved['value'] is True,saved
receipt={'elements':result['value'],'files':receipts,'validation':validation,'rootSaved':True,'titleChildRefreshPending':True}
(ROOT/'docs/evidence/m14-game/title/final-install.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
