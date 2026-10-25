"""Compare controller profiles on an isolated CPU fixture; never alter the user's save."""
import argparse
import json
import re
from m4_support import launch,state
from bridge import ROOT,call
def script(source):
    result=call('engine_run_script',{'source':source,'timeoutMs':120000},timeout=130)
    if result.get('error'):raise RuntimeError(result['error'])
    return result.get('value')

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--label',required=True)
p.add_argument('--version',type=int,default=4)
p.add_argument('--course-offset-x',type=int,default=0,help='Translate the diagnostic course into the current supported camera frame.')
p.add_argument('--stream',action='store_true',help='Park/restore the extra diagnostic NPC before driving the unchanged course.')
a=p.parse_args()
out=ROOT/('docs/evidence/m5-'+a.label+'.json')
assert not out.exists()
name_prefix=('M5 Test '+a.label)[:28]
report={'initial':launch('M5 '+a.label,2,7,names=[name_prefix+' 1',name_prefix+' 2'],version=a.version)}
def save():out.write_text(json.dumps(report,indent=2)+'\n')
save()
report['controller']=call('run_sql_readonly',{'sql':"SELECT template_name,joint_data FROM entity_templates WHERE template_id='"+report['initial']['roster'][0]['templateId']+"'"})
# The isolated course floats above the natural terrain: a 1 px spike,
# 4 px and 10 px steps, then a 40 px wall that a tank must not climb.
course="""
talus.camera.follow('off');talus.camera.centerOn(5240,400);await talus.sleepTicks(60);
const config=JSON.parse(await talus.files.readText('Game/arena.json'));
const e=await talus.entities.spawn(config.tankTemplate,5050,350);
if(!e || !await e.whenLive({timeoutTicks:600}))throw new Error('Probe tank not live');
talus.state.set('m5.probeEntity',e.id);
let filled=0;
for(let x=4992;x<5504;x+=128)filled+=talus.world.fill({x,y:400,w:128,h:16},'STONE');
for(const r of [{x:5100,y:399,w:1,h:1},{x:5170,y:396,w:48,h:4},{x:5250,y:390,w:48,h:10},{x:5370,y:360,w:48,h:40}])filled+=talus.world.fill(r,'STONE');
e.teleport(5050,350);e.setVelocity(0,0);await talus.sleepTicks(90);
return {filled,start:e.snapshot(),obstacles:[{x:5100,height:1,width:1},{x:5170,height:4,width:48},{x:5250,height:10,width:48},{x:5370,height:40,width:48}]};
"""
course=re.sub(r'\b(?:4992|5050|5100|5170|5240|5250|5370|5504)\b',
    lambda m:str(int(m.group())+a.course_offset_x),course)
report['course']=script(course)
save();print('Course ready',report['course']['start'],flush=True)
if a.stream:
    report['stream']=script("""
const e=talus.entities.get(talus.state.get('m5.probeEntity')),before=e.snapshot();
const rect={x:9152,y:256,w:128,h:640};let a=talus.sim.anchor({rect,label:'movement-restore-probe'});
if(!await a.whenLoaded({timeoutTicks:600}))throw new Error('Remote fixture not loaded');
e.teleport(9200,350);e.setVelocity(0,0);await talus.sleepTicks(120);a.release();await talus.sleepTicks(180);
const parked=e.snapshot();if(parked.residency!=='stored')throw new Error('Diagnostic actor did not park');
a=talus.sim.anchor({rect,label:'movement-restore-probe'});if(!await a.whenLoaded({timeoutTicks:600})||!await e.whenLive({timeoutTicks:600}))throw new Error('Diagnostic actor did not restore');
const restored=e.snapshot();e.teleport(START,350);e.setVelocity(0,0);await talus.sleepTicks(90);a.release();
return {before,parked,restored,home:e.snapshot()};
""".replace('START',str(5050+a.course_offset_x)))
    save();print('Streamed',report['stream'],flush=True)

for name,direction,ticks in [('right',1,720),('left',-1,720)]:
    report[name]=script("""
const e=talus.entities.get(talus.state.get('m5.probeEntity')),samples=[];
for(let n=0;n<TICKS;n++){
 const s=e.snapshot();e.setVelocity(DIRECTION*55,s.vy);talus.camera.centerOn(s.x,400);
 if(n%12===0)samples.push({tick:n,...s});await talus.sleepTicks(1);
}
const end=e.snapshot();e.setVelocity(0,end.vy);await talus.sleepTicks(30);
return {samples,end:e.snapshot()};
""".replace('TICKS',str(ticks)).replace('DIRECTION',str(direction)))
    save();print(name,report[name]['end'],flush=True)
report['checks']={
    'clears_steps_stops_at_wall':5306+a.course_offset_x<report['right']['end']['x']<5370+a.course_offset_x,
    'returns_over_steps':report['left']['end']['x']<5100+a.course_offset_x,
    'healthy':all(report[d]['end']['health']==100 for d in ['right','left']),
}
if a.stream:
    t=report['stream'];report['checks']['restored_identity']=t['parked']['residency']=='stored' and t['restored']['id']==t['before']['id'] and t['restored']['liveId']!=t['before']['liveId']
print('Checks',report['checks'],flush=True)
report['final']=state();report['camera']=call('engine_describe_context')['camera'];save()
report['saveKey']=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800});save()
if not report['saveKey'].get('focused'):
    print('Save key did not acquire focus; course persistence is unverified.',flush=True)
print('Evidence',out,flush=True)
