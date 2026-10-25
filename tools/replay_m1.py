"""Replay M1 on the connected app after installing its template fixture.

Creates a fresh save, fires four shells, checks terrain and attribution,
and reopens the save. Does not repair terrain or alter engine source.
"""
import hashlib
import argparse
import json
from pathlib import Path
import time
import sys
from bridge import call, ROOT, WORLD_ID

OUT = ROOT / 'docs/evidence/m1-2495-replay.json'
BUILD = '0.0.2495'
AUDIT_CORRIDOR = False
report = {'checks': [], 'snapshots': {}, 'templateId': WORLD_ID}


def persist():
    OUT.write_text(json.dumps(report, indent=2) + '\n')


def script(source):
    reply = call('engine_run_script', {'source': source, 'timeoutMs': 30000})
    if reply.get('error'):
        raise RuntimeError(reply['error'])
    return reply.get('value')


def check(name, passed, detail=None, critical=True):
    report['checks'].append({'name': name, 'passed': bool(passed), 'detail': detail})
    persist()
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    if not passed and critical:
        raise AssertionError(name)


def until(fn, seconds=90):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        result = fn()
        if result:
            return result
        time.sleep(0.5)
    raise TimeoutError('M1 readiness timed out')


def state():
    value = script('return {status:talus.state.get("m1.status"), shooter:talus.state.get("m1.shooter"), target:talus.state.get("m1.target"), before:talus.state.getJson("m1.before"), restoration:talus.state.getJson("m1.restoration"), impact:talus.state.getJson("m1.impact"), events:talus.state.getJson("m1.events")}')
    if 'error' in str(value.get('status', '')).lower():
        raise RuntimeError(value['status'])
    return value


def emit(event, args=None):
    script('talus.emit(' + json.dumps(event) + ',' + json.dumps(args or {}) + '); return true')


def status(wanted):
    def probe():
        s = state()
        return s if s['status'] == wanted else None
    return until(probe)


def snapshot(label):
    s = state()
    report['snapshots'][label] = s
    persist()
    return s


def fire(label, **args):
    prior = max([e.get('shotNumber', 0) for e in state().get('events') or []], default=0)
    emit('indigo:m1-fire', args)
    def done():
        s = state()
        return s if any(e.get('event') == 'settled' and e.get('shotNumber', 0) > prior for e in s.get('events') or []) else None
    until(done)
    s = snapshot(label)
    if AUDIT_CORRIDOR:
        audit_corridor(label, s['events'])
    return s


def move(x):
    script(f'talus.camera.follow("off");talus.camera.centerOn({x},640);await talus.sleepTicks(150);return true')


def matter(x0, x1, y0=640, y1=768):
    # Every material cell, compressed in the script to avoid huge HTTP replies.
    # Ignore transient blast effects, retaining permanent STONE and absence.
    rows = []
    for top in range(y0, y1, 8):
        rows.extend(script(f'''const rows=[];
          for(let y={top};y<{min(top+8,y1)};y++){{
            const runs=[];let previous=-1,n=0;
            for(let x={x0};x<{x1};x++){{
              const c=talus.world.cell(x,y); const t=c?.element?.name==='STONE'?1:0;
              if(t===previous)n++;else{{if(n)runs.push([previous,n]);previous=t;n=1;}}
            }} if(n)runs.push([previous,n]); rows.push(runs);
          }} return rows;'''))
    return rows


def digest(rows):
    return hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()


def audit_corridor(label, events):
    """Read every ground cell in 192 chunks through the public script API.

    This deliberately streams each section; it does not pin or repair terrain.
    Engine regression evidence separately covers complete particle records.
    """
    camera = call('engine_describe_context')['camera']
    blasts = [{'x': e['x'], 'y': e['y']} for e in events or [] if e.get('event') == 'detonate']
    result = {'label': label, 'blasts': blasts, 'chunks': {}, 'unexpectedMissing': {}}
    report.setdefault('terrainAudits', []).append(result)
    persist()
    for start in range(0, 96, 12):
        move((start + 6) * 64)
        points = [{'x': x, 'y': y} for x in (start * 64, (start + 12) * 64 - 1) for y in (640, 767)]
        until(lambda: all(p['resident'] for p in call('engine_sample_points', {'points': points})['samples']))
        rows = matter(start * 64, (start + 12) * 64)
        expanded = [bytes(t for t, n in row for _ in range(n)) for row in rows]
        for cy in (10, 11):
            for cx in range(start, start + 12):
                offset = (cx - start) * 64
                cells = b''.join(row[offset:offset + 64] for row in expanded[(cy - 10) * 64:(cy - 9) * 64])
                unexpected = []
                for i, material in enumerate(cells):
                    if material:
                        continue
                    x, y = cx * 64 + i % 64, cy * 64 + i // 64
                    # Radius 48 plus cell-center rounding, as in the engine regression.
                    if not any((x-b['x'])**2 + (y-b['y'])**2 <= 49.5**2 for b in blasts):
                        unexpected.append(i)
                key = f'{cx},{cy}'
                result['chunks'][key] = {'sha256': hashlib.sha256(cells).hexdigest(), 'stoneCells': sum(cells)}
                if unexpected:
                    result['unexpectedMissing'][key] = unexpected
        persist()
        print(f'AUDIT {label}: {start + 12}/96 ground columns', flush=True)
    check(label + ': 192 chunks have no unexpected terrain loss', not result['unexpectedMissing'],
          {k: len(v) for k, v in result['unexpectedMissing'].items()}, critical=False)
    if label == 'after-round-trips':
        before = next(a for a in report['terrainAudits'] if a['label'] == 'highArc')
        check('all 192 terrain chunks and craters match after camera round trips', result['chunks'] == before['chunks'], critical=False)
    if label == 'after-reopen':
        before = next(a for a in report['terrainAudits'] if a['label'] == 'after-round-trips')
        check('all 192 terrain chunks match exactly after save/reopen', result['chunks'] == before['chunks'], critical=False)
    script(f'talus.camera.centerOn({camera["centerX"]},{camera["centerY"]});await talus.sleepTicks(150);return true')


