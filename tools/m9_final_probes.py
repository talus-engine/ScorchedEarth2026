import json
from bridge import ROOT,call
from audit_m2 import script
from m9_live import capture
quiet=script('''for(let n=0;n<1800;n++){const m=talus.state.getJson('indigo.match');if(m.phase==='fault')throw new Error(m.message);if(['turn','settling'].includes(m.phase)&&!m.attack&&!m.presentation.active&&!m.presentation.queue.length&&!m.chaos.jobs.length){talus.sim.pause();return {world:talus.world.id,turn:m.turnNumber}}await talus.sleepTicks(1)}throw new Error('No quiet boundary')''')
capture('arsenal-before-nuke')
chaos=json.loads((ROOT/'world/Game/chaos.json').read_text())
for fx in chaos['effects']:fx['enabled']=fx['id']=='nuke'
call('write_world_file',{'worldId':quiet['world'],'path':'Game/chaos.json','content':json.dumps(chaos)})
script('''const m=talus.state.getJson('indigo.match'),bank=talus.installed.get('indigo.economy');let n=0;
for(const p of m.roster.filter(p=>!p.eliminated)){const w=bank.players[p.name.toLowerCase()],id=['grenade','homing-rocket'][n++%2];w.selected=id;w.stock={[id]:3};w.revision++}talus.installed.set('indigo.economy',bank);return true''')
call('write_world_file',{'worldId':quiet['world'],'path':'Scripts/match.ts','content':(ROOT/'world/Scripts/match.ts').read_text()})
print('Diagnostic-only nuke selection and grenade/rocket stock installed at turn',quiet['turn'],flush=True)
# Let boot's public readiness promises finish before delivering native death.
script('talus.sim.resume();await talus.sleepTicks(2);talus.sim.pause();return true')
result=script('''const m=talus.state.getJson('indigo.match');const candidates=m.roster.filter(p=>!p.eliminated&&p.index!==m.focusIndex);const p=candidates.find(p=>talus.entities.get(p.entityId).y<850)||candidates[0];if(!p)throw new Error('Need a victim');const e=talus.entities.get(p.entityId),before=e.snapshot();e.kill('env:m9-native-death-test');talus.sim.resume();return {victim:p.name,before,world:talus.world.id};''')
(ROOT/'docs/evidence/m9-death-nuke-fixture.json').write_text(json.dumps(result,indent=2)+'\n')
print(result['victim'],flush=True)
