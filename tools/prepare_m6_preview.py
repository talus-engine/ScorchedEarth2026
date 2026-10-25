"""Leave a fresh CPU-only M6 preview with the user's original names and scores."""
import base64,json
from bridge import ROOT,call
from audit_m2 import script
from m4_support import launch
base=json.loads((ROOT/'docs/evidence/m6-user-baseline.json').read_text());prefs=base['preferences'];names=prefs['namesText'].splitlines()
ready=launch('Tony-Copper-ready',max(2,len(names)),7,seconds=prefs['turnSeconds'],names=names,version=6)
script('talus.installed.set("indigo",'+json.dumps(prefs)+');talus.installed.set("indigo.scores",'+json.dumps(base['scores'])+');return true')
saved=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800});assert saved.get('focused') is True
verification=script('return {world:talus.world.id,match:talus.state.getJson("indigo.match"),preferences:talus.installed.get("indigo"),scores:talus.installed.get("indigo.scores"),camera:talus.camera.view,paused:talus.sim.paused,error:talus.state.get("indigo.error"),catalog:JSON.parse(await talus.files.readText("Game/chaos.json"))}')
assert verification['preferences']==prefs and verification['scores']==base['scores']
assert verification['match']['phase']=='ready' and not verification['error'] and not verification['paused']
assert sum(bool(f['enabled'])for f in verification['catalog']['effects'])==4
(ROOT/'docs/evidence/m6-2497-preview-ready.json').write_text(json.dumps(verification,indent=2)+'\n')
screen=call('engine_screenshot',{'format':'jpeg','maxWidth':1200});(ROOT/'docs/evidence/m6-2497-preview-ready.jpg').write_bytes(base64.b64decode(screen['mcpImage']['data']))
print(json.dumps({'ready':verification['world'],'names':names,'phase':verification['match']['phase'],'zoom':verification['camera']['zoom']}))
