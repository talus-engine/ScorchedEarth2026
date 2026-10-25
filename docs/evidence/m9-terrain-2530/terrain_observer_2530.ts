if (!talus.editor.available) {
  let frames=0,violations=0,launches=0,ends=0,duplicateEnds=0,damage=0;
  const payloads:any[]=[],seenPayloads=new Set<string>();let checkpointed=false;
  const ended=new Set<number>(),events:any[]=[],firstViolations:any[]=[],tail:any[]=[];
  const push=(v:any)=>{events.push(v);if(events.length>160)events.shift()};
  for(const event of ['projectile.launch','projectile.hit','projectile.end','damage','death'])talus.on(event,e=>{
    if(event==='projectile.launch')launches++;
    if(event==='projectile.end'){ends++;if(ended.has(e.projectileId))duplicateEnds++;ended.add(e.projectileId)}
    if(event==='damage')damage+=e.amount||0;
    push({event,clock:talus.sim.clock,id:e.projectileId,owner:e.owner?.id,source:e.source?.id,amount:e.amount,blocked:e.blocked});
  });
  talus.on('tick.sim.post',()=>{
    const m:any=talus.state.getJson('indigo.match');if(!m?.roster?.every(p=>p.entityId))return;
    const records:any[]=talus.state.getJson('indigo.events')||[];
    for(const e of records)if(e.kind==='terrain-payload'){
      const key=e.weapon+':'+e.clock;if(seenPayloads.has(key))continue;seenPayloads.add(key);
      const materials:any={};
      if(['dirt-charge','riot-charge','riot-blast'].includes(e.weapon)){
        const ps=e.shape.points,x0=Math.floor(Math.min(...ps.map(p=>p.x))),x1=Math.ceil(Math.max(...ps.map(p=>p.x))),y0=Math.floor(Math.min(...ps.map(p=>p.y)))-64,y1=Math.ceil(Math.max(...ps.map(p=>p.y)))+64;
        for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const name=talus.world.cell(x,y)?.element?.name;if(name)materials[name]=(materials[name]||0)+1}
      }
      payloads.push({...e,materials,bodies:(e.receipt.fragments||[]).map(id=>talus.bodies.get(id)?.snapshot())});
      talus.state.setJson('m9.terrainPhysicalPayloads',payloads);
    }
    if(!checkpointed&&payloads.length>=12&&talus.game.saveStatus.allowed){checkpointed=true;talus.state.set('m9.terrainCheckpoint',true);talus.sim.pause()}
    const view=talus.camera.view,b=view.simulationBounds;
    const tanks=m.roster.filter(p=>!p.eliminated).map(p=>({id:p.entityId,s:talus.entities.get(p.entityId)?.snapshot()}));
    const safe=view.zoom===.25&&tanks.every(t=>t.s?.residency==='live'&&b&&t.s.x-20>=b.x&&t.s.x+20<b.x+b.w&&t.s.y-20>=b.y&&t.s.y+20<b.y+b.h);
    frames++;if(!safe){violations++;if(firstViolations.length<12)firstViolations.push({clock:talus.sim.clock,phase:m.phase,b,tanks})}
    if(frames%60===0||m.phase==='fault'||m.phase==='finished') {
      tail.push({clock:talus.sim.clock,phase:m.phase,turn:m.turnNumber,safe,tanks});if(tail.length>30)tail.shift();
      talus.state.setJson('m9.terrainAudit',{frames,violations,firstViolations,launches,ends,duplicateEnds,damage,tail,events});
    }
  });
}
