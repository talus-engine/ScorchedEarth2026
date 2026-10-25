"""Capture visible birth/midpoint/expiry of E10 on a retained diagnostic game."""
import argparse
import base64
import json
import time
from bridge import ROOT, call
from audit_m2 import script
from m6_support import capture_baseline, navigate_game, restore
from m4_support import wait_state

parser = argparse.ArgumentParser()
parser.add_argument('--world', required=True)
parser.add_argument('--label', required=True)
args = parser.parse_args()
out = ROOT / ('docs/evidence/' + args.label + '.json')
assert not out.exists()
base = capture_baseline()
report = {'world':args.world,'requestedMs':900,'samples':[]}
def capture(name):
    state = script('return {clock:talus.sim.clock,paused:talus.sim.paused,camera:talus.camera.view}')
    state.update({'phase':name,'hostWall':time.time()}); report['samples'].append(state)
    screen = call('engine_screenshot', {'format':'jpeg','maxWidth':1200})
    (ROOT / ('docs/evidence/' + args.label + '-' + name + '.jpg')).write_bytes(base64.b64decode(screen['mcpImage']['data']))
    out.write_text(json.dumps(report, indent=2) + '\n')
try:
    navigate_game(args.world)
    wait_state(lambda s:s['worldId']==args.world and s['match'] is not None and s['ui'].get('finished'))
    report['spawn'] = script("talus.sim.resume();const m=talus.state.getJson('indigo.match'),p=m.roster.find(p=>!p.eliminated),e=talus.entities.get(p.entityId),at=e.position;talus.ui.floatText({x:at.x+100,y:at.y-80},'E10 still here',{ms:900,size:1.2,color:'#ffffff'});return {clock:talus.sim.clock,at}")
    report['hostSpawnWall'] = time.time()
    # Allow the page bridge and a real rendered frame to display the new label.
    time.sleep(.25); capture('visible')
    time.sleep(.55); capture('midpoint')
    time.sleep(3); capture('expired')
finally:
    restore(base)
