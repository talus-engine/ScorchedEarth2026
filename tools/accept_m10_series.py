"""Fresh, bounded CPU-series evidence; launch and advance rounds through the UI.

Each run has an explicit evidence directory and unique diagnostic-name prefix.
Capture before playing. Restore refuses changed original accounts or unexpected
matches; it never reads the historical M10 completion baseline.
"""
import argparse
import base64
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from bridge import WORLD_ID, call

KEYS = ('indigo', 'indigo.scores', 'indigo.economy', 'indigo.dialogue')
SQL = ("SELECT key,value_json FROM installed_game_state WHERE game_id='" + WORLD_ID
       + "' AND key IN ('indigo','indigo.scores','indigo.economy','indigo.dialogue')")


def script(source):
    return call('engine_run_script', {'source': source, 'timeoutMs': 10000}, 15)['value']


def installed():
    return dict(call('run_sql_readonly', {'sql': SQL})['results'][0]['rows'])


def write(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def capture(root, prefix):
    baseline = installed()
    assert set(baseline) == set(KEYS), 'Inspect missing installed keys before testing'
    for key in ('indigo.scores', 'indigo.economy'):
        assert not any(n.startswith(prefix.casefold()) for n in json.loads(baseline[key]).get('players', {})), 'Use a new diagnostic prefix'
    run = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'template': WORLD_ID,
           'prefix': prefix, 'baseline': baseline, 'observedWorlds': [], 'restored': False,
           'gamesBefore': call('engine_list_games', {})}
    with (root / 'run.json').open('x') as stream:
        json.dump(run, stream, indent=2)
    print('Captured a fresh exact baseline; no game created.', flush=True)


def read_state():
    return script("""const m=talus.state.getJson('indigo.match');
return {world:talus.world.id,clock:talus.sim.clock,paused:talus.sim.paused,
error:talus.state.get('indigo.error'),match:m,events:talus.state.getJson('indigo.events'),
save:talus.game.saveStatus,camera:talus.camera.view,
live:m?.roster.filter(p=>!p.eliminated).map(p=>({id:p.entityId,
live:p.entityId ? talus.entities.get(p.entityId)?.isLive : false,
residency:p.entityId ? talus.entities.get(p.entityId)?.residency : null,
liveId:p.entityId ? talus.entities.get(p.entityId)?.liveId : null,
health:p.entityId ? talus.entities.get(p.entityId)?.health : null,
position:p.entityId ? talus.entities.get(p.entityId)?.position : null}))};""")


def observe(root, seconds):
    run = json.loads((root / 'run.json').read_text())
    assert not run['restored'], 'This run is already closed; capture a new baseline'
    s = read_state()
    m = s['match']
    assert m and all(p['control'] == 'cpu' and p['name'].casefold().startswith(run['prefix'].casefold()) for p in m['roster']), 'Refusing a non-diagnostic or human match'
    if s['world'] not in run['observedWorlds']:
        run['observedWorlds'].append(s['world'])
        write(root / 'run.json', run)
    name = 'round-' + str(m['round']) + '-' + s['world']
    write(root / (name + '-initial.json'), s)
    write(root / (name + '-installed-initial.json'), installed())
    end = time.monotonic() + seconds
    samples, events, last, fault = [], {}, None, None
    while True:
        s = read_state()
        assert s['world'] == run['observedWorlds'][-1], 'Session changed during observation'
        m = s['match']
        key = (m['turnNumber'], m['phase'])
        if key != last:
            print('round', m['round'], 'turn', *key, 'alive', len(s['live']), flush=True)
            last = key
        for event in s.get('events') or []:
            events[json.dumps(event, sort_keys=True)] = event
        samples.append({k: s[k] for k in ('clock', 'paused', 'live')})
        samples[-1].update(phase=m['phase'], turn=m['turnNumber'])
        fault = s.get('error') or (m['message'] if m['phase'] == 'fault' else None)
        # Stored/unresolved living tanks are valid under the M12 camera policy.
        # Retain residency evidence; the match's explicit faults remain decisive.
        if fault or m['phase'] == 'finished' or time.monotonic() >= end:
            break
        time.sleep(1)
    write(root / (name + '-final.json'), s)
    write(root / (name + '-events.json'), list(events.values())[-12000:])
    write(root / (name + '-samples.json'), samples[-1200:])
    summary = {'world': s['world'], 'round': m['round'], 'phase': m['phase'],
               'turns': m['turnNumber'], 'winner': m.get('winner'), 'series': m.get('series'),
               'recipe': m['generation'], 'seed': m['seed'], 'fault': fault,
               'roster': [{k: p.get(k) for k in ('name', 'personaId', 'kills', 'shots', 'hits', 'damage', 'cashEarned', 'tactic')} for p in m['roster']]}
    write(root / (name + '-summary.json'), summary)
    write(root / 'installed-latest.json', installed())
    print(json.dumps(summary), flush=True)
    if fault:
        raise RuntimeError(fault)


