"""Prepare a CPU coverage fixture, with explicitly granted stock and high HP."""
import json,time
from bridge import ROOT,call
from audit_m2 import script
from m9_live import read,observe,capture
end=time.monotonic()+120
while time.monotonic()<end:
 s=read()
 if s['match'] and s['match']['phase']=='fault':raise RuntimeError(s['error'])
 if s['match'] and s['match']['phase']=='ready' and all(e and e['health'] is not None for e in s['roster']):break
 time.sleep(.4)
else:raise TimeoutError('Arsenal fixture did not become ready')
weapons=['machine-gun','flamethrower','funky','napalm','deaths-head','dirt-ball','leapfrog','smoke-tracer']
assert len(s['match']['roster'])==len(weapons)
result=script('''const m=talus.state.getJson('indigo.match'),bank=talus.installed.get('indigo.economy'),weapons='''+json.dumps(weapons)+''';
for(let n=0;n<m.roster.length;n++){const p=m.roster[n],e=talus.entities.get(p.entityId),w=bank.players[p.name.toLowerCase()];
w.stock={[weapons[n]]:3};w.selected=weapons[n];w.revision++;e.blackboard.set('maxHealth',10000);e.blackboard.set('health',10000)}
talus.installed.set('indigo.economy',bank);return {world:talus.world.id,weapons,health:m.roster.map(p=>({name:p.name,health:talus.entities.get(p.entityId).health,maxHealth:talus.entities.get(p.entityId).maxHealth}))};''')
(ROOT/'docs/evidence/m9-arsenal-fixture.json').write_text(json.dumps(result,indent=2)+'\n')
assert all(e['health']==10000 for e in result['health']),result
# Quiet script reload rebinds the cached bank and native ammo using the real game.
call('write_world_file',{'worldId':s['world'],'path':'Scripts/match.ts','content':(ROOT/'world/Scripts/match.ts').read_text()})
time.sleep(1)
observe();capture('arsenal-ready')
call('engine_mouse',{'action':'click','x':341,'y':874})
call('engine_mouse',{'action':'click','x':1316,'y':924})
print('Started CPU fixture with 10,000 HP and three granted rounds of each weapon; these are diagnostic accounts, not a balance/earning test.',flush=True)
