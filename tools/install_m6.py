"""Install M6 death chaos through public HTTP; preserve accepted M5 assets."""
import json
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script
from install_m1 import save_template

ctx=call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId']==WORLD_ID
ids=json.loads((ROOT/'assets/m5-ids.json').read_text())
ids['tank']=save_template('indigo/m6-tank','indigo/m5-tank',{
    'ragdollOnDeath':True,'finalFrameCorpseOnDeath':False,
    'description':'Indigo M6 tank: concurrent seeded death chaos; M5 rough-ground controller.'})
(ROOT/'assets/m6-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
config=json.loads((ROOT/'world/Game/arena.json').read_text())
config['tankTemplate']=ids['tank']
(ROOT/'world/Game/arena.json').write_text(json.dumps(config,indent=2)+'\n')
for path in ['Game/arena.json','Game/chaos.json','Game/quips.json','Menus/setup.html','Menus/hud.html','Scripts/match.ts']:
    call('write_world_file',{'worldId':WORLD_ID,'path':path,'content':(ROOT/'world'/path).read_text()})
print('saved',script('await talus.editor.save();return true'),flush=True)
