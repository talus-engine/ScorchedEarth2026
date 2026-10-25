"""Install M5's tank controller without modifying accepted M4 assets or terrain."""
import json
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script
from install_m1 import save_template

ctx=call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId']==WORLD_ID
controller=json.loads((ROOT/'assets/m5-controller.json').read_text())
ids=json.loads((ROOT/'assets/m4-ids.json').read_text())
ids['shell']=save_template('indigo/m5-shell','indigo/m4-shell',{'itemData':{'modSpec':{'projectile':{'independent':True}}}})
ids['cannon']=save_template('indigo/m5-cannon','indigo/m4-cannon',{'itemData':{'startingMods':['indigo/m5-shell']}})
ids['tank']=save_template('indigo/m5-tank','indigo/m4-tank',{
    'characterController':controller,'startingItems':['indigo/m5-cannon'],
    'description':'Indigo M5 tank: rough-ground step, slope and ground-following tuning.'})
(ROOT/'assets/m5-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
config=json.loads((ROOT/'world/Game/arena.json').read_text())
config['tankTemplate']=ids['tank']
(ROOT/'world/Game/arena.json').write_text(json.dumps(config,indent=2)+'\n')
for path in ['Game/arena.json','Menus/setup.html','Menus/hud.html','Scripts/match.ts']:
    call('write_world_file',{'worldId':WORLD_ID,'path':path,'content':(ROOT/'world'/path).read_text()})
print('saved',script('await talus.editor.save();return true'),flush=True)
