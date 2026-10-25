"""Bounded native Lazy Boy check with a two-CPU diagnostic roster."""
import json,time
from bridge import call,ROOT,WORLD_ID
from audit_m2 import script
from m4_support import wait_state
from m9_live import capture

previous=script('return talus.world.id')
call('engine_new_game',{'template':WORLD_ID,'name':'Indigo M9 native aim assistance','seed':9029})
setup=wait_state(lambda s:s['worldId']!=previous and s['match'] is None and s['ui'].get('installed'))
script('talus.ui.set("installed.indigo",{humans:0,computers:2,turnSeconds:30,generation:"wfc",namesText:"M9 Aim Alpha\\nM9 Aim Beta"});talus.ui.openMenu("Menus/setup.html");return true')
call('engine_mouse',{'action':'click','x':1105,'y':440})
call('engine_type',{'text':'9029'})
call('engine_mouse',{'action':'click','x':1125,'y':783})
ready=wait_state(lambda s:s['worldId']!=setup['worldId'] and s.get('match') and s['match']['phase']=='ready' and s['ui'].get('shop'),120)
assert ready['match']['humans']==0 and ready['match']['computers']==2
script('const m=talus.state.getJson("indigo.match"),b=talus.installed.get("indigo.economy");for(const p of m.roster){const w=b.players[p.name.toLowerCase()];w.stock={"lazy-boy":2};w.selected="standard";w.revision++}talus.installed.set("indigo.economy",b);return true')
call('write_world_file',{'worldId':ready['worldId'],'path':'Scripts/match.ts','content':(ROOT/'world/Scripts/match.ts').read_text()})
wait_state(lambda s:s['worldId']==ready['worldId'] and s.get('match') and s['match']['phase']=='ready' and s['ui'].get('autoAimCharges')==2)
time.sleep(.3)
call('engine_mouse',{'action':'click','x':341,'y':874,'settleMs':500})
call('engine_mouse',{'action':'click','x':1316,'y':924,'settleMs':500})
s=wait_state(lambda s:any(e['kind']=='utility' and e.get('item')=='lazy-boy' for e in s['events'] or []),60)
result=capture('autoaim')
bank=script('return talus.installed.get("indigo.economy")')
used=[e for e in s['events'] if e['kind']=='utility' and e.get('item')=='lazy-boy']
assert used and bank['players'][used[0]['name'].lower()]['stock']['lazy-boy']==1
assert not s['error']
(ROOT/'docs/evidence/m9-autoaim-accounting.json').write_text(json.dumps({'world':ready['worldId'],'grantedChargesPerPilot':2,'events':used,'bank':bank},indent=2)+'\n')
print('PASS: two-CPU native graph solved and applied aim, consuming one of two granted Lazy Boy charges',flush=True)
