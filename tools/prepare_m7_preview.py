"""Update the existing ready user game, preserving its roster, terrain and scores."""
import base64
import json
from bridge import ROOT, call
from audit_m2 import script
from m4_support import wait_state

base = json.loads((ROOT / 'docs/evidence/m7-start.json').read_text())['value']
before = script("return {world:talus.world.id,match:talus.state.getJson('indigo.match'),preferences:talus.installed.get('indigo'),scores:talus.installed.get('indigo.scores')}")
assert before['world'] == base['world'] and before['match']['phase'] == 'ready'
assert before['preferences'] == base['preferences'] and before['scores'] == base['scores']
for path in ['Game/quips.json', 'Menus/hud.html', 'Scripts/match.ts']:
    call('write_world_file', {'worldId':base['world'], 'path':path, 'content':(ROOT / 'world' / path).read_text()})
ready = wait_state(lambda s:s['worldId']==base['world'] and s['match']['phase']=='ready' and s['ui'].get('speech') == [] and not s['error'])
window = call('engine_screenshot', {'format':'jpeg','maxWidth':400})['window']
call('engine_mouse', {'action':'click','x':window['width']//2,'y':window['height']//4})
saved = call('engine_key', {'key':'s','modifiers':['meta'],'settleMs':1800})
assert saved.get('focused') is True, saved
verification = script("""const q=JSON.parse(await talus.files.readText('Game/quips.json'));
return {world:talus.world.id,match:talus.state.getJson('indigo.match'),
  preferences:talus.installed.get('indigo'),scores:talus.installed.get('indigo.scores'),
  camera:talus.camera.view,paused:talus.sim.paused,error:talus.state.get('indigo.error'),
  speech:talus.ui.get('speech'),quipCounts:{shooting:q.shooting.length,death:q.death.length}}""")
assert verification['preferences'] == base['preferences'] and verification['scores'] == base['scores']
assert verification['world'] == base['world'] and verification['match']['phase'] == 'ready'
assert [p['entityId'] for p in verification['match']['roster']] == [p['entityId'] for p in base['match']['roster']]
assert not verification['error'] and not verification['paused'] and not verification['speech']
assert verification['camera']['zoom'] == .25
(ROOT / 'docs/evidence/m7-preview-ready.json').write_text(json.dumps(verification, indent=2) + '\n')
screen = call('engine_screenshot', {'format':'jpeg','maxWidth':1200})
(ROOT / 'docs/evidence/m7-preview-ready.jpg').write_bytes(base64.b64decode(screen['mcpImage']['data']))
print(json.dumps({'world':verification['world'],'names':[p['name'] for p in verification['match']['roster']], 'phase':'ready','quips':verification['quipCounts']}))
