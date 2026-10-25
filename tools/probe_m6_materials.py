"""Compare public spray and fill material initialization in an isolated CPU save."""
import json,time
from bridge import ROOT,call
from audit_m2 import script
from m4_support import launch
from m6_support import restore,capture_baseline
out=ROOT/'docs/evidence/m6-2497-material-probe.json';assert not out.exists()
baseline=capture_baseline();report={}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
try:
 ready=launch('material-probe',2,7,seconds=5,names=['M6 Material A','M6 Material B'],version=6);report['worldId']=ready['worldId'];save()
 report['spawn']=script("""
 talus.sim.pause();const materials=['FIRE','LAVA','LIQUID_NITROGEN'],rows=[];
 for(let i=0;i<3;i++){
  const x=6000+i*240,y=260,name=materials[i];
  const spray=talus.world.spawnParticles({element:name,x,y,count:64,vx:0,vy:0});
  const fill=talus.world.fill({x:x+100,y,w:8,h:8},name);
  rows.push({name,x,y,spray,fill});
 }
 let largeFill;try{talus.world.fill({x:6400,y:260,radius:96},'FIRE');largeFill='accepted'}catch(e){largeFill=String(e)}
 talus.sim.resume();await talus.sleepTicks(6);talus.sim.pause();return {rows,largeFill,clock:talus.sim.clock,view:talus.camera.view};
 """);save()
 for row in report['spawn']['rows']:
  for mode,offset in [('spray',0),('fill',100)]:
   row[mode+'Gpu']=call('engine_test_helper',{'method':'particleTempStats','args':[row['x']+offset-24,row['y']-24,56,56,True]})
   save()
 print(json.dumps(report,indent=2),flush=True)
finally:
 restore(baseline);save()
