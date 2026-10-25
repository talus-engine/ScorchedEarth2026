import sys,json,time,base64
from pathlib import Path
sys.path.insert(0,'/Users/tonygermaneri/gh/indigo/tools')
from bridge import call
from m4_support import state,wait_state
from audit_m2 import script
root=Path('/private/tmp/indigo-m8-engine')
def capture(label):
 r=state();r['audit']=script("return talus.state.getJson('m8.native.audit')");r['economy']=script("return talus.installed.get('indigo.economy')");r['components']=script("return talus.state.getJson('indigo.match')?.roster.map(p=>{const e=talus.entities.get(p.entityId);return {name:p.name,controller:e.isLive?e.controller.state:null,defenses:e.isLive?e.defenses.state:null,weapon:e.isLive?e.weapon.state:null}})")
 (root/(label+'.json')).write_text(json.dumps(r,indent=2)+'\n');return r
from m4_support import launch
ready=launch('released-native-armory',2,7,15,['M8 Release A','M8 Release B'],8)
(root/'cpu-final-ready.json').write_text(json.dumps(ready,indent=2)+'\n')
before=capture('cpu-final-before-observer');wid=before['worldId']
call('write_world_file',{'worldId':wid,'path':'Scripts/m8-observer.ts','content':(root/'m8-observer.ts').read_text()})
wait_state(lambda s:s['worldId']==wid and s['match']['phase']=='ready' and s['ui'].get('shop') and script("return !!talus.state.getJson('m8.native.audit')"),90)
after=capture('cpu-final-after-observer')
assert [p['entityId']for p in before['match']['roster']]==[p['entityId']for p in after['match']['roster']]
assert before['economy']==after['economy'],'Reload duplicated purchases'
window=call('engine_screenshot',{'format':'jpeg','maxWidth':400})['window'];w,h=window['width'],window['height']
assert (w,h) in [(1600,968),(1920,1018)]
call('engine_mouse',{'action':'click','x':int(340+(w-1600)/2),'y':int(874+(h-968)/2),'settleMs':200})
call('engine_mouse',{'action':'click','x':w-286,'y':h-44,'settleMs':200})
print('started',wid,flush=True)
last=None
for n in range(420):
 time.sleep(1)
 r=state();status=(r['match']['phase'],r['match']['turnNumber'])
 if status!=last:print(json.dumps({'phase':status[0],'turn':status[1],'error':r['error'],'alive':sum(not p['eliminated']for p in r['match']['roster'])}),flush=True);last=status
 if r['match']['phase'] in ['fault','finished']:break
final=capture('cpu-final-combat');print('captured',final['match']['phase'],flush=True)
screen=call('engine_screenshot',{'format':'jpeg','maxWidth':1600});(root/'cpu-final-combat.jpg').write_bytes(base64.b64decode(screen['mcpImage']['data']))
