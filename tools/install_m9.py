"""Install M9 game content through the public engine authoring APIs."""
import json,time
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script
from install_m1 import save_template
ctx=call('engine_describe_context')['world'];assert ctx['isEditorMode'] and ctx['templateId']==WORLD_ID
assert script('return talus.editor.available && talus.world.id === '+json.dumps(WORLD_ID))
shop=json.loads((ROOT/'world/Game/shop.json').read_text())
ids={'weapons':{}}
materials=script('return Object.fromEntries(["IRON","FIRE","SMOKE"].map(name=>[name,talus.elements.get(name)?.id]))')
for item in shop['items']:
    if item['kind']!='weapon' or not item['enabled']:continue
    if item.get('template') and item['id'] in json.loads((ROOT/'assets/m9-ids.json').read_text()).get('weapons',{}):
        ids['weapons'][item['id']]=item['template'];continue
    name='indigo/m9-'+item['id'];projectile=dict(item['projectile']);projectile['elementType']=materials[projectile.pop('material','IRON')]
    if 'trailMaterial' in projectile:projectile['trailElementType']=materials[projectile.pop('trailMaterial')]
    mod=save_template(name+'-shell','indigo/m5-shell',{'itemData':{'modSpec':{'projectile':projectile}}})
    weapon=save_template(name,'indigo/m5-cannon',{'itemData':{'startingMods':[name+'-shell'],'weaponBaseStats':{'castDelay':0,'rechargeTime':0,'spread':0}},'description':item['description']})
    item['template']=weapon;item['modTemplate']=mod;ids['weapons'][item['id']]=weapon
    (ROOT/'world/Game/shop.json').write_text(json.dumps(shop,indent=2)+'\n')
    (ROOT/'assets/m9-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
ids['tank']=save_template('indigo/m9-tank','indigo/m8-tank',{'startingItems':list(ids['weapons'].values()),'dropInventoryOnDeath':False,'description':'M9 artillery tank: finite native utilities, persistent armory without physical death loot, retained wreck for three-second last words, best-effort initial placement and voluntary native flip.'})
(ROOT/'assets/m9-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
arena=json.loads((ROOT/'world/Game/arena.json').read_text());arena['tankTemplate']=ids['tank'];(ROOT/'world/Game/arena.json').write_text(json.dumps(arena,indent=2)+'\n')
for path in ['Game/input.json','Game/arena.json','Game/chaos.json','Game/quips.json','Game/shop.json','Game/generation.json','Menus/setup.html','Menus/hud.html','Menus/shop.html','Scripts/match.ts']:
    call('write_world_file',{'worldId':WORLD_ID,'path':path,'content':(ROOT/'world'/path).read_text()})
print('saved',script('await talus.editor.save();return true'),flush=True)
