// Policy tests use the actual game script; native physics is tested separately
// by aim-benchmark.test.ts. No app or profile is opened.
const assert=require('node:assert/strict'),fs=require('node:fs')
const {fixture}=require('./check_m8.cjs')
const personas=JSON.parse(fs.readFileSync('world/Game/personas.json','utf8'))
function setup(){
 const f=fixture();f.m.turnNumber=8;f.api.setPersonas(personas);f.m.cpuSkill='expert'
 f.talus.world.wind=0;f.talus.world.raycast=()=>null;f.talus.world.groundY=()=>null
 const p=f.m.roster[0],target=f.m.roster[1],tank=f.actors.get(p.entityId),enemy=f.actors.get(target.entityId)
 const requests=[]
 tank.weapon.plan=async r=>{requests.push(structuredClone(r));return{status:'clear',reason:'clear',warnings:[],work:{candidates:1},solution:{angle:r.fixedAngle??-.8,power:.5,end:r.target}}}
 function observation(overrides={}){return{turn:8,targetId:target.entityId,weapon:'standard',origin:{...tank.position},target:{...enemy.position},targetAtLaunch:{...enemy.position},
  impact:{x:enemy.position.x-80,y:enemy.position.y},reason:'detonated',collision:'terrain',dx:-80,dy:0,angle:-.8,power:.5,hit:false,direct:false,
  solution:{kind:'tank',offsetX:0},wind:0,...overrides}}
 return{...f,p,target,tank,enemy,requests,observation}
}
async function main(){
 {
  const f=setup();f.api.observeCpuShot(f.p,f.observation());const m=f.api.fireControl(f.p,f.target.entityId,'standard')
  assert.ok(m.offsetX>0,'An actual short impact increases requested range')
  assert.equal(await f.api.planCpuShot(f.p,8),true);assert.equal(f.requests[0].fixedAngle,-.8);assert.ok(f.requests[0].target.x>f.enemy.position.x)
  assert.equal(f.requests[0].angleOffset,0);assert.equal(f.requests[0].powerOffset,undefined)
  const learned=m.offsetX;f.tank.position.x+=55
  await f.api.planCpuShot(f.p,8);assert.equal(f.p.fireSolution.offsetX,learned,'Normal repositioning preserves measured range bias')
  f.tank.position.y+=100;f.requests.length=0;await f.api.planCpuShot(f.p,8)
  assert.equal(f.p.fireSolution.offsetX,0,'A large changed elevation invalidates that geometric correction')
  assert.equal(m.offsetX,learned,'Invalidation does not destroy the stored evidence')
 }
 {
  const f=setup();f.api.observeCpuShot(f.p,f.observation({dx:1,dy:0,hit:true,direct:true,power:.37,angle:-1.1}))
  const m=f.api.fireControl(f.p,f.target.entityId,'standard'),saved=JSON.stringify(m.best)
  f.p.fireControls=JSON.parse(JSON.stringify(f.p.fireControls))
  for(let n=0;n<5;n++)await f.api.planCpuShot(f.p,8)
  assert.ok(f.requests.every(r=>r.fixedAngle===-1.1&&r.angleOffset===0&&!r.powerOffset));assert.equal(f.p.aiRng,undefined,'Aiming never rolls artificial skill noise')
  f.api.observeCpuShot(f.p,f.observation({turn:9,dx:55,hit:false,solution:{kind:'tank',offsetX:-12}}))
  const after=f.api.fireControl(f.p,f.target.entityId,'standard')
  assert.equal(JSON.stringify(after.best),saved,'A subsequent worse shot cannot erase the successful angle/power')
  assert.equal(after.offsetX,after.best.offsetX);assert.equal(after.gain,.5,'Correction gain shrinks after regression')
  f.api.observeCpuShot(f.p,f.observation({turn:10,dx:0,dy:0,hit:true,direct:false}))
  assert.equal(JSON.stringify(after.best),saved,'A numerically closer splash cannot replace a direct hit')
  const requests=f.requests.length;f.api.bank.players.alpha.stock['fuel-tank']=5;f.m.remaining=30
  await f.api.exploreCpu(f.p,8,()=>true);assert.equal(f.requests.length,requests);assert.equal(f.p.aiRng,undefined,'A successful emplacement does not randomly wander away')
 }
 for(const overrides of [
  {reason:'lifetime'}, {reason:'removed'}, {split:true}, {solution:{kind:'apex'}}, {solution:{kind:'terrain'}},
  {collision:'body'}, {dy:200}, {dx:-1000}, {target:{x:9999,y:650}},
 ]){
  const f=setup();f.api.observeCpuShot(f.p,f.observation(overrides));const m=f.api.fireControl(f.p,f.target.entityId,'standard')
  assert.equal(m.samples,0,JSON.stringify(overrides));assert.equal(m.offsetX,0)
 }
 {
  const f=setup();f.api.observeCpuShot(f.p,f.observation());f.api.observeCpuShot(f.p,f.observation({weapon:'heavy',dx:50}))
  assert.ok(f.api.fireControl(f.p,f.target.entityId,'standard').offsetX>0);assert.ok(f.api.fireControl(f.p,f.target.entityId,'heavy').offsetX<0,'Weapons retain separate corrections')
  for(let n=0;n<100;n++)f.api.observeCpuShot(f.p,f.observation({weapon:'weapon-'+n,reason:'removed'}))
  assert.equal(f.p.fireControls.length,64);assert.equal(f.p.impacts.length,64)
 }
 {
  const f=setup();f.api.observeCpuShot(f.p,f.observation({dx:0,dy:0,hit:true,direct:true,power:.37,angle:-1.1,solution:{kind:'field',offsetX:0}}))
  f.tank.weapon.plan=async()=>({status:'refused',reason:'deflection-fields',work:{candidates:0}})
  await f.api.planCpuShot(f.p,8);assert.equal(f.tank.blackboard.get('custom.aimAngle'),-1.1);assert.equal(f.tank.blackboard.get('custom.aimPower'),.37)
  assert.equal(f.tank.blackboard.get('custom.aimPlan'),null,'Observed field hit is never misrepresented as a clear native forecast')
 }
 {
  const f=setup();f.p.shotFrom={...f.tank.position};f.m.attack={owner:f.p.entityId,item:'standard',targetId:f.target.entityId,targetAtLaunch:{...f.enemy.position},
   ids:{123:{depth:0,split:false,launch:{x:6000,y:640,vx:500,vy:-500},launchClock:0}},rootId:123,ended:0,pending:[],angle:-.8,power:50,
   solution:{kind:'tank',offsetX:0},wind:0}
  f.emit('projectile.hit',{projectileId:123,targetStableId:f.target.entityId,amount:80,direct:true})
  f.emit('projectile.end',{projectileId:123,x:f.enemy.position.x,y:f.enemy.position.y,reason:'detonated'})
  const m=f.api.fireControl(f.p,f.target.entityId,'standard');assert.equal(m.hits,1);assert.equal(m.best.power,.5);assert.equal(m.best.angle,-.8)
  f.emit('projectile.end',{projectileId:123,x:f.enemy.position.x,y:f.enemy.position.y,reason:'detonated'});assert.equal(m.hits,1,'Duplicate end cannot learn twice')
  assert.equal(f.p.impacts[0].launch.vx,500,'Observed velocity is retained for actual-versus-planned diagnosis')
 }
 {
  const f=setup();await f.api.planCpuShot(f.p,8)
  f.m.phase='telegraph';f.tank.position.x+=30
  let fired=0;f.tank.weapon.fire=()=>{fired++;return true}
  f.tank.weapon.state.angle=-.8
  f.api.performAttack(f.p)
  assert.equal(fired,0,'No immediate trigger with a stale firing position')
  for(let n=0;n<5;n++)await new Promise(resolve=>setImmediate(resolve))
  assert.equal(fired,1);assert.equal(f.requests.at(-1).maxCandidates,1,'One bounded native recheck after settling during speech')
  assert.equal(f.p.fireSolution.origin.x,f.tank.position.x);assert.equal(f.m.phase,'firing')
 }
 console.log('PASS: per-target/weapon feedback, directional correction, pose validity, persistent successful solutions, no rerolled skill noise, regression rollback, held emplacement, diagnostic exclusions, bounded records, magnetic hit reuse, real event integration and duplicate-end isolation')
}
main().catch(e=>{console.error(e);process.exitCode=1})
