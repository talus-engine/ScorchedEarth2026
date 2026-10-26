// Actual committed Talus Rapier WASM; no app, GPU, profile or database.
import {beforeAll, afterAll, expect, test, vi} from 'vitest'
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const arenaRef=vi.hoisted(()=>({current:null as any}))
vi.mock('@/core/TalusEngineCore',async importOriginal=>({...await importOriginal<any>(),engineStoreArena:()=>arenaRef.current}))
import {RapierBridge} from '@/simulation/RapierBridge'
import {makeDefaultRigidBody} from '@/simulation/RigidBody'
import {planBallistic} from '@/simulation/BallisticPlanner'
const require=createRequire(import.meta.url)
const {fixture}=require('./check_m8.cjs')
const personas=JSON.parse(readFileSync('world/Game/personas.json','utf8'))
const rows:any[]=[]
let bridge:RapierBridge, serial=9000
beforeAll(async()=>{
 const {storeArenaFromInstance}=await import('@/core/TalusEngineCore')
 const {instance}=await WebAssembly.instantiate(readFileSync(resolve('../foxtrot/src/assets/wasm/talus_core.wasm')))
 arenaRef.current=storeArenaFromInstance(instance);bridge=new RapierBridge();await bridge.init();bridge.setGravity(0,650)
})
afterAll(()=>{mkdirSync('docs/evidence/cpu-aim',{recursive:true});writeFileSync('docs/evidence/cpu-aim/native-benchmark.json',JSON.stringify({kind:'Actual Rapier WASM flight, game planning policy; static survey fixtures, no evolving GPU air',sha256:Object.fromEntries(['../foxtrot/src/assets/wasm/talus_core.wasm','../foxtrot/src/simulation/BallisticPlanner.ts','world/Scripts/match.ts','world/Game/personas.json'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),rows},null,2)+'\n')})
function setup(direction=1,distance=800,height=0,wind=0,wall=false,weapon='standard'){
 const f=fixture();f.m.cpuSkill='expert';f.m.turnNumber=1;f.api.setPersonas(personas);f.talus.world.wind=wind
 const p=f.m.roster[0],enemy=f.m.roster[1],tank=f.actors.get(p.entityId),target=f.actors.get(enemy.entityId)
 // A durable key is required by native planner request validation.
 f.actors.delete(enemy.entityId);enemy.entityId='target@benchmark';target.id=enemy.entityId;f.actors.set(enemy.entityId,target)
 tank.position={x:5000,y:800};tank.x=5000;target.position={x:5000+direction*distance,y:800-height};target.x=target.position.x
 f.talus.world.raycast=()=>wall?{x:5000+direction*120,y:740}:null;f.talus.world.groundY=()=>null
 if(weapon!=='standard'){f.api.bank.players.alpha.stock[weapon]=100;p.personaId='lucky'}
 let equipped=weapon
 tank.weapon.equip=t=>{equipped=f.shop.items.find((i:any)=>i.template===t)?.id||weapon;tank.weapon.state.equipped=t;return true}
 tank.weapon.plan=async request=>{
  const spec=f.shop.items.find((i:any)=>i.id===equipped).projectile
  const model={origin:{...tank.position},spawnOffset:spec.spawnOffset,inherit:{x:0,y:0},minSpeed:spec.speedAtMinPower,maxSpeed:spec.speed,
   gravity:650*spec.gravityScale,wind,drag:spec.drag,lifetime:spec.lifetime,fuse:0,shape:[{x:-1.5,y:-1.5},{x:1.5,y:1.5}],onTerrain:true}
  return planBallistic(model,request,{prepare:async()=>{},cell:(x,y)=>({element:wall&&Math.abs(x-(5000+direction*140))<30&&y>350?9:0,bodyId:null}),falldown:()=>0,cancelled:()=>false,chunks:()=>0})
 }
 return{...f,p,enemy,tank,target}
}
function fly(solution:any,gravity:number,wind=0,drag=0,targetX:number){
 const body=makeDefaultRigidBody({id:serial++,positionX:solution.origin.x,positionY:solution.origin.y,
  members:[{particleIndex:0,localOffsetX:0,localOffsetY:0,elementType:8,birthColor:0xffffffff}],mass:1,invMass:1,inertia:1,invInertia:1,
  gravityScale:gravity/650,linearDamping:Math.pow(1-drag,1/60)})
 expect(bridge.installBody(body)).toBe(true);bridge.getRapierBody(body.id)!.setLinvel(solution.velocity.x,solution.velocity.y)
 const bodies=new Map([[body.id,body]]),direction=Math.sign(targetX-body.positionX),path:any[]=[]
 let previous={x:body.positionX,y:body.positionY},actual:any=null
 try{for(let i=0;i<1800;i++){
  body.accumulatedForceX=wind*bridge.getRapierBody(body.id)!.mass();bridge.runFrame(bodies)
  const at={x:body.positionX,y:body.positionY};path.push(at)
  if((at.x-targetX)*direction>=0){const t=(targetX-previous.x)/(at.x-previous.x);actual={x:targetX,y:previous.y+(at.y-previous.y)*t};break}previous=at
 }}finally{bridge.uninstallBody(body.id)}
 return{actual,path}
}
for(const scenario of [
 {name:'flat-right',direction:1,distance:800,height:0},
 {name:'flat-left',direction:-1,distance:800,height:0},
 {name:'long-range',direction:1,distance:2304,height:0},
 {name:'raised-target-valley-wall',direction:1,distance:800,height:400,wall:true},
 {name:'wind-right',direction:1,distance:1200,height:100,wind:20},
 {name:'machine-gun-drop',direction:1,distance:800,height:0,weapon:'machine-gun'},
])test(scenario.name,async()=>{
 const f=setup(scenario.direction,scenario.distance,scenario.height,scenario.wind||0,scenario.wall||false,scenario.weapon||'standard')
 expect(await f.api.planCpuShot(f.p,1)).toBe(true)
 const plan=f.tank.blackboard.get('custom.aimPlan'),spec=f.shop.items.find((i:any)=>i.id===f.p.weaponId).projectile
 const result=fly(plan.solution,650*spec.gravityScale,scenario.wind||0,spec.drag,f.target.position.x)
 expect(result.actual).not.toBeNull()
 const error=Math.abs(result.actual.y-f.target.position.y)
 if(scenario.wall)expect(result.path.every(at=>Math.abs(at.x-(5000+scenario.direction*140))>=34||at.y<346)).toBe(true)
 rows.push({name:scenario.name,weapon:f.p.weaponId,origin:f.tank.position,target:f.target.position,
  angleDegrees:plan.solution.angle*180/Math.PI,power:plan.solution.power,actual:result.actual,errorPx:error,
  candidates:f.tank.blackboard.get('custom.aiDecision').trials.map((t:any)=>t.work.candidates)})
 expect(error).toBeLessThan(scenario.weapon==='machine-gun'?8:3)
})
function members(w:number,h:number){return Array.from({length:w*h},(_,i)=>({particleIndex:i,localOffsetX:i%w-(w-1)/2,localOffsetY:Math.floor(i/w)-(h-1)/2,elementType:8,birthColor:0xffffffff}))}
function land(solution:any,wind:number){
 const floor=makeDefaultRigidBody({id:serial++,positionX:5800,positionY:804,members:members(512,4),isStatic:true,invMass:0,invInertia:0})
 const body=makeDefaultRigidBody({id:serial++,positionX:solution.origin.x,positionY:solution.origin.y,members:members(4,4),mass:16,invMass:1/16,inertia:40,invInertia:1/40,gravityScale:1,linearDamping:1})
 bridge.installBody(floor);bridge.installBody(body);bridge.getRapierBody(body.id)!.setLinvel(solution.velocity.x,solution.velocity.y)
 const bodies=new Map([[body.id,body],[floor.id,floor]]);bridge.consumeContactRecords()
 try{for(let i=0;i<1200;i++){
  body.accumulatedForceX=wind*bridge.getRapierBody(body.id)!.mass();bridge.runFrame(bodies)
  const contact=bridge.consumeContactRecords().find(c=>c.phase==='begin'&&[c.bodyAId,c.bodyBId].includes(body.id)&&[c.bodyAId,c.bodyBId].includes(floor.id))
  if(contact)return {x:body.positionX,y:body.positionY,seconds:(i+1)/60}
 }throw Error('No native floor collision')}
 finally{bridge.uninstallBody(body.id);bridge.uninstallBody(floor.id)}
}
test('native impact feedback converges, retains a hit and survives serialization',async()=>{
 const f=setup(),shots:any[]=[]
 // Known unmodelled acceleration is a controlled disturbance, not a claim
 // that changing GPU air fields can be predicted beforehand.
 for(let n=0;n<6;n++){
  f.m.turnNumber=n+1;expect(await f.api.planCpuShot(f.p,n+1)).toBe(true)
  const solution=f.tank.blackboard.get('custom.aimPlan').solution,at=land(solution,-35),dx=at.x-f.target.position.x,dy=at.y-f.target.position.y
  const hit=Math.abs(dx)<=20
  f.api.observeCpuShot(f.p,{turn:n+1,targetId:f.enemy.entityId,weapon:'standard',origin:{...f.tank.position},target:{...f.target.position},targetAtLaunch:{...f.target.position},
   impact:at,reason:'detonated',collision:'terrain',dx,dy,angle:solution.angle,power:solution.power,hit,direct:Math.abs(dx)<=4,wind:0,solution:structuredClone(f.p.fireSolution)})
  shots.push({turn:n+1,angle:solution.angle,power:solution.power,dx,dy,hit,offset:f.p.fireControls[0].offsetX})
  // Model save/reload at each turn; no closure-local hidden aim state.
  f.p.fireControls=JSON.parse(JSON.stringify(f.p.fireControls))
 }
 rows.push({name:'unmodelled-force-learning',actualWind:-35,plannedWind:0,shots})
 expect(Math.abs(shots[0].dx)).toBeGreaterThan(35)
 expect(Math.abs(shots.at(-1).dx)).toBeLessThan(5)
 expect(shots.slice(2).every(s=>s.hit)).toBe(true)
 expect(Math.abs(shots.at(-1).dx)).toBeLessThan(Math.abs(shots[0].dx)*.1)
 const rng=f.p.aiRng
 for(let n=0;n<3;n++){expect(await f.api.planCpuShot(f.p,6)).toBe(true);expect(f.tank.blackboard.get('custom.aimPlan').solution.power).toBeCloseTo(shots.at(-1).power,4)}
 expect(f.p.aiRng).toBe(rng)
})
for(const skill of ['rookie','easy','regular','hard','expert'])test(`${skill} learns without added aim noise`,async()=>{
 const f=setup(),errors:number[]=[];f.m.cpuSkill=skill
 for(let n=0;n<6;n++){
  f.m.turnNumber=n+1;expect(await f.api.planCpuShot(f.p,n+1)).toBe(true)
  const decision=f.tank.blackboard.get('custom.aiDecision')
  expect(decision.trials.reduce((n:number,t:any)=>n+t.work.candidates,0)).toBeLessThanOrEqual(f.api.doctrine(f.p).candidateBudget)
  const solution=f.tank.blackboard.get('custom.aimPlan').solution,at=land(solution,-35),dx=at.x-f.target.position.x,dy=at.y-f.target.position.y
  f.api.observeCpuShot(f.p,{turn:n+1,targetId:f.enemy.entityId,weapon:'standard',origin:{...f.tank.position},target:{...f.target.position},targetAtLaunch:{...f.target.position},
   impact:at,reason:'detonated',collision:'terrain',dx,dy,angle:solution.angle,power:solution.power,hit:Math.abs(dx)<=20,direct:Math.abs(dx)<=4,wind:0,solution:structuredClone(f.p.fireSolution)})
  errors.push(Math.abs(dx))
 }
 rows.push({name:'learning-'+skill,errorsPx:errors});expect(errors.at(-1)).toBeLessThan(6)
 expect(errors.every((e,i)=>!i||e<=errors[i-1]+1)).toBe(true)
})
