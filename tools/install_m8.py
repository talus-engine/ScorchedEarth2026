"""Author purchasable weapons and install M8 through Talus public HTTP."""
import json
import time
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script
from install_m1 import save_template

ctx = call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId'] == WORLD_ID
# Editor identity appears before script/installed-state binding finishes.
# Compare public reads with durable values before authoring. JSON text preserves
# fractional fuel precision through the inspector's formatted object response.
keys=['indigo','indigo.scores','indigo.economy','indigo.dialogue']
rows=call('run_sql_readonly',{'sql':"SELECT key,value_json FROM installed_game_state WHERE game_id='"+WORLD_ID+"' AND key IN ('indigo','indigo.scores','indigo.economy','indigo.dialogue')"})['results'][0]['rows']
expected={key:None for key in keys};expected.update({key:json.loads(value) for key,value in rows})
deadline=time.monotonic()+120
while time.monotonic()<deadline:
    try:
        ready=script('return {editor:talus.editor.available,world:talus.world.id,valuesJson:JSON.stringify(Object.fromEntries('+json.dumps(keys)+'.map(k=>[k,talus.installed.get(k)])))}')
        context=call('engine_describe_context')['world']
        if context.get('worldId')==WORLD_ID and context.get('isEditorMode') and ready.get('editor') and ready.get('world')==WORLD_ID and json.loads(ready.get('valuesJson','null'))==expected:break
    except RuntimeError:pass
    time.sleep(.5)
else:raise TimeoutError('Editor scripts and installed state did not become ready; no writes performed')
# The page DB port completes its own authoring transition after the engine.
# An explicit pre-write refusal is safe to retry; do this before other edits.
controls = json.loads((ROOT/'world/Game/input.json').read_text())
deadline=time.monotonic()+120
while True:
    try:
        print('input',script('const ui=await talus.editor.records.get("gameUi");Object.assign(ui,'+json.dumps(controls)+');return await talus.editor.records.save("gameUi",ui)'),flush=True)
        break
    except RuntimeError as error:
        if 'template-authoring mode is OFF' not in str(error) or time.monotonic()>=deadline:raise
        context=call('engine_describe_context')['world']
        if not context.get('isEditorMode') or context.get('templateId')!=WORLD_ID:raise
        time.sleep(.5)
shop = json.loads((ROOT/'world/Game/shop.json').read_text())
ids = json.loads((ROOT/'assets/m6-ids.json').read_text())
ids['weapons'] = {'standard':ids['cannon']}
for item in shop['items']:
    if not item['enabled'] or item['kind'] != 'weapon' or item['id'] == 'standard': continue
    name = 'indigo/m8-' + item['id']
    mod = save_template(name+'-shell', 'indigo/m5-shell', {'itemData':{'modSpec':{'projectile':item['projectile']}}})
    weapon = save_template(name, 'indigo/m5-cannon', {'itemData':{'startingMods':[name+'-shell']},'description':item['description']})
    item['template'] = weapon; item['modTemplate'] = mod; ids['weapons'][item['id']] = weapon
ids['tank'] = save_template('indigo/m8-tank','indigo/m6-tank', {
    'startingItems':list(ids['weapons'].values()),
    'characterController':next(i for i in shop['items'] if i['id']=='jetpack')['controller'],
    'description':'M8 artillery tank. Weapon platforms carry zero paid ammo until purchased; M5 controller and M6 wreck behavior.'})
(ROOT/'assets/m8-ids.json').write_text(json.dumps(ids,indent=2)+'\n')
(ROOT/'world/Game/shop.json').write_text(json.dumps(shop,indent=2)+'\n')
arena = json.loads((ROOT/'world/Game/arena.json').read_text()); arena['tankTemplate'] = ids['tank']
(ROOT/'world/Game/arena.json').write_text(json.dumps(arena,indent=2)+'\n')
for path in ['Game/input.json','Game/arena.json','Game/chaos.json','Game/quips.json','Game/shop.json','Menus/setup.html','Menus/hud.html','Menus/shop.html','Scripts/match.ts']:
    call('write_world_file', {'worldId':WORLD_ID,'path':path,'content':(ROOT/'world'/path).read_text()})
print('saved',script('await talus.editor.save();return true'),flush=True)