def main():
    if '--resume-audit' in sys.argv:
        report.update(json.loads(OUT.read_text()))
        report['priorInterruption'] = report.pop('failure', None)
        s = report['snapshots']['finalReturn']
        # The preflight audit established every home cell was stone.
        home = [[[1, 704]] for _ in range(128)]
        assert digest(home) == report['homeBeforeSha256']
        return finish_audit(s['shooter'], s['target'], report['snapshots']['calibration']['impact']['x'], home)
    context = call('engine_describe_context')
    if '--resume-new-game' in sys.argv:
        check('resume untouched fresh M1 game', not context['world']['isEditorMode'] and state()['shooter'] is None and script('return talus.world.seed') == 1729)
    else:
        check('Indigo template open in editor', context['world']['isEditorMode'] and context['world']['templateId'] == WORLD_ID)
        layout = script('return await talus.editor.layout.describe()')
        check('import created live WFC area', any(a['id'] == 'indigo-m1' for a in layout['wfcAreas']))
        call('engine_new_game', {'template': WORLD_ID, 'name': 'Indigo M1 — acceptance ' + BUILD, 'seed': 1729})
    def game_ready():
        try:
            c = call('engine_describe_context')
        except RuntimeError as error:
            # Mode changes deliberately reload the connected page.
            if 'HTTP 502:' in str(error) or 'HTTP 503:' in str(error) or 'engine tools not ready (page still booting)' in str(error):
                return None
            raise
        return c if c['world']['engineBooted'] and c['world']['worldId'] and not c['world']['isEditorMode'] else None
    report['worldId'] = until(game_ready)['world']['worldId']
    status('M1 script ready')
    emit('indigo:m1-start')
    status('M1 ready to fire')
    s = snapshot('start')
    check('normal x=400 start', abs(s['before']['x'] - 400) < 2 and abs(s['before']['y'] - 626) < 2)
    home = matter(64, 768)
    check('all starting ground cells are stone', all(t == 1 for row in home for t, _ in row))
    report['homeBeforeSha256'] = digest(home)
    if AUDIT_CORRIDOR:
        audit_corridor('before-first-shot', s['events'])
    s = fire('calibration')
    impact = s['impact']['x']
    check('long range flight', impact - s['before']['x'] > 4000)
    crater_x = int(impact) - 128
    crater = matter(crater_x, crater_x + 256, 576, 832)
    emit('indigo:m1-target')
    status('M1 target ready')
    emit('indigo:m1-return')
    status('M1 shooter restored')
    check('home survives shell-following return', matter(64, 768) == home)
    move(impact)
    check('first crater survives round trip', matter(crater_x, crater_x + 256, 576, 832) == crater)
    for index in range(2):
        s = fire('damage' + str(index + 1), power=0.99)
    shooter, target = s['shooter'], s['target']
    roster = script(f'return [{json.dumps(shooter)},{json.dumps(target)}].map(id=>talus.entities.get(id).snapshot())')
    check('two shots kill the target, one survivor', roster[0]['alive'] and not roster[1]['alive'], roster)
    s = fire('highArc', angle=-3.141592653589793 / 3, power=1)
    events = s['events']
    flights = [e for e in events if e.get('event') == 'flight']
    parked = [e for e in flights if e.get('shooter', {}).get('residency') == 'stored']
    check('shooter parked during flight with durable owner', bool(parked) and all(e.get('owner') == shooter for e in parked))
    check('high arc above terrain', min(e['shot']['y'] for e in flights) < -1000)
    hits = [e for e in events if e.get('event') == 'hit']
    damage = [e for e in events if e.get('event') == 'damage']
    deaths = [e for e in events if e.get('event') == 'death']
    check('both hit callbacks delivered with owner', len(hits) == 2 and all(e.get('owner') == shooter for e in hits))
    check('damage and kill credit retain shooter', len(damage) == 2 and len(deaths) == 1 and all(e.get('source') == shooter for e in damage) and deaths[0].get('killer') == shooter)
    check('hits precede projectile end', all(next(i for i,e in enumerate(events) if e.get('event') == 'hit' and e.get('projectileId') == h['projectileId']) < next(i for i,e in enumerate(events) if e.get('event') == 'end' and e.get('projectileId') == h['projectileId']) for h in hits))
    check('all four impacts settled', len([e for e in events if e.get('event') == 'settled' and not e.get('timedOut')]) == 4)
    emit('indigo:m1-return')
    status('M1 shooter restored')
    snapshot('finalReturn')
    for trip in range(3):
        move(impact)
        move(400)
        check('camera-only ground return ' + str(trip+1), matter(64, 768) == home)
    if AUDIT_CORRIDOR:
        audit_corridor('after-round-trips', s['events'])
    finish_audit(shooter, target, impact, home)


