import json
from bridge import ROOT,call
from audit_m2 import script
from m9_live import capture
quiet=script('''for(let n=0;n<1800;n++){const m=talus.state.getJson('indigo.match');if(m.phase==='fault')throw new Error(m.message);if(m.phase==='settling'&&!m.attack&&!m.presentation.active&&!m.presentation.queue.length&&!m.chaos.jobs.length){talus.sim.pause();return {world:talus.world.id,turn:m.turnNumber}}await talus.sleepTicks(1)}throw new Error('No quiet boundary')''')
capture('arsenal-first-pass')
weapons=['baby-nuke','grenade','cluster-grenade','homing-rocket','liquid-dirt','plasma','shotgun','sand']
r=script('''const m=talus.state.getJson('indigo.match'),bank=talus.installed.get('indigo.economy'),weapons='''+json.dumps(weapons)+''';
const before=m.roster.map(p=>({name:p.name,wallet:bank.players[p.name.toLowerCase()]}));
for(let n=0;n<m.roster.length;n++){const p=m.roster[n],w=bank.players[p.name.toLowerCase()];w.stock={[weapons[n]]:3,battery:weapons[n]==='plasma'?3:0};w.selected=weapons[n];w.revision++}
talus.installed.set('indigo.economy',bank);return {before,weapons};''')
(ROOT/'docs/evidence/m9-arsenal-second-grants.json').write_text(json.dumps(r,indent=2)+'\n')
call('write_world_file',{'worldId':quiet['world'],'path':'Scripts/match.ts','content':(ROOT/'world/Scripts/match.ts').read_text()})
script('talus.sim.resume();return true')
print('Second CPU coverage rotation starts after turn',quiet['turn'],flush=True)
