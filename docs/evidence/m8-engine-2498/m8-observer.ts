if(!talus.editor.available){
 const report:any={ticks:0,violations:[],residency:[],events:[],damage:[],defense:{},frames:[]}
 const save=()=>talus.state.setJson('m8.native.audit',report)
 for(const name of ['launch','collision','bounce','directHit','hit','detonate','end'])talus.on('projectile.'+name,e=>{report.events.push({event:name,clock:talus.sim.clock,...JSON.parse(JSON.stringify(e))});if(report.events.length>2500)report.events.shift()})
 talus.on('damage',e=>{report.damage.push({clock:talus.sim.clock,...JSON.parse(JSON.stringify(e))});if(report.damage.length>500)report.damage.shift()})
 talus.on('defense',e=>{const key=e.stableId+':'+e.component+':'+e.kind;const s=report.defense[key]??={count:0,amount:0};s.count++;s.amount+=e.amount;s.remaining=e.remaining})
 talus.on('entity.residency',e=>{const m:any=talus.state.getJson('indigo.match');if(m?.roster.some((p:any)=>p.entityId===e.entityKey)){report.residency.push(JSON.parse(JSON.stringify(e)));save()}})
 talus.on('tick.sim.post',()=>{
  const m:any=talus.state.getJson('indigo.match');if(!m)return
  const v=talus.camera.view,b=v.simulationBounds,alive=m.roster.filter((p:any)=>!p.eliminated).map((p:any)=>talus.entities.get(p.entityId)?.snapshot())
  report.ticks++
  const bad=alive.filter((s:any)=>!s||s.residency!=='live'||!b||s.x-20<b.x||s.x+20>=b.x+b.w||s.y-20<b.y||s.y+20>=b.y+b.h)
  if(bad.length&&report.violations.length<100)report.violations.push({clock:talus.sim.clock,phase:m.phase,bad,b})
  if(report.ticks%30===0){report.frames.push({clock:talus.sim.clock,phase:m.phase,turn:m.turnNumber,zoom:v.zoom,roster:alive.map((s:any)=>({id:s?.id,health:s?.health,x:s?.x,y:s?.y}))});if(report.frames.length>1200)report.frames.shift();save()}
 })
 save()
}