def finish_audit(shooter, target, impact, home):
    crater_x = int(impact) - 128
    # The old run lost chunks near x=3200. Inspect that entire ground band too.
    move(3200)
    corridor = matter(2816, 3584)
    report['corridorAfterCombat'] = corridor
    check('former pit region contains full ground', all(t == 1 for row in corridor for t, _ in row), critical=False)
    move(impact)
    final_crater = matter(crater_x, crater_x + 256, 576, 832)
    report['craterBeforeReopen'] = final_crater
    persist()
    move(400)
    call('engine_key', {'key': 's', 'modifiers': ['meta'], 'settleMs': 3000})
    call('engine_continue_game', {'worldId': report['worldId']})
    time.sleep(1)
    def reopened():
        try:
            c = call('engine_describe_context')
            return c['world']['engineBooted'] and c['world']['worldId'] == report['worldId']
        except RuntimeError as error:
            if 'HTTP 502:' in str(error) or 'HTTP 503:' in str(error) or 'engine tools not ready (page still booting)' in str(error):
                return False
            raise
    until(reopened)
    move(400)
    after = script(f'const a=talus.entities.get({json.dumps(shooter)});const b=talus.entities.get({json.dumps(target)});return {{shooter:a.snapshot(),target:b.snapshot(),marker:a.blackboard.get("custom.m1Marker"),targetMarker:b.blackboard.get("custom.m1Marker"),weapon:a.weapon.state}}')
    report['afterReopen'] = after
    check('save/reopen retains survivor identity, health and marker', after['shooter']['id'] == shooter and after['shooter']['health'] == 100 and after['marker'] == 'shooter-survives-streaming' and abs(after['shooter']['y'] - 626) < 1)
    check('save/reopen retains cannon inventory', len(after['weapon']['items']) == 1 and bool(after['weapon']['equipped']))
    check('target remains dead after reopen', not after['target']['alive'] and after['targetMarker'] == 'target-survives-streaming')
    check('home survives save/reopen exactly', matter(64, 768) == home)
    move(impact)
    check('craters survive save/reopen exactly', matter(crater_x, crater_x + 256, 576, 832) == final_crater)
    move(3200)
    report['corridorAfterReopen'] = matter(2816, 3584)
    check('corridor contents survive save/reopen exactly', report['corridorAfterReopen'] == corridor, critical=False)
    if AUDIT_CORRIDOR:
        audit_corridor('after-reopen', report['snapshots']['highArc']['events'])
    move(400)
    report['accepted'] = all(c['passed'] for c in report['checks'])
    persist()
    print('M1 replay complete; accepted=' + str(report['accepted']) + '; survivor camera restored.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUT)
    parser.add_argument('--build-label', default=BUILD)
    parser.add_argument('--audit-corridor', action='store_true', help='Audit all 192 ground chunks before/after each shot and save/reopen')
    parser.add_argument('--resume-new-game', action='store_true')
    parser.add_argument('--resume-audit', action='store_true')
    args = parser.parse_args()
    OUT, BUILD, AUDIT_CORRIDOR = args.output, args.build_label, args.audit_corridor
    if OUT.exists() and not (args.resume_new_game or args.resume_audit):
        parser.error('Report already exists; choose a new --output to preserve evidence')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    report.update({'buildLabel': BUILD, 'corridorAuditEnabled': AUDIT_CORRIDOR})
    try:
        main()
    except Exception as exc:
        report['failure'] = str(exc)
        persist()
        raise
