"""Survey actual paused terrain-only saves. Never starts an account-bearing match."""
import argparse
import json
import time
from pathlib import Path
from bridge import ROOT, WORLD_ID, call, script

EVIDENCE = ROOT/'docs/evidence/m12-wfc-template'


def ready():
    for _ in range(100):
        try:
            c = call('engine_describe_context')['world']
            # Context's templateId is editor-only; game saves identify by worldId.
            if c['engineBooted'] and not c['isEditorMode'] and c['worldId']:
                return
        except RuntimeError as error:
            if 'boot' not in str(error) and 'page connection lost' not in str(error): raise
        time.sleep(.2)
    raise RuntimeError('Game never became ready')


def survey(label):
    ready()
    state = script("return {world:talus.world.id,seed:talus.world.seed,clock:talus.sim.clock,match:talus.state.getJson('indigo.match')};")['value']
    assert state['match'] is None, 'Refuse operating a live match'
    games = call('engine_list_games')
    assert any(g.get('templateId') == WORLD_ID and any(s['worldId'] == state['world'] for s in g.get('saves', [])) for g in games['games']), 'Unexpected game template'
    script("talus.sim.pause();talus.ui.closeMenu();talus.camera.follow('off');talus.camera.setZoom(.25);")
    manifest = json.loads((ROOT/'world/WFC/template.json').read_text())
    surface = [p for p in manifest['placements'] if p['y'] == 8]
    batches, heights = [], []
    for start in range(0, 50, 5):
        call('engine_camera', {'center': {'x': (start+2.5)*256, 'y': 640}})
        # Resident chunks can still await their first simulation upload when
        # panning a paused game. Survey actual running-game materialization.
        script('talus.sim.resume();await talus.sleepTicks(60);talus.sim.pause();')
        points, expected = [], []
        for col in range(start, start+5):
            p = surface[col]
            if col > 0:
                h = int(p['sockets']['west'][1:])
                for dx in (-1, 0):
                    # Loose surface grains may move after native physics runs;
                    # exact initial per-pixel seams are checked in the asset test.
                    for dy in (-8, 8):
                        points.append({'x': col*256+dx, 'y': 512+h+dy})
                        expected.append(dy > 0)
            for y in (1030, 1200):
                points.append({'x': col*256+128, 'y': y});expected.append('STONE')
            points.append({'x': col*256+128, 'y': 200});expected.append(False)
            for y in range(24, 249, 8):
                points.append({'x': col*256+128, 'y': 512+y});expected.append(None)
        for attempt in range(100):
            samples = call('engine_sample_points', {'points': points, 'layer':'foreground'})['samples']
            if all(s['resident'] for s in samples): break
            time.sleep(.2)
        else: raise RuntimeError('Native chunks did not become resident')
        violations, surface_changes = [], []
        for s, e in zip(samples, expected):
            if e is None: continue
            passed = s['name'] == e if isinstance(e, str) else bool(s['name']) == e
            if not passed:
                # Running loose matter need not remain at its authored pixel.
                # Keep every discrepancy; only solid foundation is invariant.
                (violations if isinstance(e, str) else surface_changes).append({'sample':s,'expected':e})
        for col in range(start, start+5):
            column = [s for s,e in zip(samples,expected) if e is None and s['x']==col*256+128]
            filled = [s['y'] for s in column if s['name']]
            heights.append(min(filled) if filled else None)
        batches.append({'startColumn':start,'samples':samples,'violations':violations,'surfaceChanges':surface_changes})
        print(label, 'columns', start, 'through', start+4, 'foundation failures',len(violations),'surface changes',len(surface_changes),flush=True)
    result = {**state,'surfaceCenterHeights':heights,'batches':batches,
              'violations':sum(len(b['violations']) for b in batches),
              'surfaceChanges':sum(len(b['surfaceChanges']) for b in batches)}
    (EVIDENCE/(label+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    assert not result['violations'], 'Read retained native evidence before proceeding'
    assert all(h is not None for h in heights), 'Missing surface tile'
    return result


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('label');a=p.parse_args();survey(a.label)
