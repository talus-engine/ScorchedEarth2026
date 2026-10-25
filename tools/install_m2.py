"""Author Indigo's 50×5 arena and match setup through the Talus HTTP API."""
import json
import argparse
from pathlib import Path
from bridge import call, ROOT, WORLD_ID
from install_m1 import save_template

AREA = 'indigo-slate'


def script(source):
    result = call('engine_run_script', {'source': source, 'timeoutMs': 120000}, timeout=130)
    if result.get('error'):
        raise RuntimeError(result['error'])
    return result.get('value')


def make_palette():
    """Matching edge heights and a 64px central plateau on each surface tile."""
    tiles = [('sky', 'sky sky sky sky', None, 1), ('rock', 'rock rock rock rock', 'rock', 1)]
    for west in (64, 128, 192):
        for east in (64, 128, 192):
            for variation in (-16, 16):
                middle = (west + east) // 2 + variation
                tiles.append((f'ground-{west}-{east}-{variation+16}',
                              f'sky rock h{east} h{west}', (west, middle, east), 3 if west == east else 1))
    groups = []
    for index, (name, sockets, shape, weight) in enumerate(tiles):
        ox, oy = (index % 5) * 256, (index // 5) * 256
        content = ''
        if shape == 'rock':
            content = f'<rect x="{ox}" y="{oy}" width="256" height="256" talus:element="STONE"/>'
        elif shape is not None:
            west, middle, east = shape
            points = [(0, west), (96, middle), (160, middle), (256, east), (256, 256), (0, 256)]
            content = '<polygon talus:element="STONE" points="' + ' '.join(f'{ox+x},{oy+y}' for x,y in points) + '"/>'
        groups.append(f'<g class="wfc-tile" talus:tile="slate-{name}" talus:area="{AREA}" talus:size="4x4" talus:origin="{ox} {oy}" talus:sockets="{sockets}" talus:weight="{weight}">{content}</g>')
    groups.append(f'<g class="wfc-area" talus:area="{AREA}" talus:boundary="*" talus:chunkX0="0" talus:chunkY0="0" talus:chunkX1="199" talus:chunkY1="19"/>')
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:talus="https://talus.dev/ns/world" viewBox="0 0 1280 1024">' + '\n'.join(groups) + '</svg>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--files-only', action='store_true', help='Update authored files without touching the arena or assets')
    args = parser.parse_args()
    if args.files_only:
        for path in ['Menus/setup.html', 'Menus/hud.html', 'Scripts/match.ts']:
            call('write_world_file', {'worldId': WORLD_ID, 'path': path, 'content': (ROOT / 'world' / path).read_text()})
            print('updated template file', path, flush=True)
        return
    ctx = call('engine_describe_context')
    assert ctx['world']['isEditorMode'] and ctx['world']['templateId'] == WORLD_ID
    before = script('return {cells:await talus.editor.layout.cells(),menus:await talus.editor.layout.menus(),manifest:await talus.files.readText("Scripts/manifest.json")}')
    backup = ROOT / 'docs/evidence/m2-template-before.json'
    if not backup.exists():
        backup.write_text(json.dumps(before, indent=2) + '\n')
    other = [c for c in before['cells'] if c.get('areaId') not in ('indigo-m1', AREA)]
    assert not other, 'Unexpected authored cells: review them before replacing the diagnostic layout'

    shell = save_template('indigo/shell', 'indigo/m1-shell', {'description': 'Standard explosive shell; terrain carving and credited blast damage.'})
    cannon = save_template('indigo/cannon', 'indigo/m1-cannon', {'itemData': {'startingMods': ['indigo/shell']}})
    tank = save_template('indigo/tank', 'indigo/m1-tank', {'startingItems': ['indigo/cannon'], 'description': 'Indigo tank; turn logic owns control and aiming, blackboard owns player data.'})
    ids = {'tank': tank, 'cannon': cannon, 'shell': shell}
    (ROOT / 'assets/game-ids.json').write_text(json.dumps(ids, indent=2) + '\n')

    svg = make_palette()
    (ROOT / 'assets/slate-reach.svg').write_text(svg + '\n')
    # Replace only this project's diagnostic/game tile layer through the editor.
    if before['cells']:
        result = script('return await talus.editor.layout.erase(' + json.dumps([{'x': c['x'], 'y': c['y']} for c in before['cells']]) + ',"tiles")')
        print('replace old anchors', result, flush=True)
    terrain = call('import_wfc_tiles', {'svg': svg, 'tileSizeChunks': 4, 'interiorSocket': '*'}, timeout=180)
    (ROOT / 'docs/evidence/m2-terrain-import.json').write_text(json.dumps(terrain, indent=2) + '\n')
    assert terrain['tilesSaved'] == 20 and not terrain['bagProblems']
    assert not terrain['report']['unresolved'] and terrain['report']['fallbackCells'] == 0
    assert terrain['areas'][0]['anchors'] == 250 and not terrain['areas'][0]['skipped']
    assert all(i['tile'] == 'slate-sky' and i['problem'].startswith('no matter') for i in terrain['issues']), terrain['issues']
    print('20 tiles / 250 anchors; sky tile intentionally contains no matter', flush=True)
    # A single biome; row constraints provide sky, connected surface, and rock.
    # Copy/paste is the supported bulk layout editor path, with one undo entry.
    layout = script('''const cells=await talus.editor.layout.cells();
      const clip=await talus.editor.layout.copy(cells.map(c=>({x:c.x,y:c.y})));
      for(const entry of clip.entries){
        const row=entry.dy/4, column=entry.dx/4;
        let n='sky',s='sky',e='sky',w='sky';
        if(row===2){n='sky';s='rock';e=column===49?'h128':'h64|h128|h192';w=column===0?'h128':'h64|h128|h192';}
        if(row>2){n='rock';s='rock';e='rock';w='rock';}
        entry.cell.wfcSockets={north:n,south:s,east:e,west:w};
      }
      const result=await talus.editor.layout.paste(clip,{x:0,y:0},'replace');
      if(result.skipped.length)throw new Error(JSON.stringify(result.skipped));
      await talus.editor.layout.setParallelWorlds('none');
      await talus.editor.layout.setNewGameLocation({x:6400,y:540,playerTemplateId:null});
      await talus.editor.layout.setRules([]);
      await talus.editor.layout.setMetadata({description:'Indigo artillery — Slate Reach, a seeded 50 by 5 tile battlefield.'});
      return {result,cells:await talus.editor.layout.cells()};''')
    (ROOT / 'docs/evidence/m2-layout.json').write_text(json.dumps(layout, indent=2) + '\n')
    assert len(layout['cells']) == 250

    config = {'biome': {'id': 'slate-reach', 'name': 'Slate Reach', 'areaId': AREA},
              'tiles': {'width': 50, 'height': 5, 'chunksPerTile': 4},
              'bounds': {'x': 0, 'y': 0, 'w': 12800, 'h': 1280},
              'surfaceBand': {'top': 512, 'height': 256}, 'tankTemplate': tank,
              'maxPlayers': 16, 'maxStartingGapTiles': 9}
    (ROOT / 'world/Game').mkdir(parents=True, exist_ok=True)
    (ROOT / 'world/Game/arena.json').write_text(json.dumps(config, indent=2) + '\n')
    disabled = json.loads(before['manifest'] or '{"disabled":[]}')['disabled']
    manifest = {'disabled': sorted(set(disabled + ['m1']))}
    (ROOT / 'world/Scripts/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    files = ['Scripts/manifest.json', 'Game/arena.json', 'Menus/setup.html', 'Menus/hud.html', 'Scripts/match.ts']
    for path in files:
        call('write_world_file', {'worldId': WORLD_ID, 'path': path, 'content': (ROOT / 'world' / path).read_text()})
        print('installed', path, flush=True)
    print(script('''await talus.editor.layout.setMenu('title','Menus/setup.html');
      await talus.editor.layout.setMenu('gameStart',null);
      await talus.editor.layout.setMenu('hud','Menus/hud.html');
      return await talus.editor.layout.describe();'''))
    print('saving template', flush=True)
    print(script('await talus.editor.save(); return true'))


if __name__ == '__main__':
    main()
