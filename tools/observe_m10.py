"""Bounded read-only CPU acceptance observation, without profile copies."""
import base64
import json
from pathlib import Path
import time
import os
from bridge import ROOT, call

dest = ROOT / os.environ.get('M10_EVIDENCE', 'docs/evidence/m10')
dest.mkdir(parents=True, exist_ok=True)
end = time.monotonic() + 45
last = None
samples = []
while time.monotonic() < end:
    source = '''const m=talus.state.getJson('indigo.match');return {world:talus.world.id,paused:talus.sim.paused,
    phase:m?.phase,turn:m?.turnNumber,remaining:m?.remaining,error:talus.state.get('indigo.error'),
    winner:m?.winner,humans:m?.humans,roster:m?.roster.map(p=>({name:p.name,alive:!p.eliminated,kills:p.kills,cash:p.cashEarned})),
    cards:talus.ui.get('arcadeCards'),speech:m?.presentation.active,events:talus.state.getJson('indigo.events')}'''
    r = call('engine_run_script', {'source': source, 'timeoutMs': 5000}, timeout=10)
    if r.get('error'):
        raise RuntimeError(r['error'])
    state = r['value']
    key = (state.get('phase'), state.get('turn'))
    if key != last:
        print(json.dumps({k: state.get(k) for k in ['phase', 'turn', 'winner', 'error']}), flush=True)
        last = key
    card = (state.get('cards') or [None])[0]
    kind = ('score-card' if 'COMPLETE' in card['eyebrow'] else 'incoming-card') if card else ('speech' if state.get('speech') else state.get('phase'))
    if kind in ['score-card','incoming-card','speech','finished'] and not (dest / (kind + '.jpg')).exists():
        pic = call('engine_screenshot', {'format': 'jpeg', 'maxWidth': 1200}, timeout=10)
        (dest / (kind + '.jpg')).write_bytes(base64.b64decode(pic['mcpImage']['data']))
    samples.append({k: state.get(k) for k in ['phase', 'turn', 'remaining', 'cards']})
    (dest / 'live-latest.json').write_text(json.dumps(state, indent=2) + '\n')
    if state.get('phase') in ['finished','fault']:
        break
    time.sleep(.25)
out = dest / 'samples.json'
previous = json.loads(out.read_text()) if out.exists() else []
out.write_text(json.dumps((previous + samples)[-600:], indent=2) + '\n')
print('Saved bounded M10 observation', flush=True)
