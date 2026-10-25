"""Install dialogue/UI content through public HTTP, preserving M6 combat assets."""
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script

ctx = call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId'] == WORLD_ID
for path in ['Game/quips.json', 'Menus/hud.html', 'Scripts/match.ts']:
    call('write_world_file', {'worldId': WORLD_ID, 'path': path, 'content': (ROOT / 'world' / path).read_text()})
print('saved', script('await talus.editor.save();return true'), flush=True)