def screenshot(root, name):
    assert name and all(c.isalnum() or c in '-_' for c in name)
    menu = call('engine_menu_input')
    shot = call('engine_screenshot', {'format': 'jpeg', 'maxWidth': 1400})
    image = shot.pop('mcpImage')
    (root / (name + '.jpg')).write_bytes(base64.b64decode(image['data']))
    write(root / (name + '.json'), {'capture': shot, 'menu': menu})
    print(json.dumps({'image': str(root / (name + '.jpg')), 'window': shot.get('window')}))


def camera_trace(root, seconds, name):
    """Read presented-frame camera motion; never drive the camera or the game."""
    assert 1 <= seconds <= 30 and name and all(c.isalnum() or c in '-_' for c in name)
    run = json.loads((root / 'run.json').read_text())
    assert not run['restored'], 'Capture a fresh diagnostic baseline first'
    state = read_state()
    assert state['match'] and all(p['control'] == 'cpu' and p['name'].casefold().startswith(run['prefix'].casefold())
                                  for p in state['match']['roster']), 'Refusing a non-diagnostic or human match'
    if state['world'] not in run['observedWorlds']:
        run['observedWorlds'].append(state['world'])
        write(root / 'run.json', run)
    source = """const world = talus.world.id, frames = [], rosterFrames = []; let elapsed = 0;
let subscription;
try {
  await new Promise((resolve, reject) => {
    subscription = talus.on('tick.frame', e => {
      try {
        if (talus.world.id !== world) throw new Error('World changed during camera trace');
        const m = talus.state.getJson('indigo.match'), view = talus.camera.view, tracking = talus.camera.tracking;
        elapsed += Math.max(0, Number(e.dt) || 0);
        const v = view.viewport;
        frames.push([elapsed,e.dt,talus.sim.clock,talus.sim.paused,v.x,v.y,v.w,v.h,!!view.frame,
          tracking?.id,tracking?.phase,tracking?.ready,tracking?.distance,m?.phase,m?.turnNumber,m?.presentation?.active?.stage]);
        if (frames.length % 15 === 1) rosterFrames.push({time:elapsed,
          roster:m?.roster.map(p=>{const s=p.entityId?talus.entities.get(p.entityId)?.snapshot():null;
            return {id:p.entityId,eliminated:p.eliminated,residency:s?.residency,
              liveId:s?.liveId,x:s?.x,y:s?.y,health:s?.health}})});
        if (elapsed >= DURATION || frames.length >= 3600) resolve(true);
      } catch (error) { reject(error) }
    });
  });
} finally { if (subscription !== undefined) talus.off(subscription) }
return {world,elapsed,frames,rosterFrames,events:talus.state.getJson('indigo.events')};""".replace('DURATION', str(seconds))
    try:
        result = call('engine_run_script', {'source': source, 'timeoutMs': (seconds + 10) * 1000}, seconds + 15)
    except Exception as error:
        write(root / (name + '-error.json'), {'error': str(error), 'secondsRequested': seconds})
        raise
    if not result.get('ok'):
        write(root / (name + '-error.json'), result)
        raise RuntimeError(result.get('error') or 'Camera trace failed')
    data = result['value']
    # Compact bridge transport; expand only after returning to the diagnostic host.
    data['frames'] = [{'time': f[0], 'dt': f[1], 'clock': f[2], 'paused': f[3],
                       'view': {'viewport': dict(zip(('x', 'y', 'w', 'h'), f[4:8])), 'frame': {'active': True} if f[8] else None},
                       'tracking': {'id': f[9], 'phase': f[10], 'ready': f[11], 'distance': f[12]} if f[9] is not None else None,
                       'phase': f[13], 'turn': f[14], 'cue': f[15] if len(f) > 15 else None}
                      for f in data['frames']]
    write(root / (name + '-frames.json'), data)
    steps, focus_steps, speeds = [], {}, []
    for a, b in zip(data['frames'], data['frames'][1:]):
        av, bv = a['view']['viewport'], b['view']['viewport']
        step = math.hypot(bv['x'] + bv['w'] / 2 - av['x'] - av['w'] / 2,
                          bv['y'] + bv['h'] / 2 - av['y'] - av['h'] / 2)
        steps.append(step)
        if b['dt'] > 0:
            speeds.append(step / b['dt'])
        if b['phase'] == 'focusing' and (b['turn'] or 0) > 1:
            focus_steps.setdefault(b['turn'], []).append(step)
    summary = {'world': data['world'], 'frames': len(data['frames']), 'seconds': data['elapsed'],
               'maxWorldStep': max(steps, default=0), 'totalWorldTravel': sum(steps),
               'maxObservedWorldSpeed': max(speeds, default=0),
               'turnFocusSegments': {str(turn): {'frames': len(travel), 'worldTravel': sum(travel), 'maxWorldStep': max(travel)}
                                     for turn, travel in focus_steps.items()},
               'observedResidencies': sorted({p['residency'] for f in data['rosterFrames'] for p in f['roster'] if p.get('residency')}),
               'framesWithRosterConstraint': sum(f['view'].get('frame') is not None for f in data['frames']),
               'note': 'Observed native frame positions, not a smoothness verdict; inspect deltas, resize, timing and footage.'}
    write(root / (name + '-summary.json'), summary)
    print(json.dumps(summary), flush=True)


