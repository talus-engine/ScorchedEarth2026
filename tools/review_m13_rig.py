"""Manual, bounded native rig review. Run only during an agreed GAME UI lease.

Each invocation performs one stage: setup, ready (resume a setup wait), view,
platform, spawn, capture, right, left, stop, thrust, release, or close. No stage
starts a match or changes installed accounts. Close returns to the original
editor and compares all four raw account keys; it NEVER restores changed keys.

Example after native prototype installation and UI handoff:
  python3 tools/review_m13_rig.py setup --run-dir docs/evidence/m13-rig --lease-confirmed
  python3 tools/review_m13_rig.py view --run-dir docs/evidence/m13-rig --x 600 --y 470 --zoom 3 --lease-confirmed
  python3 tools/review_m13_rig.py platform --run-dir docs/evidence/m13-rig --x 600 --y 500 --lease-confirmed
  python3 tools/review_m13_rig.py spawn --run-dir docs/evidence/m13-rig --lease-confirmed
  python3 tools/review_m13_rig.py right --run-dir docs/evidence/m13-rig --lease-confirmed
  python3 tools/review_m13_rig.py close --run-dir docs/evidence/m13-rig --lease-confirmed
"""
import argparse
import json
import math
from pathlib import Path
import time
from datetime import datetime, timezone
import uuid

from bridge import ROOT, WORLD_ID, call
from accept_m10_series import KEYS, installed, screenshot, write


def native(source, seconds=15):
    result = call('engine_run_script', {'source': source, 'timeoutMs': seconds * 1000}, seconds + 5)
    if result.get('ok') is False:
        raise RuntimeError(result.get('error') or 'Native script refused')
    return result['value']


def read_run(root):
    run = json.loads((root / 'run.json').read_text())
    assert not run.get('closed'), 'This diagnostic is closed; use a fresh evidence directory'
    return run


def guard(run):
    return ('if(talus.game.params?.m13ReviewRun!==' + json.dumps(run['nonce'])
            + '||talus.state.getJson("indigo.match")!==null)throw Error("Not the isolated no-match rig review");'
            + ('if(talus.world.id!==' + json.dumps(run['world']) + ')throw Error("Diagnostic world changed");'
               if run.get('world') else ''))


PRESENT = """let sub;try{await new Promise(resolve=>{let n=0;sub=talus.on('tick.frame',()=>{if(++n>=2)resolve(true)})})}
finally{if(sub!==undefined)talus.off(sub)};"""


def snapshot_source(run):
    return guard(run) + 'const e=' + ("talus.entities.get(" + json.dumps(run['entity']) + ")" if run.get('entity') else 'null') + """;
return {world:talus.world.id,clock:talus.sim.clock,paused:talus.sim.paused,match:talus.state.getJson('indigo.match'),
error:talus.state.get('indigo.error'),camera:talus.camera.view,tracking:talus.camera.tracking,
entity:e?.snapshot()??null,controller:e?.isLive&&!e.isFrozen?e.controller.state:null,
groundDrive:e?.isLive&&!e.isFrozen?e.controller.groundDrive:null};"""


def capture(root, run, name):
    assert name and all(c.isalnum() or c in '-_' for c in name), 'Use a simple evidence label'
    native(guard(run) + PRESENT + 'return true;')
    evidence = {'state': native(snapshot_source(run)), 'helpers': {}}
    for method, args in [('listRigidBodies', []), ('templateBodies', [run['prototype']])]:
        try:
            evidence['helpers'][method] = call('engine_test_helper', {'method': method, 'args': args}, 20)
        except RuntimeError as exc:
            # These are optional official diagnostics, not an excuse to lose
            # the actual public snapshot/screenshot if a build refuses them.
            evidence['helpers'][method] = {'refused': str(exc)}
    evidence['installedExactRawEquality'] = installed() == run['baseline']
    write(root / (name + '-state.json'), evidence)
    screenshot(root, name)
    assert evidence['installedExactRawEquality'], 'Installed account keys changed; evidence retained, no restoration performed'
    return evidence


def wait_ready(root, run):
    deadline = time.monotonic() + 45
    last = None
    while time.monotonic() < deadline:
        try:
            context = call('engine_describe_context')['world']
            if context.get('engineBooted') and not context['isEditorMode']:
                s = native("return {world:talus.world.id,nonce:talus.game.params?.m13ReviewRun,match:talus.state.getJson('indigo.match'),"
                           "setup:talus.ui.get('installed.indigo'),error:talus.state.get('indigo.error')};")
                last = s
                if s.get('nonce') != run['nonce']:
                    # Navigation briefly exposes the previous page's params.
                    # Wait without mutating it; attach only to our exact nonce.
                    time.sleep(.3)
                    continue
                assert s['match'] is None, 'Diagnostic unexpectedly created a match'
                assert not s.get('error'), s['error']
                if s.get('setup') is not None:
                    run['world'] = s['world']
                    run['stage'] = 'setup-ready'
                    write(root / 'run.json', run)
                    native(guard(run) + "talus.ui.closeMenu();talus.ui.hud(null);talus.sim.pause();return true;")
                    capture(root, run, 'setup')
                    return
        except RuntimeError as exc:
            if not any(word in str(exc) for word in ('boot', 'NO_ENGINE', 'HTTP 502', 'HTTP 503', 'no app page')):
                raise
            last = str(exc)
        time.sleep(.3)
    write(root / 'setup-wait.json', {'timeout': True, 'last': last})
    raise TimeoutError('Setup did not become ready in 45s; inspect, then use ready without creating another game')


