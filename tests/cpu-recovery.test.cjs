const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./support/game.cjs');
function scene(){
 const f=fixture(),p=f.m.roster[0],e=f.actors.get(p.entityId);f.m.turnNumber=2;f.m.remaining=20;
 f.shop.items.find(i=>i.id==='fuel-tank').enabled=true;f.api.wallet(p).stock['fuel-tank']=4;
 f.talus.world.raycast=()=>null;f.talus.world.groundY=()=>660;
 e.blackboard.set('custom.aiDecision',{trials:[{reason:'obstructed'}]});
 let velocity=0;const drives=[];e.controller.groundDrive={config:{speed:55},fuel:4,distance:0,spent:0};
 e.controller.drive=n=>{velocity=n*55;drives.push(n);return {accepted:true}};
 f.talus.sleepTicks=async n=>{f.talus.sim.clock+=n/60;e.position.x+=velocity*n/60;};
 return {...f,p,e,drives};
}
test('bounded recovery moves to a safe paid position then asks for a new native survey',async()=>{
 const f=scene();let surveys=0;const x=f.e.position.x;
 f.game.context.aiming.planCpuShot=async()=>{surveys++;return true};
 assert.equal(await f.api.recoverCpuShot(f.p,2,()=>true),true);
 assert.equal(surveys,1);assert.ok(Math.abs(f.e.position.x-x)>=4);assert.equal(f.drives.at(-1),0);
 assert.equal(await f.api.recoverCpuShot(f.p,2,()=>true),false,'One bounded recovery per turn');
});
test('no fuel, hard refusals, a blocked motor and cancellation do not fabricate progress',async()=>{
 for(const kind of ['fuel','corrupt','blocked','cancel']){
  const f=scene();let surveys=0,valid=true;
  f.game.context.aiming.planCpuShot=async()=>{surveys++;return false};
  if(kind==='fuel')f.api.wallet(f.p).stock['fuel-tank']=0;
  if(kind==='corrupt')f.e.blackboard.set('custom.aiDecision',{trials:[{reason:'terrain-corrupt'}]});
  if(kind==='blocked')f.talus.sleepTicks=async n=>{f.talus.sim.clock+=n/60};
  if(kind==='cancel')f.talus.sleepTicks=async()=>{valid=false};
  assert.equal(await f.api.recoverCpuShot(f.p,2,()=>valid),false);assert.equal(surveys,0);
  if(f.drives.length)assert.equal(f.drives.at(-1),0);
  assert.ok(f.talus.sim.clock<=4.2,'At most two bounded movement windows');
 }
});
test('a new hard refusal stops the second recovery movement',async()=>{
 const f=scene();let surveys=0;
 f.game.context.aiming.planCpuShot=async()=>{surveys++;f.e.blackboard.set('custom.aiDecision',{trials:[{reason:'budget-exhausted'}]});return false};
 assert.equal(await f.api.recoverCpuShot(f.p,2,()=>true),false);assert.equal(surveys,1);
});
