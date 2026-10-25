"""Session navigation and restoration for M6 diagnostics; no profile copies."""
import time
from bridge import call
from audit_m2 import script
import json

def navigate_game(wid):
    call('engine_set_mode',{'mode':'menu'})
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        try:
            if call('engine_describe_context')['world']['worldId'] is None:break
        except RuntimeError:pass
        time.sleep(.3)
    else:raise TimeoutError('Menu navigation did not finish')
    try:call('engine_continue_game',{'worldId':wid})
    except RuntimeError as e:
        if 'page connection lost' not in str(e):raise
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        try:
            if script('return talus.world.id')==wid:return
        except RuntimeError:pass
        time.sleep(.3)
    raise TimeoutError('Game navigation did not finish: '+wid)

def restore(base):
    for retry in range(30):
        try:
            script('talus.sim.resume();talus.installed.set("indigo",'+json.dumps(base['preferences'])+');talus.installed.set("indigo.scores",'+json.dumps(base['scores'])+');return true')
            break
        except RuntimeError:
            if retry==29:raise
            time.sleep(.5)
    navigate_game(base['world'])


def capture_baseline():
    """Use current user settings on future runs, never a historical test snapshot."""
    value=script('return {world:talus.world.id,editor:talus.editor.available,preferences:talus.installed.get("indigo"),scores:talus.installed.get("indigo.scores")}')
    if value['editor'] or not value['world']:
        raise RuntimeError('Start this diagnostic from a loaded game so it can restore that session afterward')
    return value
