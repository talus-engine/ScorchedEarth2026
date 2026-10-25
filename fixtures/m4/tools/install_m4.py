"""Install Indigo M4 tank rig, ballistic CPU graph, feedback and game files."""
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script
from install_m1 import save_template

ctx = call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId'] == WORLD_ID, 'Open the Indigo template editor first'

def node(node_id, kind, title, props, x, y):
    descriptor = call('describe_behavior_nodes', {'type': kind})['nodes'][0]
    return {'id': node_id, 'type': kind, 'title': title, 'pos': [x,y], 'size': [260,100],
            'properties': props, 'inputs': [{'name': p['name'], 'type': -1 if p['slotType']=='ACTION' else p['slotType'], 'link': None} for p in descriptor['inputs']],
            'outputs': [{'name': p['name'], 'type': -1 if p['slotType'] in ('ACTION','EVENT') else p['slotType'], 'links': []} for p in descriptor['outputs']]}

def event(name):
    return "talus.emit('indigo:"+name+"', {id:self.id, turn:JSON.parse(bb.__hookData).turn})"
nodes=[node(1,'ai/flow/Sequence','Choose, solve, show, fire',{},40,80),
 node(2,'ai/script/ScriptAction','Choose target and terrain tactic',{'code':event('cpu-plan')},350,0),
 node(3,'ai/flow/Selector','Solve or pass',{},350,160),
 node(4,'ai/flow/Selector','Prefer a high arc in pits',{},650,0),
 node(5,'ai/flow/Sequence','High arc when terrain rises',{},950,0),
 node(6,'ai/script/ScriptCondition','Pit or obstructed previous shot',{'code':"self.blackboard.get('custom.highArc') === true"},1250,0),
 node(7,'ai/action/Aim_Ballistic','Engine high arc',{'targetKey':'custom.indigoTarget','preferHighArc':True,'angleErrorDeg':0,'powerError':0},1250,150),
 node(8,'ai/action/Aim_Ballistic','Engine standard arc',{'targetKey':'custom.indigoTarget','preferHighArc':False,'angleErrorDeg':0,'powerError':0},950,300),
 node(9,'ai/script/ScriptAction','No feasible shot: pass',{'code':event('cpu-unreachable')},650,400),
 node(10,'ai/script/ScriptAction','Publish solved angle and power',{'code':event('cpu-aimed')},350,400),
 node(11,'ai/action/Wait','Show the shot choice',{'minSec':1.4,'maxSec':1.4},350,560),
 node(12,'ai/script/ScriptAction','Request one shot',{'code':event('cpu-fire')},350,720)]
links=[]
for src,slot,dst in [(1,0,2),(1,1,3),(1,2,10),(1,3,11),(1,4,12),(3,0,4),(3,1,9),(4,0,5),(4,1,8),(5,0,6),(5,1,7)]:
    link=len(links)+1;nodes[src-1]['outputs'][slot]['links']=[link];nodes[dst-1]['inputs'][0]['link']=link
    links.append([link,src,slot,dst,0,-1])
graph={'last_node_id':12,'last_link_id':len(links),'nodes':nodes,'links':links,'groups':[],'config':{},'extra':{},'version':0.4}
(ROOT/'world/Graphs/cpu-turn.json').write_text(json.dumps(graph,indent=2)+'\n')
ids_path=ROOT/'assets/m4-ids.json'
ids=json.loads(ids_path.read_text()) if ids_path.exists() else {k:v for k,v in json.loads((ROOT/'assets/m3-ids.json').read_text()).items() if k.endswith('Story')}
result=call('save_behavior_graph',{'graphName':'Indigo M4 CPU turn','graphType':'command','graphData':graph,
    'description':'Choose a target; use engine ballistic aiming with a high-arc terrain tactic; publish, think, and request one shot.',
    **({'graphId':ids['cpuGraph']} if ids.get('cpuGraph') else {})})