def setup(root, seed):
    assert not (root / 'run.json').exists(), 'Baseline already captured; use ready, never create a second game'
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID and context.get('engineBooted'), 'Start from the quiet original Indigo editor'
    prototype = json.loads((ROOT / 'assets/m13/tank-install.json').read_text())['prototype']
    assert prototype.get('nativeReadback'), 'Install/read back the owned prototype first'
    baseline = installed()
    assert set(baseline) == set(KEYS), 'Inspect missing installed keys before creating a diagnostic'
    run = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'nonce': str(uuid.uuid4()),
           'template': WORLD_ID, 'prototype': prototype['templateId'], 'baseline': baseline,
           'world': None, 'entity': None, 'closed': False, 'stage': 'launch-requested', 'seed': seed}
    with (root / 'run.json').open('x') as stream:
        json.dump(run, stream, indent=2)
    result = call('engine_new_game', {'template': WORLD_ID, 'name': 'M13 isolated rig ' + run['nonce'][:8],
                                    'seed': seed, 'params': {'deploy': 'no', 'generation': {'recipe': 'wfc'},
                                                          'm13ReviewRun': run['nonce']}}, 20)
    write(root / 'launch.json', result)
    wait_ready(root, run)


def view(root, run, x, y, zoom):
    assert all(math.isfinite(v) for v in (x, y, zoom)) and .1 <= zoom <= 8
    result = native(guard(run) + "talus.sim.pause();talus.camera.follow('off');talus.camera.frame(null);"
                    + f"talus.camera.setZoom({zoom});talus.camera.centerOn({x},{y});" + PRESENT
                    + 'return talus.camera.view;')
    write(root / 'view.json', result)
    capture(root, run, 'view')


def platform(root, run, x, y, width):
    assert all(math.isfinite(v) for v in (x, y, width)) and 120 <= width <= 480
    assert not run.get('platformAttempted'), 'Platform was already attempted; inspect its receipt instead of duplicating it'
    run['platformAttempted'] = {'x': x, 'y': y, 'width': width}
    write(root / 'run.json', run)
    spec = {'kind': 'vector', 'catalog': 'procedural-m11', 'seed': run['seed'],
            'shape': {'x': x - width / 2 - 2, 'y': y - 2, 'w': width + 4, 'h': 12},
            'bounds': {'x': x - width / 2 - 2, 'y': y - 2, 'w': width + 4, 'h': 12},
            'replacement': 'empty', 'targetLayer': 'world', 'layerPolicy': 'active-only',
            'budget': {'cells': 20000, 'particles': 20000, 'work': 40000},
            'placement': {'offsets': [{'x': 0, 'y': 0}], 'maxChecks': 10000},
            'vector': {'geometry': {'kind': 'vector', 'id': 'builtin:square', 'center': {'x': x, 'y': y + 4},
                                    'width': width, 'height': 8, 'rotationDeg': 0},
                       'fill': {'kind': 'element', 'element': 'STONE'},
                       'output': {'kind': 'body', 'name': 'M13 review platform', 'maxBodies': 1, 'isStatic': True}}}
    result = native(guard(run) + 'talus.sim.pause();return await talus.world.terrainWork(' + json.dumps(spec) + ');', 30)
    write(root / 'platform-receipt.json', result)
    assert result['status'] == 'completed', 'Native platform placement refused; no terrain erased, inspect receipt/choose another fresh fixture'
    run['platform'] = run['platformAttempted']
    write(root / 'run.json', run)
    capture(root, run, 'platform')


def spawn(root, run, x, y):
    assert run.get('platform') and not run.get('spawnAttempted'), 'Create platform first; never duplicate a spawn attempt'
    x = run['platform']['x'] if x is None else x
    y = run['platform']['y'] - 48 if y is None else y
    assert math.isfinite(x) and math.isfinite(y)
    run['spawnAttempted'] = {'x': x, 'y': y}
    write(root / 'run.json', run)
    result = native(guard(run) + 'const e=await talus.entities.spawn(' + json.dumps(run['prototype']) + f',{x},{y});'
                    + "if(!e)throw Error('Native prototype spawn refused');return {id:e.id,snapshot:e.snapshot()};", 20)
    write(root / 'spawn-receipt.json', result)
    run['entity'] = result['id']
    run['stage'] = 'spawned'
    write(root / 'run.json', run)
    capture(root, run, 'spawn')


