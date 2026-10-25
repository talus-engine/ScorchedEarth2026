"""Fresh-game control for the post-patch chunk (50,10) terrain failure."""
import json
import time
import sys
from bridge import call, ROOT, WORLD_ID
from replay_m1 import matter, digest, script

out = ROOT / 'docs/evidence/m1-2494-fresh-terrain-control.json'
report = {'templateId': WORLD_ID, 'checks': []}


def save():
    out.write_text(json.dumps(report, indent=2) + '\n')


def ready(world=None, previous=None):
    end = time.monotonic() + 90
    while time.monotonic() < end:
        try:
            c = call('engine_describe_context')['world']
            if c['engineBooted'] and not c['isEditorMode'] and c['worldId'] != previous and (world is None or c['worldId'] == world):
                return c['worldId']
        except RuntimeError as e:
            if not any(s in str(e) for s in ['HTTP 502:', 'HTTP 503:', 'page still booting']):
                raise
        time.sleep(0.5)
    raise TimeoutError('Game did not load')


def inspect(label):
    rows = matter(3136, 3328)
    missing = {}
    for iy, runs in enumerate(rows):
        x = 3136
        for material, count in runs:
            if material == 0:
                for px in range(x, x + count):
                    key = f'{px // 64},{(640 + iy) // 64}'
                    missing[key] = missing.get(key, 0) + 1
            x += count
    result = {'label': label, 'missing': missing, 'sha256': digest(rows), 'rows': rows}
    report['checks'].append(result)
    save()
    print(label + ': ' + json.dumps(missing), flush=True)


def move(x):
    script(f'talus.camera.follow("off");talus.camera.centerOn({x},640);return true')
    end = time.monotonic() + 60
    while time.monotonic() < end:
        points = call('engine_sample_points', {'points': [{'x': x, 'y': 672}, {'x': x - 96, 'y': 736}, {'x': x + 96, 'y': 736}]})
        if all(p['resident'] for p in points['samples']):
            time.sleep(1)
            return
        time.sleep(0.5)
    raise TimeoutError('Camera region did not become resident')


if __name__ == '__main__':
    previous = json.loads((ROOT/'docs/evidence/m1-2494-replay.json').read_text())['worldId']
    report['combatWorldId'] = previous
    if '--resume-control' not in sys.argv:
        call('engine_new_game', {'template': WORLD_ID, 'name': 'Indigo M1 — terrain control 2494', 'seed': 1729})
    report['controlWorldId'] = ready(previous=previous)
    save()
    move(3200)
    inspect('fresh game, before shots or round trips')
    for i in range(3):
        move(400)
        move(3200)
        inspect('camera-only round trip ' + str(i + 1))
    call('engine_continue_game', {'worldId': previous})
    time.sleep(1)
    ready(world=previous)
    move(3200)
    inspect('original combat save reopened')
    print('Control complete; original combat save returned to affected ground.', flush=True)