ids['cpuGraph']=result['graphId'];ids_path.write_text(json.dumps(ids,indent=2)+'\n')
print('CPU command graph',result,flush=True)
for key,name,file in [('turnStory','Indigo Turn','turn.ink'),('resultStory','Indigo Result','result.ink')]:
    result=call('save_ink_story',{'scriptName':name,'source':(ROOT/'world/Dialogue'/file).read_text(),
        **({'scriptId':ids[key]} if ids.get(key) else {})})
    ids[key]=result['scriptId'];ids_path.write_text(json.dumps(ids,indent=2)+'\n');print('Ink',name,result,flush=True)
iron=script('return talus.elements.get("IRON").id')
def rect(x,y,w,h,color):
    # Authored RGB -> Talus packed RGBA (AABBGGRR), with an opaque alpha.
    packed=0xff000000 | ((color & 0xff)<<16) | (color & 0xff00) | ((color>>16)&0xff)
    return [{'localX':xx,'localY':yy,'elementType':iron,'color':packed}for yy in range(y,y+h)for xx in range(x,x+w)]
ids['shell']=save_template('indigo/m4-shell','indigo/shell',{'itemData':{'modSpec':{'projectile':{'speed':3000,'speedAtMinPower':80}}}})
ids['cannon']=save_template('indigo/m4-cannon','indigo/cannon',{
    'itemData':{'startingMods':['indigo/m4-shell']},
    'bodies':[{'bodyIndex':0,'name':'Artillery barrel','isStatic':False,'pixels':rect(-16,-2,32,4,0xdec8a5)}],
    'joints':[]})
# A real aim limb uses the engine animator and held-item attachment, with no game-side rendering shim.
ids['tank']=save_template('indigo/m4-tank','indigo/tank',{
    'startingItems':['indigo/m4-cannon'],'heldItemAnchor':{'x':0,'y':14},
    'bodies':[{'bodyIndex':0,'name':'Tank hull','role':'torso','isStatic':False,
       'pixels':rect(-20,-8,40,16,0x524b3b)+rect(-17,-14,34,6,0xad9682)+rect(-8,-20,16,6,0xcfbaa4)},
      {'bodyIndex':1,'name':'Turret aim pivot','role':'weapon','isStatic':False,'aimAtTarget':True,'pixels':rect(-2,-13,4,4,0xcfbaa4)}],
    'joints':[{'type':'hinge','bodyA':0,'bodyB':1,'anchorALocalX':0,'anchorALocalY':-10,'anchorBLocalX':0,'anchorBLocalY':0}]})
ids_path.write_text(json.dumps(ids,indent=2)+'\n')
config=json.loads((ROOT/'world/Game/arena.json').read_text())
config.update({'cpuGraph':ids['cpuGraph'],'moveSpeed':55,'tankTemplate':ids['tank'],'impactWaitTicks':180})
(ROOT/'world/Game/arena.json').write_text(json.dumps(config,indent=2)+'\n')
actions=[{'id':name,'label':label,'keys':[key],'pad':[]}for name,label,key in [
    ('tank_angle_up','Tank aim left','ArrowLeft'),('tank_angle_down','Tank aim right','ArrowRight'),
    ('tank_power_up','Tank power up','ArrowUp'),('tank_power_down','Tank power down','ArrowDown'),
    ('tank_fire','Fire cannon',' '),('tank_pass','Pass turn','Enter')]]
# Movement has dedicated actions so aiming arrows do not also move the hull.
actions += [{'id':'tank_move_left','label':'Tank move left','keys':['a'],'pad':[]},
            {'id':'tank_move_right','label':'Tank move right','keys':['d'],'pad':[]}]
result=script('const ui=await talus.editor.records.get("gameUi");Object.assign(ui,'+
    json.dumps({'tabMenuEnabled':False,'showLevelXp':False,'showGold':False,'showEnergy':False,
                'cameraFollow':'off','maxLocalPlayers':1,'inputActions':actions})+
    ');return await talus.editor.records.save("gameUi",ui)')
(ROOT/'world/Game/input.json').write_text(json.dumps(result,indent=2)+'\n')
for path in ['Game/arena.json','Menus/setup.html','Menus/hud.html','Scripts/match.ts']:
    call('write_world_file',{'worldId':WORLD_ID,'path':path,'content':(ROOT/'world'/path).read_text()})
    print('installed',path,flush=True)
print('saved',script('await talus.editor.save();return true'),flush=True)
