"""Verify M2 authority/reload contracts in the currently loaded deployed game."""
import argparse
import json
import time
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--label', required=True)
a = p.parse_args()
output = ROOT / ('docs/evidence/m2-' + a.label + '-reload.json')
if output.exists():
    p.error('Choose a fresh label to preserve evidence')
report = {'checks': [], 'snapshots': {}}

def check(name, value):
    report['checks'].append({'name': name, 'passed': bool(value)})
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(('PASS ' if value else 'FAIL ') + name, flush=True)
    if not value:
        raise AssertionError(name)

def snapshot():
    status = call('engine_script_status', {'script': 'match'})
    value = script("return {worldId:talus.world.id,available:talus.editor.available,match:talus.state.getJson('indigo.match'),ui:talus.ui.get()}")
    return {'status': status, 'value': value}

def stable(s):
    return {'value': s['value'], 'generation': s['status']['generation'],
            'handlers': [x['handlers'] for x in s['status']['scripts']]}

before = snapshot()
report['snapshots']['before'] = before
game = before['value']['worldId']
check('deployed game has correct editor guard and six handlers',
      game != WORLD_ID and before['value']['available'] is False and
      before['value']['match']['phase'] == 'ready' and
      before['status']['scripts'][0]['handlers'] == 6)
source = call('read_world_file', {'worldId': WORLD_ID, 'path': 'Scripts/match.ts'})['content']
report['templateWrite'] = call('write_world_file', {'worldId': WORLD_ID, 'path': 'Scripts/match.ts', 'content': source})
time.sleep(2)
other = snapshot()
report['snapshots']['otherWorld'] = other
check('other-world HTTP write leaves generation handlers roster and UI unchanged', stable(other) == stable(before))
denied = script("""const out=[];for(const f of [()=>talus.editor.layout.describe(),()=>talus.editor.selectElement('STONE'),()=>talus.editor.save()]){
  try{await f();out.push('allowed')}catch(e){out.push(e.code)}}return out""")
report['editorRefusals'] = denied
check('editor operations refuse in game mode', denied == ['NO_EDITOR'] * 3)
source = call('read_world_file', {'worldId': game, 'path': 'Scripts/match.ts'})['content']
# generation counts whole-host loads, not targeted HTTP reloadScript calls.
# A persisted diagnostic entry count measures actual execution independently.
script("talus.state.set('indigo.validation.reloads',0)")
probe = source + "\ntalus.state.set('indigo.validation.reloads', Number(talus.state.get('indigo.validation.reloads')) + 1)\n"
try:
    report['activeWrite'] = call('write_world_file', {'worldId': game, 'path': 'Scripts/match.ts', 'content': probe})
    time.sleep(2)
    report['probeExecutions'] = script("return talus.state.get('indigo.validation.reloads')")
finally:
    call('write_world_file', {'worldId': game, 'path': 'Scripts/match.ts', 'content': source})
time.sleep(2)
after = snapshot()
report['snapshots']['activeWorld'] = after
check('active-world edit executes source exactly once', report['probeExecutions'] == 1)
check('active reload rebuilds six handlers and populated HUD', after['value']['available'] is False and
      after['status']['scripts'][0]['handlers'] == 6 and after['value']['ui']['ready'] is True)
check('active reload preserves exact roster and configuration', after['value']['match'] == before['value']['match'])
time.sleep(2)
settled = snapshot()
report['snapshots']['settled'] = settled
check('no reload loop or script fault', stable(settled) == stable(after) and not settled['status']['faulted'])
report['accepted'] = True
output.write_text(json.dumps(report, indent=2) + '\n')
