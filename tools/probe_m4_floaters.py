"""Capture script float text at creation and after its requested lifetime."""
import base64
import argparse
from m4_support import *
p=argparse.ArgumentParser();p.add_argument('--label',default='floaters');a=p.parse_args()
initial=state();assert initial['match']['phase']=='ready' and initial['match']['humans']==0
label=a.label;report={'initial':initial}
report['spawn']=script('''const m=talus.state.getJson('indigo.match');
const p=talus.entities.get(m.roster[m.focusIndex].entityId).position;
talus.ui.floatText({x:p.x,y:p.y-72},'M4 −37',{ms:900,size:1.2,color:'#ffd9b2'});
return {clock:talus.sim.clock,position:p,requestedLifetimeMs:900};''')
for name,delay in [('fresh',.5),('expired',2.5)]:
    time.sleep(delay)
    shot=call('engine_screenshot',{'format':'jpeg','maxWidth':1200})
    path=ROOT/('docs/evidence/m4-'+label+'-'+name+'.jpg')
    path.write_bytes(base64.b64decode(shot['mcpImage']['data']))
    report[name]={'screenshot':str(path.relative_to(ROOT)),'clock':state()['clock']}
evidence(label,report)
print(json.dumps({k:v for k,v in report.items()if k!='initial'},indent=2))
