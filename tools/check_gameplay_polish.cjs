// Policy regression with native contract doubles; no claim of live physics acceptance.
const assert=require('node:assert/strict'),fs=require('node:fs')
const {fixture}=require('./check_m8.cjs')
const read=p=>JSON.parse(fs.readFileSync('world/Game/'+p+'.json','utf8'))
function setup(){
 const f=fixture();f.api.setPersonas(read('personas'));f.api.setSupplies(read('supply-drops'));f.m.cpuSkill='persona';f.m.turnNumber=1;f.m.remaining=30
 f.talus.world.raycast=()=>null;f.talus.world.groundY=()=>670;f.talus.world.findSurface=async()=>670
 f.talus.ui.worldText=()=>{};f.talus.ui.nameplate=()=>{}
 const bodies=new Map();let serial=0
 f.talus.bodies={get:id=>bodies.get(id),find:()=>[...bodies.values()].filter(b=>b.exists),async create(spec){
   const center=spec.cells.reduce((a,c)=>({x:a.x+c.x/spec.cells.length,y:a.y+c.y/spec.cells.length}),{x:0,y:0})
   const b={id:'rigid@'+(++serial),name:spec.name,exists:true,isLive:true,at:{...center,vy:30,sleeping:false},snapshot(){return this.exists?{...this.at}:null},destroy(){this.exists=false}}
   bodies.set(b.id,b);return b
 }}
 f.talus.sleepTicks=async n=>{f.talus.sim.clock+=n/60;for(const b of bodies.values())if(b.exists){b.at.y=Math.min(659,b.at.y+n*3);if(b.at.y>=659){b.at.vy=0;b.at.sleeping=true}}}
 return {...f,bodies}
}
async function main(){
 {
  const f=setup(),p=f.m.roster[0],e=f.actors.get(p.entityId),w=f.api.bank.players.alpha
  p.personaId='domino';w.stock['fuel-tank']=6;p.aiRng=1
  f.shop.items.find(i=>i.id==='fuel-tank').enabled=true
  const drives=[];e.controller.groundDrive={config:{speed:55},fuel:6,spent:0};e.controller.drive=n=>{drives.push(n);return{accepted:true}}
  const start={...e.position};f.talus.sleepTicks=async n=>{f.talus.sim.clock+=n/60;e.position={x:e.position.x+(drives.at(-1)||0)*55*n/60,y:e.position.y}}
  await f.api.exploreCpu(p,1,()=>true)
  assert.ok(Math.abs(e.position.x-start.x)>20,'A clear lane produces real controller-drive requests');assert.equal(drives.at(-1),0)
  assert.equal(w.stock['fuel-tank'],6,'Requests never invent native consumption');assert.ok(p.exploredPositions.length)
  const count=drives.length;await f.api.exploreCpu(p,1,()=>true);assert.equal(drives.length,count,'One exploration per turn across retries')
  f.talus.world.groundY=()=>null;assert.equal(f.api.explorationPath(p,1),null,'Unknown or missing ground is not safe')
  f.talus.world.groundY=()=>e.position.y+100;assert.equal(f.api.explorationPath(p,1),null,'Reject a cliff')
  f.talus.world.groundY=()=>670;f.talus.world.raycast=()=>({x:10,y:10});assert.equal(f.api.explorationPath(p,-1),null,'Reject observed wall')
  f.talus.world.raycast=()=>null;e.position.x=f.m.bounds.x+21;assert.equal(f.api.explorationPath(p,-1),null,'Respect the full world edge')
 }
 {
  const f=setup(),p=f.m.roster[0],e=f.actors.get(p.entityId);p.personaId='lucky';p.aiRng=1
  f.api.bank.players.alpha.stock['fuel-tank']=6;f.shop.items.find(i=>i.id==='fuel-tank').enabled=true
  const drives=[];e.controller.groundDrive={config:{speed:55}};e.controller.drive=n=>drives.push(n)
  let valid=true;f.talus.sleepTicks=async()=>{valid=false}
  await f.api.exploreCpu(p,1,()=>valid);assert.equal(drives.at(-1),0,'Cancellation must release controller intent')
 }
 {
  const a=setup(),b=setup();assert.deepEqual(Array.from({length:20},()=>a.api.supplyRandom()),Array.from({length:20},()=>b.api.supplyRandom()))
  const c=setup();c.m.roster[0].aiRng=999;c.m.chaos.rng=88;assert.equal(c.api.supplyRandom(),setup().api.supplyRandom(),'Drop stream independent of AI and death RNG')
 }
 {
  const f=setup();f.m.phase='focusing';const config=read('supply-drops');config.roundChance=1;config.turnChance=0;f.api.setSupplies(config)
  const remaining=f.m.remaining;await f.api.maybeSupplyDrop('round')
  assert.equal(f.bodies.size,1);const crate=f.m.supplies.crates[0],body=f.bodies.get(crate.bodyId)
  assert.equal(crate.state,'available');assert.equal(f.m.remaining,remaining,'Arrival cannot debit the next turn clock')
  assert.equal(f.m.phase,'focusing');assert.equal(f.m.supplies.active,null);assert.ok(f.talus.camera.requests.length>1,'Smooth camera follows the falling body')
  await f.api.maybeSupplyDrop('round');assert.equal(f.bodies.size,1,'Same boundary cannot reroll')
  f.m.turnNumber++;await f.api.maybeSupplyDrop('turn');assert.equal(f.bodies.size,1,'Separate turn probability is respected')
  const p=f.m.roster[0],e=f.actors.get(p.entityId),w=f.api.bank.players.alpha;const before=w.stock[crate.item]||0
  f.m.phase='turn';e.position={x:body.at.x,y:body.at.y};body.isLive=false;f.api.tickSupplies();assert.equal(crate.state,'available','Stored crates cannot be remotely claimed')
  body.isLive=true;f.api.tickSupplies();assert.equal(crate.state,'collected');assert.equal(w.stock[crate.item],before+crate.units);assert.equal(body.exists,false)
  const stale=structuredClone(crate);stale.state='available';f.api.claimSupply(stale,p);assert.equal(w.stock[crate.item],before+crate.units,'Reopened old world cannot grant the same crate again')
 }
 {
  const f=setup(),config=read('supply-drops');config.roundChance=1;config.maxActive=1;f.api.setSupplies(config);f.m.phase='focusing'
  await f.api.maybeSupplyDrop('round');f.m.round++;await f.api.maybeSupplyDrop('round');assert.equal(f.bodies.size,1,'Unclaimed crate count is bounded')
  const crate=f.m.supplies.crates[0];f.bodies.get(crate.bodyId).at.y=f.m.bounds.y+f.m.bounds.h+10;f.api.tickSupplies();assert.equal(crate.state,'lost')
 }
 {
  const f=setup(),config=read('supply-drops');config.roundChance=1;config.maxFlightSeconds=.3;f.api.setSupplies(config);f.m.phase='focusing'
  f.talus.sleepTicks=async n=>{f.talus.sim.clock+=n/60};await f.api.maybeSupplyDrop('round')
  assert.equal(f.m.supplies.active,null);assert.equal(f.m.supplies.crates[0].state,'available','An unsettled impact never blocks the round forever')
 }
 console.log('PASS: seeded exploration, local cliff/wall/edge safety, cancellation stop, fuel authority, independent supply RNG, native-body arrival, bounded camera hold, no timer debit, pickup residency, one-write claims and crate cap')
}
main().catch(e=>{console.error(e);process.exitCode=1})
