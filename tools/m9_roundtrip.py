import json,time
from bridge import ROOT,call
from audit_m2 import script
from m9_live import read
s=read();assert s['match']['phase']=='finished',s['match']['phase'];wid=s['world']
profile='const out=[];for(let c=0;c<50;c++){const x=16384+c*256+128;out.push({column:c,surface:await talus.world.findSurface(x,384,512),bottom:await talus.world.findSurface(x,1279,1),topFloor:await talus.world.findSurface(x,1024,1)})}return out'
before=script(profile);bank=script('return JSON.stringify(talus.installed.get("indigo.economy"))')
call('engine_mouse',{'action':'click','x':341,'y':874});call('engine_mouse',{'action':'click','x':780,'y':130})
r=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800});assert r['focused']
call('engine_continue_game',{'worldId':wid});end=time.monotonic()+90
while time.monotonic()<end:
 try:
  a=read()
  if a['world']==wid and a['match'] and a['match']['phase']=='finished' and a['error']=='':break
 except RuntimeError:pass
 time.sleep(.4)
else:raise TimeoutError('World failed to reload')
after=script(profile);bankAfter=script('return JSON.stringify(talus.installed.get("indigo.economy"))')
result={'world':wid,'before':before,'after':after,'profileEqual':before==after,'bankEqual':bank==bankAfter,'state':a}
(ROOT/'docs/evidence/m9-brush-roundtrip.json').write_text(json.dumps(result,indent=2)+'\n')
assert before==after,'Native terrain changed across save/reopen'
assert bank==bankAfter,'Reload duplicated income or purchases'
print('PASS: 50-column surface/foundation profile and installed bank unchanged across save/reopen',flush=True)