def action(root, run, name):
    assert run.get('entity'), 'Spawn the owned prototype first'
    source = guard(run) + 'const e=talus.entities.get(' + json.dumps(run['entity']) + ");if(!e?.isLive||e.isFrozen)throw Error('Prototype is not ready/live');"
    source += """const receipts=[];const check=(label,r)=>{receipts.push({label,...r});if(!r.accepted)throw Error(label+': '+r.reason);return r};
const snap=()=>({clock:talus.sim.clock,pose:e.snapshot(),controller:e.controller.state,drive:e.controller.groundDrive});
const before=snap();let during;try{
"""
    if name in ('right', 'left'):
        direction = 1 if name == 'right' else -1
        source += "check('configure-ground',e.controller.configureGroundDrive({capacity:10,speed:55}));"
        source += "if((e.controller.groundDrive?.fuel??0)<2)check('ground-fuel',e.controller.addGroundFuel(3));"
        source += f"check('drive',e.controller.drive({direction}));"
    elif name == 'thrust':
        source += "if((e.controller.state?.fuel??0)<2)check('jet-fuel',e.controller.addFuel(3));check('thrust',e.controller.levitate(true));"
    elif name == 'release':
        source += "check('release-thrust',e.controller.levitate(false));"
    elif name == 'stop':
        source += "if(e.controller.groundDrive)check('stop-drive',e.controller.drive(0));check('stop-thrust',e.controller.levitate(false));"
    else:
        raise ValueError('Unsupported manual action')
    source += """talus.sim.resume();await talus.sleepTicks(60);during=snap();
}finally{talus.sim.pause();if(e.isLive&&!e.isFrozen){
if(e.controller.groundDrive)receipts.push({label:'cleanup-drive',...e.controller.drive(0)});
receipts.push({label:'cleanup-thrust',...e.controller.levitate(false)});}}
return {before,during,after:snap(),receipts};"""
    result = native(source, 15)
    write(root / (name + '-action.json'), result)
    capture(root, run, name)
    assert all(r['accepted'] for r in result['receipts']), 'A native action/cleanup refused; inspect retained receipt'


def close(root, run):
    context = call('engine_describe_context')['world']
    if not context['isEditorMode']:
        native(guard(run) + "talus.sim.pause();talus.ui.closeMenu();talus.ui.hud(null);return true;")
        call('engine_set_mode', {'mode': 'editor', 'template': WORLD_ID}, 20)
    else:
        assert context['templateId'] == WORLD_ID, 'Different editor owns the UI'
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        context = call('engine_describe_context')['world']
        if context.get('engineBooted') and context['isEditorMode'] and context['templateId'] == WORLD_ID:
            break
        time.sleep(.3)
    else:
        raise TimeoutError('Original editor did not become ready; baseline retained, no restoration performed')
    current = installed()
    changed = [k for k in KEYS if current.get(k) != run['baseline'].get(k)]
    write(root / 'close.json', {'originalEditor': context, 'installedExactRawEquality': not changed,
                               'changedKeys': changed, 'currentRaw': current, 'restorationAttempted': False})
    run['closed'] = True
    run['stage'] = 'closed-exact' if not changed else 'closed-account-difference'
    write(root / 'run.json', run)
    assert not changed, 'Account keys differ: ' + ', '.join(changed) + '; reported only, no restoration performed'
    print('Original editor restored; all four raw installed keys unchanged. No account writes/restoration.')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('stage', choices=('setup', 'ready', 'view', 'platform', 'spawn', 'capture', 'right', 'left', 'stop', 'thrust', 'release', 'close'))
    p.add_argument('--run-dir', type=Path, required=True)
    p.add_argument('--lease-confirmed', action='store_true', help='Caller confirms the agreed GAME UI lease is active')
    p.add_argument('--x', type=float)
    p.add_argument('--y', type=float)
    p.add_argument('--width', type=float, default=320)
    p.add_argument('--zoom', type=float, default=3)
    p.add_argument('--seed', type=int, default=13001)
    p.add_argument('--name', default='manual')
    a = p.parse_args()
    assert a.lease_confirmed, 'Run only after the explicit engine/GAME UI handoff; this helper never acquires a lease'
    a.run_dir.mkdir(parents=True, exist_ok=True)
    try:
        if a.stage == 'setup':
            setup(a.run_dir, a.seed)
            return
        run = read_run(a.run_dir)
        if a.stage == 'ready': wait_ready(a.run_dir, run)
        elif a.stage == 'view': view(a.run_dir, run, 600 if a.x is None else a.x, 470 if a.y is None else a.y, a.zoom)
        elif a.stage == 'platform': platform(a.run_dir, run, 600 if a.x is None else a.x, 500 if a.y is None else a.y, a.width)
        elif a.stage == 'spawn': spawn(a.run_dir, run, a.x, a.y)
        elif a.stage == 'capture': capture(a.run_dir, run, a.name)
        elif a.stage == 'close': close(a.run_dir, run)
        else: action(a.run_dir, run, a.stage)
    except Exception as exc:
        write(a.run_dir / (a.stage + '-error.json'), {'stage': a.stage, 'error': str(exc), 'noAccountRestoration': True})
        raise


if __name__ == '__main__':
    main()
