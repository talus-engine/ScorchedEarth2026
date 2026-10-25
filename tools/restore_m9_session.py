"""Restore this M9 session's exact baseline and leave a fresh, undeployed setup.

This is a session-specific restoration, not a general future test cleanup tool.
Do not run it after the user has accrued new balances or scores.
"""
import base64,hashlib,json,time
from bridge import ROOT,WORLD_ID,call
from audit_m2 import script
from m4_support import wait_state

base=json.loads((ROOT/'docs/evidence/m9-installed-baseline.json').read_text())
expected=dict(base['results'][0]['rows'])
assert set(expected)=={'indigo','indigo.scores','indigo.economy','indigo.dialogue'}
previous=script('return talus.world.id')
call('engine_new_game',{'template':WORLD_ID,'name':'Indigo M9 — choose your battlefield','seed':1729})
setup=wait_state(lambda s:s['worldId']!=previous and s['match'] is None and s['ui'].get('installed'),90)
# Parse original raw strings inside JS; preserve number representations and
# insertion order rather than round-tripping the state through Python values.
restore=''.join('talus.installed.set('+json.dumps(key)+',JSON.parse('+json.dumps(raw)+'));' for key,raw in expected.items())
script(restore+'talus.ui.set("installed.indigo",{generation:"wfc",...JSON.parse('+json.dumps(expected['indigo'])+')});talus.ui.openMenu("Menus/setup.html");talus.sim.resume();return true')
sql="SELECT key,value_json FROM installed_game_state WHERE game_id='"+WORLD_ID+"' AND key IN ('indigo','indigo.scores','indigo.economy','indigo.dialogue')"
end=time.monotonic()+20
while time.monotonic()<end:
    actual=dict(call('run_sql_readonly',{'sql':sql})['results'][0]['rows'])
    if actual==expected:break
    time.sleep(.25)
else:raise AssertionError('Exact baseline has not reached durable storage')
files={}
for path in ['Scripts/match.ts','Game/arena.json','Game/chaos.json','Game/shop.json','Game/generation.json','Menus/setup.html','Menus/hud.html','Menus/shop.html']:
    content=call('read_world_file',{'worldId':WORLD_ID,'path':path})['content']
    assert content==(ROOT/'world'/path).read_text(),path+' does not match installed content'
    files[path]=hashlib.sha256(content.encode()).hexdigest()
state=script('return {world:talus.world.id,match:talus.state.getJson("indigo.match"),ui:talus.ui.get(),paused:talus.sim.paused,error:talus.state.get("indigo.error")}')
assert state['match'] is None and state['world']==setup['worldId'] and not state['error']
assert state['ui']['installed']['indigo']['namesText']==json.loads(expected['indigo'])['namesText']
status=call('engine_script_status',{'script':'match'});assert not status['faulted']
screen=call('engine_screenshot',{'format':'jpeg','maxWidth':1200})
(ROOT/'docs/evidence/m9-menu-ready.jpg').write_bytes(base64.b64decode(screen['mcpImage']['data']))
report={'world':setup['worldId'],'exactDurableEquality':True,'keys':list(expected),'sha256':{key:hashlib.sha256(raw.encode()).hexdigest() for key,raw in actual.items()},'templateFiles':files,'state':state,'scriptStatus':status,'originalM8SavePreserved':'d3fe7d92-cdd9-475e-940f-f5b48e1725a8','noAutomaticPurchases':True}
(ROOT/'docs/evidence/m9-restoration.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'world':setup['worldId'],'exactDurableEquality':True,'names':json.loads(expected['indigo'])['namesText'].splitlines(),'wallets':{k:w['cash'] for k,w in json.loads(expected['indigo.economy'])['players'].items()},'templateFilesVerified':len(files)}),flush=True)
