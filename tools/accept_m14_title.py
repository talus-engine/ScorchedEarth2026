"""Bounded readback of the mounted native title: colors, materials and emission.

Run only during GAME's app lease, with Indigo's authored title already open.
Mutates only this ephemeral menu scene; no project files, terrain or accounts.
"""
import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path

from PIL import Image
from bridge import ROOT, WORLD_ID, call
from accept_m10_series import screenshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    def scene(action, **extra):
        reply = call('engine_menu_scene', {'worldId': WORLD_ID, 'scene': 'menu:title',
                                          'action': action, **extra}, 60)
        return reply['result']

    status = scene('status')
    for _ in range(20):
        if status['views'] > 0 and status.get('imageSeeds'):
            break
        time.sleep(.5)
        status = scene('status')
    assert status['views'] > 0 and not status.get('error'), 'Open the native title first'
    spec = json.loads((ROOT / 'world/Menus/Scenes/title.json').read_text())['particleImages'][0]
    seed = next(row['seed'] for row in status['imageSeeds'] if row['file'] == spec['file'])
    pattern = json.loads(subprocess.check_output(
        ['node', str(ROOT / 'tools/title_logo_pattern.cjs')],
        input=json.dumps({'width': spec['width'], 'height': spec['height'], 'seed': seed}), text=True))
    image = Image.open(ROOT / 'world' / spec['file']).convert('RGBA')
    expected = []
    for slot, material in enumerate(pattern['materials']):
        candidates = []
        for y in range(spec['height']):
            for x in range(spec['width']):
                r, g, b, a = image.getpixel((x, y))
                if a > 0 and pattern['indices'][y * spec['width'] + x] == slot:
                    candidates.append({'x': x + spec['x'], 'y': y + spec['y'],
                                       'element': material, 'rgb': r | g << 8 | b << 16})
        assert candidates, 'No occupied pixels for ' + material
        expected.extend(candidates[len(candidates) * n // 5] for n in (1, 2, 3, 4))

    scene('pause')
    try:
        scene('reset')  # Retains this visit's prepared image/seed and paused state.
        before = scene('sample', points=[{'x': p['x'], 'y': p['y']} for p in expected])
        for want, actual in zip(expected, before['points'], strict=True):
            assert actual['count'] == 1, (want, actual)
            pixel = actual['particles'][0]
            assert pixel['element'] == want['element'] and pixel['rgb'] == want['rgb'], (want, actual)
        screenshot(args.output, 'title-initial')
        scene('step', ticks=120)
        after = scene('sample')
        screenshot(args.output, 'title-emitting')
        receipt = {'seed': seed, 'imageSha256': hashlib.sha256((ROOT / 'world' / spec['file']).read_bytes()).hexdigest(),
                   'exactColorAndMaterialSamples': expected, 'before': before, 'after120Ticks': after,
                   'projectWrites': False, 'accountWrites': False}
        (args.output / 'title-particles.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({'seed': seed, 'exactSamples': len(expected), 'before': before['counts'],
                          'after120Ticks': after['counts']}), flush=True)
        assert after['counts'].get('FIRE', 0) > 0, 'Fire emitters produced no FIRE in 120 ticks'
        # Water/gas patches start embedded in wood. Their outlets open as the
        # logo burns, so do not require emission during the first two seconds.
        assert after['counts'].get('DYNAMITE', 0) == before['counts'].get('DYNAMITE', 0), 'Core ignited before the wood shell burned inward'
    finally:
        scene('resume')


if __name__ == '__main__':
    main()
