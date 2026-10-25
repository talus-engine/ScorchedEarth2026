"""Actual CPU combat speech and E10 reproduction, without profile copies.

Start after installing M7 content; the recorded pre-install baseline is restored.
Diagnostic damage probes use a disposable game, never the user's ready save.
"""
import argparse
import base64
import json
import time
from bridge import ROOT, call
from audit_m2 import script
from m4_support import launch, begin, state, wait_state
from m6_support import restore, capture_baseline

parser = argparse.ArgumentParser()
parser.add_argument('--label', default='m7-dialogue-fixed')
parser.add_argument('--baseline', help='Explicit baseline JSON for an editor-started run; normally capture the current loaded game')
args = parser.parse_args()
out = ROOT / ('docs/evidence/' + args.label + '.json')
assert not out.exists(), 'Use a fresh evidence path for a new replay'
if args.baseline:
    base = json.loads((ROOT / args.baseline).read_text())
    base = base.get('value', base)
else:
    base = capture_baseline()
report = {'checks': {}, 'baselineWorld': base['world']}
def save(): out.write_text(json.dumps(report, indent=2) + '\n')
def check(label, ok):
    report['checks'][label] = bool(ok); save()
    print(('PASS ' if ok else 'FAIL ') + label, flush=True)
    assert ok, label
def screen(name):
    image = call('engine_screenshot', {'format':'jpeg','maxWidth':1200})
    (ROOT / ('docs/evidence/' + args.label + '-' + name + '.jpg')).write_bytes(base64.b64decode(image['mcpImage']['data']))
try:
    ready = launch('M7-speech', 2, 7, seconds=5, names=['M7 Quip A','M7 Quip B'], version=6)
    report['worldId'] = ready['worldId']; save()
    # Same short label used by the M4 reproduction; retain timing and actual pixels.
    report['floaterWallStart'] = time.time()
    report['floaterFresh'] = script("const m=talus.state.getJson('indigo.match'),p=talus.entities.get(m.roster[0].entityId).position;talus.ui.floatText({x:p.x+100,y:p.y-80},'E10 M7 900ms',{ms:900,size:1.2,color:'#ffffff'});return {clock:talus.sim.clock,at:p}")
    screen('m7-e10-fresh')
    time.sleep(3)
    report['floaterExpired'] = script('return {clock:talus.sim.clock}')
    report['floaterWallEnd'] = time.time()
    screen('m7-e10-expired'); save()
    begin()
    first = wait_state(lambda s:any(e['kind']=='quip' and e['speechKind']=='shooting' for e in s['events']), 50)
    script('talus.sim.pause();return true')
    report['shooting'] = state(); screen('m7-shooting'); save()
    check('Actual primary launch produces one shooting line', len([e for e in first['events'] if e['kind']=='quip' and e['speechKind']=='shooting']) == 1)
    check('Shooting bubble is visible at 25 percent zoom', bool(report['shooting']['ui'].get('speech')) and script('return talus.camera.view.zoom') == .25)
    # Deliberately move the camera during the label's lifetime. The camera frame
    # still constrains residency; this changes only the disposable test view.
    report['cameraBefore'] = script('return talus.camera.view')
    script('const v=talus.camera.view.viewport;talus.camera.centerOn({x:v.x+v.w/2+100,y:v.y+v.h/2-100});return true')
    report['cameraMoved'] = state(); report['cameraAfter'] = script('return talus.camera.view')
    screen('m7-shooting-camera-moved')
    before = report['shooting']['ui']['speech'][0]; after = report['cameraMoved']['ui']['speech'][0]
    check('Camera motion leaves the same sentence at exactly the same screen position', before['text']==after['text'] and before['left']==after['left'] and before['top']==after['top'])
    time.sleep(5)
    report['shootingExpired'] = state(); screen('m7-shooting-expired')
    check('Shooting speech expires while simulation is paused', not report['shootingExpired']['ui']['speech'])
    script('talus.sim.resume();return true')
    death = wait_state(lambda s:any(e['kind']=='quip' and e['speechKind']=='death' for e in s['events']) or s['match']['phase']=='fault', 120)
    report['death'] = death; screen('m7-death'); save()
    check('A physical combat death produces last words', not death['error'] and any(e['kind']=='quip' and e['speechKind']=='death' for e in death['events']))
    check('Death speech survives disappearing wreck', any(b['kind']=='LAST WORDS' for b in death['ui']['speech']))
    final = wait_state(lambda s:s['match']['phase'] in ['finished','fault'], 120)
    report['final'] = final
    check('CPU match finishes without script faults', final['match']['phase']=='finished' and not final['error'])
    events = final['events']; quips = [e for e in events if e['kind']=='quip']
    check('Each primary launch speaks exactly once', len([e for e in quips if e['speechKind']=='shooting']) == len([e for e in events if e['kind']=='launch']))
    check('Each eliminated tank speaks once, regardless of chaos shells', len([e for e in quips if e['speechKind']=='death']) == len([e for e in events if e['kind']=='eliminated']))
    script('talus.sim.pause();return true'); time.sleep(6)
    report['expired'] = state(); screen('m7-all-speech-expired')
    check('All speech expires after combat', not report['expired']['ui']['speech'])
    report['deck'] = script("return talus.state.getJson('indigo.quips')")
    script('talus.sim.resume();return true')
    # A harmless click on the finished battlefield focuses the app before Cmd+S.
    window = call('engine_screenshot', {'format':'jpeg','maxWidth':400})['window']
    call('engine_mouse', {'action':'click','x':window['width']//2,'y':window['height']//4})
    saved = call('engine_key', {'key':'s','modifiers':['meta'],'settleMs':1800})
    report['saveKey'] = saved; save()
    assert saved.get('focused') is True, saved
    from m6_support import navigate_game
    navigate_game(report['worldId'])
    reopened = wait_state(lambda s:s['match'] is not None and s['match']['phase']=='finished' and s['ui'].get('finished'))
    report['reopened'] = reopened
    check('Save/reopen retains phrase deck without resurrecting bubbles', report['deck'] == script("return talus.state.getJson('indigo.quips')") and not reopened['ui']['speech'])
finally:
    restore(base); save()
