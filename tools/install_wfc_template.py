"""Install the reviewed square artist scaffold through native layout APIs.

One-time bootstrap. Refuses existing v2 origins to protect later artist paint.
Preserves all non-WFC metadata and the original palette. The old 33 invalid
anchors require the separately reviewed native checkpoint repair first.
"""
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call, script

EVIDENCE = ROOT/'docs/evidence/m12-wfc-template'


def run(source):
    result = script(source)
    if result.get('error'): raise RuntimeError(result['error'])
    return result['value']


def dump(name, obj):
    (EVIDENCE/name).write_text(json.dumps(obj, indent=2)+'\n')


def main():
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID
    manifest = json.loads((ROOT/'world/WFC/template.json').read_text())
    before = run('return {layout:await talus.editor.layout.describe(),cells:await talus.editor.layout.cells()}')
    assert not before['layout']['wfcIntegrity']['conflicts']
    anchors = [c for c in before['cells'] if c.get('type') == 'wfc']
    assert {(c['x'], c['y']) for c in anchors} == {(p['x'], p['y']) for p in manifest['placements']}
    assert all(c['areaId'] == 'indigo-mixed' and not c.get('wfcTileId') for c in anchors), 'Refuse overwriting authored origins'
    assert not (EVIDENCE/'before-install.json').exists(), 'Existing installation evidence; inspect before retry'
    dump('before-install.json', before)
    imported = call('import_wfc_tiles', {'svg': (ROOT/'world/WFC/bootstrap.svg').read_text(), 'tileSizeChunks': 4}, timeout=180)
    dump('import.json', imported)
    assert imported['tilesSaved'] == 24 and not imported['bagProblems']
    assert not imported['report']['unresolved'] and imported['report']['fallbackCells'] == 0
    assert all(i['tile'] == 'terra-v2-sky' and i['problem'].startswith('no matter') for i in imported['issues'])
    ids = {t['tile']: t['id'] for t in imported['tiles']}
    # Register the imported area's exact ID using a single existing footprint.
    # The one footprint is restored with the complete reviewed layout below.
    registration = call('import_wfc_tiles', {'svg': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:talus="https://talus.dev/ns/world"><g class="wfc-area" talus:area="'+manifest['areaId']+'" talus:chunkX0="0" talus:chunkY0="0" talus:chunkX1="3" talus:chunkY1="3" talus:boundary="sky"/></svg>', 'tileSizeChunks': 4})
    dump('area-registration.json', registration)
    assert registration['areas'][0]['anchors'] == 1 and not registration['areas'][0]['skipped']
    coords = [{'x': c['x'], 'y': c['y']} for c in anchors]
    source = '''const coords=COORDS,placements=PLACEMENTS,ids=IDS;
const clip=await talus.editor.layout.copy(coords);
for(const entry of clip.entries){
 const p=placements.find(p=>p.x===entry.dx&&p.y===entry.dy);if(!p)throw new Error('Unexpected clipboard coordinate');
 entry.cell.type='wfc';entry.cell.areaId=AREA;entry.cell.wfcSockets=p.sockets;entry.cell.wfcGates=p.gates;
 delete entry.cell.wfcTileId;delete entry.cell.wfcNonOrigin;
 if(p.origin)entry.cell.wfcTileId=ids[p.source];else entry.cell.wfcNonOrigin=true;
}
const changed=await talus.editor.layout.paste(clip,{x:0,y:0},'replace');
if(changed.skipped.length)throw new Error(JSON.stringify(changed.skipped));
await talus.editor.save();return changed;'''
    for key, value in [('COORDS', coords), ('PLACEMENTS', manifest['placements']), ('IDS', ids), ('AREA', manifest['areaId'])]:
        source = source.replace(key, json.dumps(value))
    changed = run(source)
    dump('installed.json', {'changed': changed, 'tileIds': ids, 'area': manifest['areaId']})
    after = run('return {layout:await talus.editor.layout.describe(),cells:await talus.editor.layout.cells()}')
    dump('after-install.json', after)
    by_coord = {(c['x'], c['y']): c for c in after['cells']}
    binding = {'type', 'areaId', 'wfcSockets', 'wfcGates', 'wfcTileId', 'wfcNonOrigin'}
    for c in before['cells']:
        other = by_coord[(c['x'], c['y'])]
        assert {k: v for k, v in c.items() if k not in binding} == {k: v for k, v in other.items() if k not in binding}
    assert len(after['cells']) == len(before['cells'])
    assert after['layout']['wfcIntegrity'] == {'anchors': 250, 'conflicts': [], 'tileSize': 4, 'truncated': False}
    for p in manifest['placements']:
        c = by_coord[(p['x'], p['y'])]
        assert c['wfcGates'] == p['gates'] and c['wfcSockets'] == p['sockets']
        assert bool(c.get('wfcTileId')) == p['origin']
        if p['origin']: assert c['wfcTileId'] == ids[p['source']]
    for rel in ['WFC/template.json', 'WFC/bootstrap.svg', 'WFC/artist-sheet.svg', 'WFC/README.md', 'Game/wfc-gates.json', 'Game/arena.json', 'Game/terrain-recipes.json']:
        call('write_world_file', {'worldId': WORLD_ID, 'path': rel, 'content': (ROOT/'world'/rel).read_text()})
    print('Saved250 square anchors,24 reusable origins,1000 exact native gate pairs; other cell data unchanged.')


if __name__ == '__main__':
    main()