def restore(root):
    run = json.loads((root / 'run.json').read_text())
    assert not run['restored'] and run['observedWorlds'], 'No open diagnostic run'
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID, 'Open Indigo editor at a quiet boundary first'
    baseline, current = run['baseline'], installed()
    allowed = set(run['observedWorlds'])
    for key in ('indigo.scores', 'indigo.economy'):
        old, now = json.loads(baseline[key]), json.loads(current[key])
        for name, row in old.get('players', {}).items():
            assert now.get('players', {}).get(name) == row, 'Original account changed: ' + name
        for name in set(now.get('players', {})) - set(old.get('players', {})):
            assert name.startswith(run['prefix'].casefold()), 'Unexpected account: ' + name
        for table in ('matches', 'rounds', 'series', 'tankUtilities'):
            before, after = old.get(table, {}), now.get(table, {})
            assert all(after.get(k) == v for k, v in before.items()), 'Original ledger changed: ' + table
            assert set(after) - set(before) <= allowed, 'Unobserved ledger additions: ' + table
    write(root / 'installed-before-restore.json', current)
    # Compare the installed API's current values before any write, in one call.
    checks = json.dumps(list(current.items()))
    rows = json.dumps(list(baseline.items()))
    script('const same=(a,b)=>a===b||(a!==null&&b!==null&&typeof a==="object"&&typeof b==="object"&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));'
           + 'for(const [k,raw] of ' + checks + ')if(!same(talus.installed.get(k),JSON.parse(raw)))throw new Error("Installed state changed: "+k);'
           + 'for(const [k,raw] of ' + rows + ')talus.installed.set(k,JSON.parse(raw));return true')
    for _ in range(40):
        if installed() == baseline:
            break
        time.sleep(.25)
    else:
        raise RuntimeError('Exact raw restoration did not flush')
    run['restored'] = True
    write(root / 'run.json', run)
    write(root / 'restoration.json', {'exactRawEquality': True, 'originalAccountsUnchanged': True, 'worlds': run['observedWorlds']})
    print('Restored this run’s exact baseline; original accounts unchanged.')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=('capture', 'observe', 'screenshot', 'camera-trace', 'restore'))
    p.add_argument('--run-dir', type=Path, required=True)
    p.add_argument('--prefix')
    p.add_argument('--seconds', type=int, default=600)
    p.add_argument('--name')
    a = p.parse_args()
    a.run_dir.mkdir(parents=True, exist_ok=True)
    if a.action == 'capture':
        assert a.prefix and len(a.prefix) >= 6
        capture(a.run_dir, a.prefix)
    elif a.action == 'observe':
        assert 1 <= a.seconds <= 1200
        observe(a.run_dir, a.seconds)
    elif a.action == 'screenshot':
        screenshot(a.run_dir, a.name)
    elif a.action == 'camera-trace':
        camera_trace(a.run_dir, a.seconds, a.name)
    else:
        restore(a.run_dir)
