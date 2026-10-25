"""Restore this session's user accounts and leave a fresh M8 CPU armory ready."""
import json
import time
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script
from m4_support import launch, wait_state
from m6_support import navigate_game
from m8_live import capture, screen

base=json.loads((ROOT/'docs/evidence/m8-start.json').read_text())['value']
prefs=base['preferences'];names=prefs['namesText'].splitlines()
assert prefs['humans']==0,'This preview is for the authorized CPU-only session'
# Restore from the original, fully booted ready game. Editor identity can be
# visible before script installed-state binding has completed.
navigate_game(base['world'])
wait_state(lambda s:s.get('match') and s['match']['phase']=='ready' and s['ui'].get('ready'),90)
restore_economy=('talus.installed.delete("indigo.economy");' if base['economy'] is None
    else 'talus.installed.set("indigo.economy",'+json.dumps(base['economy'])+');')
script('talus.sim.resume();'+restore_economy+'talus.installed.set("indigo",'+json.dumps(prefs)+');talus.installed.set("indigo.scores",'+json.dumps(base['scores'])+');return true')
# Observe the coalesced writes reaching the database before navigating again.
deadline=time.monotonic()+15
while time.monotonic()<deadline:
    rows=call('run_sql_readonly',{'sql':"SELECT key,value_json FROM installed_game_state WHERE game_id = '"+WORLD_ID+"' AND key IN ('indigo','indigo.scores','indigo.economy')"})['results'][0]['rows']
    stored={key:json.loads(value) for key,value in rows}
    if stored.get('indigo')==prefs and stored.get('indigo.scores')==base['scores'] and stored.get('indigo.economy')==base['economy']:break
    time.sleep(.25)
else:raise TimeoutError('User account restoration has not persisted')
# The new dialogue deck contains only phrase indices, no diagnostic names.
# Retain it so lines already seen in the live checks do not repeat for the user.
deck=script("return talus.installed.get('indigo.dialogue')")
call('engine_new_game',{'template':WORLD_ID,'name':'Indigo M8 Tony-Copper ready','seed':base['match']['seed']})
setup=wait_state(lambda s:s['worldId']!=base['world'] and s['match'] is None and s['ui'].get('installed',{}).get('indigo')==prefs,90)
# The remembered form already has the desired names/counts/time. Only set seed.
window=call('engine_screenshot',{'format':'jpeg','maxWidth':400})['window'];assert window['width']==1600 and window['height']==968
call('engine_mouse',{'action':'click','x':1105,'y':475,'settleMs':150})
call('engine_type',{'text':str(base['match']['seed'])})
call('engine_mouse',{'action':'click','x':1125,'y':765,'settleMs':150})
ready=wait_state(lambda s:s['worldId']!=setup['worldId'] and s.get('match') and s['match']['phase']=='ready' and s['ui'].get('shop'),120)
assert ready['match']['version']==8 and ready['match']['seed']==base['match']['seed']
actual=script('return {preferences:talus.installed.get("indigo"),scores:talus.installed.get("indigo.scores"),dialogue:talus.installed.get("indigo.dialogue")}')
assert actual['preferences']==prefs and actual['scores']==base['scores']
assert actual['dialogue']==deck
before=capture('preview-before-save')
assert not before['paused'] and before['camera']['zoom']==.25
assert {p['name'] for p in before['match']['roster']}==set(names)
assert set(before['economy']['players'])==set(n.lower() for n in names)
call('engine_mouse',{'action':'click','x':780,'y':130})
saved=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800});assert saved['focused']
navigate_game(ready['worldId'])
wait_state(lambda s:s.get('match') and s['match']['phase']=='ready' and s['ui'].get('shop'),90)
after=capture('preview-ready');screen('preview-ready')
assert after['economy']==before['economy'],'Ready reload repeated CPU purchases'
assert after['scores']==base['scores'] and not after['error'] and not after['paused']
assert all(r['health']==100 for r in after['roster'])
assert script("return talus.installed.get('indigo')")==prefs
assert script("return talus.installed.get('indigo.dialogue')")==deck
assert script("return await talus.files.readText('Scripts/match.ts')")==(ROOT/'world/Scripts/match.ts').read_text()
(ROOT/'docs/evidence/m8-preview-ready.jpg').write_bytes((ROOT/'artifacts/m8-preview-ready.jpg').read_bytes())
print(json.dumps({'ready':ready['worldId'],'names':names,'zoom':after['camera']['zoom'],
    'wallets':{k:w['cash'] for k,w in after['economy']['players'].items()},'originalWorldPreserved':base['world']}),flush=True)
