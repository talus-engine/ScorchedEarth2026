"""Install Indigo turn rules, UI actions, one NPC command graph and Ink stories."""
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script

ctx = call('engine_describe_context')['world']
assert ctx['isEditorMode'] and ctx['templateId'] == WORLD_ID, 'Open the Indigo template editor first'

def node(node_id, kind, title, props, x, y):
    descriptor = call('describe_behavior_nodes', {'type': kind})['nodes'][0]
    return {'id': node_id, 'type': kind, 'title': title, 'pos': [x,y], 'size': [260,100],
            'properties': props, 'inputs': [{'name': p['name'], 'type': -1 if p['slotType']=='ACTION' else p['slotType'], 'link': None} for p in descriptor['inputs']],
            'outputs': [{'name': p['name'], 'type': -1 if p['slotType'] in ('ACTION','EVENT') else p['slotType'], 'links': []} for p in descriptor['outputs']]}

nodes = [node(1,'ai/flow/Sequence','Aim, think, fire',{},40,140),
         node(2,'ai/script/ScriptAction','Choose target and aim',{'code':"talus.emit('indigo:cpu-plan', {id:self.id, turn:JSON.parse(bb.__hookData).turn})"},370,40),
         node(3,'ai/action/Wait','Think for a moment',{'minSec':1.2,'maxSec':1.2},370,190),
         node(4,'ai/script/ScriptAction','Request one shot',{'code':"talus.emit('indigo:cpu-fire', {id:self.id, turn:JSON.parse(bb.__hookData).turn})"},370,340)]
links=[]
for i in range(3):
    link=i+1; nodes[0]['outputs'][i]['links']=[link]; nodes[i+1]['inputs'][0]['link']=link
    links.append([link,1,i,i+2,0,-1])
graph={'last_node_id':4,'last_link_id':3,'nodes':nodes,'links':links,'groups':[],'config':{},'extra':{},'version':0.4}
(ROOT/'world/Graphs/cpu-turn.json').write_text(json.dumps(graph,indent=2)+'\n')
ids_path=ROOT/'assets/m3-ids.json'
ids=json.loads(ids_path.read_text()) if ids_path.exists() else {}
result=call('save_behavior_graph',{'graphName':'Indigo CPU turn','graphType':'command','graphData':graph,
    'description':'On the active NPC: plan a ranging shot, wait, then request fire through the match authority.',
    **({'graphId':ids['cpuGraph']} if ids.get('cpuGraph') else {})})
ids['cpuGraph']=result['graphId'];ids_path.write_text(json.dumps(ids,indent=2)+'\n')
print('CPU command graph',result,flush=True)
for key,name,file in [('turnStory','Indigo Turn','turn.ink'),('resultStory','Indigo Result','result.ink')]:
    result=call('save_ink_story',{'scriptName':name,'source':(ROOT/'world/Dialogue'/file).read_text(),
        **({'scriptId':ids[key]} if ids.get(key) else {})})
    ids[key]=result['scriptId'];ids_path.write_text(json.dumps(ids,indent=2)+'\n');print('Ink',name,result,flush=True)
config=json.loads((ROOT/'world/Game/arena.json').read_text())
config.update({'cpuGraph':ids['cpuGraph'],'moveSpeed':55})
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
