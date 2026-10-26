"""Install M10 game-side presentation through the public Talus bridge.

Does not create games, spend wallets, change native engine files or enable
unimplemented equipment/persona behaviors. Run with the Indigo template open.
"""
import json
from bridge import ROOT, WORLD_ID, call

context = call('engine_describe_context', timeout=20)['world']
assert context['isEditorMode'] and context['templateId'] == WORLD_ID, context
paths = sorted((ROOT / 'world/Menus').glob('*')) + [
    ROOT / 'world/Game/shop.json', ROOT / 'world/Game/audio.json', ROOT / 'world/Game/arena.json', ROOT / 'world/Game/terrain-recipes.json', ROOT / 'world/Game/personas.json',
    ROOT / 'world/Game/persona-voices.json', ROOT / 'world/Game/input.json', ROOT / 'world/Graphs/cpu-turn.json', ROOT / 'world/Scripts/match.ts']
for path in paths:
    relative = path.relative_to(ROOT / 'world').as_posix()
    content = path.read_text()
    assert len(content.encode()) <= 1024 * 1024, relative
    call('write_world_file', {'worldId': WORLD_ID, 'path': relative, 'content': content}, timeout=30)
    print('Installed', relative, flush=True)
graph = json.loads((ROOT / 'world/Graphs/cpu-turn.json').read_text())
call('save_behavior_graph', {'graphId': json.loads((ROOT / 'world/Game/arena.json').read_text())['cpuGraph'],
    'graphName': 'Scorched Earth 2026 CPU turn', 'graphType': 'command', 'graphData': graph,
    'description': 'Shared persona survey, native aiming, presentation and fire stages.'})
controls = json.loads((ROOT / 'world/Game/input.json').read_text())
r = call('engine_run_script', {'source': 'const ui=await talus.editor.records.get("gameUi");Object.assign(ui,' + json.dumps(controls) + ');return await talus.editor.records.save("gameUi",ui)', 'timeoutMs': 10000}, timeout=20)
assert not r.get('error'), r
slots = json.loads((ROOT / 'world/Menus/menus.json').read_text())
source = 'for (const [slot,file] of Object.entries(' + json.dumps(slots) + ')) await talus.editor.layout.setMenu(slot,file); await talus.editor.save(); return true'
result = call('engine_run_script', {'source': source, 'timeoutMs': 10000}, timeout=20)
assert not result.get('error'), result
print('Saved menu slots and template:', result)
print('Script status:', json.dumps(call('engine_script_status', timeout=20)))
