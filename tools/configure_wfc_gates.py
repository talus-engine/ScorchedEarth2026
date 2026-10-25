"""Configure the existing Mixed Reach anchor guides through public layout APIs.

Only gate metadata changes. Unknown/unfinished anchors are preserved. The saved
JSON policy records solid-ground spans; union constraints show a labeled envelope.
"""
import argparse
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call


def script(source):
    result = call('engine_run_script', {'source': source, 'timeoutMs': 30000}, 35)
    if result.get('error'):
        raise RuntimeError(result['error'])
    return result['value']


def gate(socket, policy):
    parts = socket.split('|')
    if not all(part in policy['sockets'] for part in parts):
        return None
    spans = [policy['sockets'][part] for part in parts]
    result = {'a': min(p['a'] for p in spans), 'b': max(p['b'] for p in spans)}
    if len(parts) > 1:
        result['type'] = 'variable'
    return result


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--apply', action='store_true')
    options = args.parse_args()
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID
    policy = json.loads((ROOT / 'world/Game/wfc-gates.json').read_text())
    cells = script('return await talus.editor.layout.cells()')
    selected = [c for c in cells if c.get('type') == 'wfc' and c.get('areaId') == policy['areaId']
                and all(gate(v, policy) is not None for v in c.get('wfcSockets', {}).values())
                and len(c.get('wfcSockets', {})) == 4]
    assert {(c['x'], c['y']) for c in selected} == {(x, y) for x in range(0, 200, 4) for y in range(0, 20, 4)}, 'Review changed anchor layout first'
    intended = {(c['x'], c['y']): {side: gate(socket, policy) for side, socket in c['wfcSockets'].items()} for c in selected}
    for (x, y), gates in intended.items():
        for side, dx, dy, opposite in [('east', 4, 0, 'west'), ('south', 0, 4, 'north')]:
            neighbor = intended.get((x + dx, y + dy))
            if neighbor:
                assert gates[side] == neighbor[opposite], 'Facing bridge extents disagree'
    print(f'{len(selected)} anchors / {4 * len(selected)} gate pairs; {len([c for c in cells if c.get("type") == "wfc"]) - len(selected)} unknown anchors preserved')
    if not options.apply:
        return
    evidence = ROOT / 'docs/evidence/m11-wfc-gates'
    evidence.mkdir(exist_ok=True)
    backup = evidence / 'before-gate-apply.json'
    if backup.exists():
        raise RuntimeError('Apply evidence exists; inspect it before repeating')
    backup.write_text(json.dumps(selected, indent=2) + '\n')
    coords = [{'x': c['x'], 'y': c['y']} for c in selected]
    expected = json.dumps(selected)
    mappings = json.dumps([[x, y, gates] for (x, y), gates in intended.items()])
    # Recheck full selected records before writing. Copy preserves every other
    # placement field; WFC references remain shared, without forking tile rows.
    result = script('''const coords=COORDS,expected=EXPECTED;
const same=(a,b)=>a===b||(a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
const current=(await talus.editor.layout.cells()).filter(c=>coords.some(p=>p.x===c.x&&p.y===c.y));
if(!same(current,expected))throw new Error('Anchor data changed before apply');
const clip=await talus.editor.layout.copy(coords),gates=GATES;
for(const entry of clip.entries){const row=gates.find(([x,y])=>x===entry.dx&&y===entry.dy);if(!row)throw new Error('Unexpected clipboard origin');entry.cell.wfcGates=row[2];}
const result=await talus.editor.layout.paste(clip,{x:0,y:0},'replace');
if(result.skipped.length)throw new Error(JSON.stringify(result.skipped));
await talus.editor.save();return result;'''.replace('COORDS', json.dumps(coords)).replace('EXPECTED', expected).replace('GATES', mappings))
    after = script('return await talus.editor.layout.cells()')
    by_coord = {(c['x'], c['y']): c for c in after}
    for original in cells:
        actual = dict(by_coord[(original['x'], original['y'])])
        key = (original['x'], original['y'])
        if key in intended:
            assert actual.pop('wfcGates') == intended[key]
        assert actual == {k: v for k, v in original.items() if k != 'wfcGates' or key not in intended}, 'Non-gate metadata changed'
    assert len(after) == len(cells)
    (evidence / 'configured.json').write_text(json.dumps({'result': result, 'anchors': selected, 'gates': json.loads(mappings), 'nonGateDataUnchanged': True, 'facingPairsAligned': True}, indent=2) + '\n')
    print('Saved and verified gate-only changes; all other layout data unchanged')


if __name__ == '__main__':
    main()
