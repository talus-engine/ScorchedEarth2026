const assert=require('node:assert/strict'),fs=require('node:fs')
const {fixture}=require('./check_m8.cjs')
function scene(){
 const f=fixture(); const {talus,actors,api,m}=f;const fired=[],plates=[],texts=[],centers=[],order=[],holds=[];let nextId=1
 const track=talus.camera.track.bind(talus.camera);talus.camera.track=(target,options)=>{const state=track(target,options);centers.push({...state.center});order.push('camera');return state}
 talus.ui.nameplate=(e,p)=>plates.push({id:e.id,...p});talus.ui.banner=()=>{};talus.ui.worldText=(id,spec)=>{texts.push({id,spec});order.push(spec?'speech':'remove')}
 talus.state.set=()=>{};talus.world.watchSettle=()=>({done:new Promise(()=>{})})
 talus.world.explode=()=>{};talus.dialogue={active:false};talus.entities.get=id=>actors.get(id)
 const shots=new Map();talus.projectiles={get:id=>shots.get(id),launch(spec){
  const id=nextId++,owner=actors.get(typeof spec.owner==='string'?spec.owner:spec.owner.id)
  const snap={id,x:spec.x,y:spec.y,vx:spec.vx||0,vy:spec.vy||0,age:0}
  const h={id,spec,exists:true,snapshot:()=>h.exists?snap:null,remove(){h.exists=false;f.emit('projectile.end',{projectileId:id,owner,x:snap.x,y:snap.y})},detonate(){this.remove()},setTarget(){return true}}
  shots.set(id,h);f.emit('projectile.launch',{projectileId:id,owner,projectile:h});return h
 }}
 for(const [id,e] of actors){e.controller.levitate=()=>({accepted:true});e.controller.state={enabled:true,grounded:true};e.controller.posture={status:'complete'};e.controller.setPosture=config=>{e.controller.posture={config,status:'complete'};return {accepted:true,reason:'ok'}};e.controller.seat=async spec=>{e.controller.setPosture(spec.posture);return {terrain:{status:'completed',accepted:10},posture:{accepted:true,reason:'ok'}}};e.controller.holdPose=seconds=>{holds.push({id,seconds,clock:talus.sim.clock});return {accepted:true,reason:'ok',seconds}};e.blackboard.set('custom.angle',45);e.blackboard.set('custom.power',30);e.snapshot=()=>({x:e.x,y:650,vy:0,alive:e.alive});e.setVelocity=()=>{};e.despawn=()=>{e.exists=false};e.weapon.fire=()=>{fired.push({id,clock:talus.sim.clock});talus.projectiles.launch({owner:e,x:e.x+36,y:600,vx:400,vy:-200});return true}}
 return {...f,fired,plates,texts,centers,order,holds,shots}
}
async function main(){
{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId),wallet=f.api.bank.players.alpha
 const item=f.shop.items.find(i=>i.id==='parachute');item.enabled=true
 let grounded=true
 e.controller.configureFallBrake=config=>{e.controller.fallBrake={config,charges:0,deployed:false,remaining:0};return {accepted:true}}
 e.controller.chargeFallBrake=n=>{e.controller.fallBrake.charges+=n;return {accepted:true,added:n}}
 e.controller.removeFallBrakeCharges=n=>{const s=e.controller.fallBrake,removed=Math.min(n,s.charges);s.charges-=removed;return {accepted:true,removed}}
 e.controller.deployFallBrake=on=>{const s=e.controller.fallBrake;if(grounded)return {accepted:false,reason:'grounded',consumed:0};if(s.deployed)return {accepted:true,consumed:0};if(!s.charges)return {accepted:false,reason:'empty',consumed:0};s.charges--;s.deployed=on;s.remaining=item.controller.duration;return {accepted:true,consumed:1}}
 wallet.stock.parachute=3
 assert.equal(f.api.useParachute(p),false);assert.equal(wallet.stock.parachute,3,'Refused grounded deployment cannot consume inventory')
 grounded=false
 assert.equal(f.api.useParachute(p),true);assert.equal(wallet.stock.parachute,2);assert.equal(e.controller.fallBrake.charges,2)
 assert.equal(f.api.useParachute(p),true);assert.equal(wallet.stock.parachute,2,'Repeated deployment consumes once')
 wallet.stock.parachute=1;e.controller.fallBrake.charges=3
 f.api.syncUtilities(p);assert.equal(e.controller.fallBrake.charges,1,'Old saved body cannot duplicate paid charges')
 assert.equal(e.controller.fallBrake.deployed,true,'Reconciliation preserves already paid descent')
 e.controller.fallBrake.deployed=false;assert.equal(f.api.useParachute(p),true);assert.equal(wallet.stock.parachute,0)
 assert.equal(f.api.useParachute(p),false,'Empty inventory cannot redeploy')
}

{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId),w=f.api.bank.players.alpha
 const item=f.shop.items.find(i=>i.id==='fuel-tank');item.enabled=true;w.stock['fuel-tank']=6
 const driveCalls=[]
 e.controller.groundDrive=null
 e.controller.configureGroundDrive=config=>{e.controller.groundDrive={config,fuel:0,distance:0,spent:0};return {accepted:true}}
 e.controller.addGroundFuel=n=>{e.controller.groundDrive.fuel+=n;return {accepted:true,addedSeconds:n}}
 e.controller.removeGroundFuel=n=>{e.controller.groundDrive.fuel-=n;return {accepted:true,removedSeconds:n}}
 e.controller.drive=n=>{driveCalls.push(n);return {accepted:!!e.controller.groundDrive.fuel}}
 f.api.syncUtilities(p);assert.equal(e.controller.groundDrive.fuel,6)
 f.api.driveTank(p,55);assert.equal(driveCalls.at(-1),1)
 f.api.accountSupply(p);assert.equal(w.stock['fuel-tank'],6,'Held request without accepted work costs nothing')
 e.controller.groundDrive.spent=.25;e.controller.groundDrive.fuel=5.75;e.controller.groundDrive.distance=13.75
 f.api.accountSupply(p);assert.equal(w.stock['fuel-tank'],5.75,'Native work counter is the sole movement debit')
 f.api.accountSupply(p);assert.equal(w.stock['fuel-tank'],5.75,'Same native meter cannot debit twice')
 e.controller.groundDrive.fuel=4;f.api.accountSupply(p)
 assert.equal(w.stock['fuel-tank'],5.75,'A supply transfer without motor work is not paid movement')
 f.api.syncUtilities(p);assert.equal(e.controller.groundDrive.fuel,5.75)
 w.stock['fuel-tank']=2;e.controller.groundDrive.fuel=8;f.api.syncUtilities(p)
 assert.equal(e.controller.groundDrive.fuel,2,'Restored body cannot duplicate bank stock')
 f.api.input(false);assert.equal(driveCalls.at(-1),0,'Turn/presentation boundary stops propulsion')
}

{
 const f=scene(),p=f.m.roster[0];p.weaponId='standard';await f.api.fire()
 assert.equal(f.m.phase,'telegraph');assert.equal(f.fired.length,0);assert.equal(f.talus.game.saveStatus.allowed,false)
 f.api.tickPresentation();const start=f.talus.sim.clock
 assert.equal(f.texts.at(-1).spec.size,36);assert.equal(f.texts.at(-1).spec.maxWidth,720);assert.ok(f.texts.at(-1).spec.text);assert.equal(f.texts.at(-1).spec.entity.id,p.entityId);assert.deepEqual(f.order.slice(-2),['camera','speech']);assert.ok(f.plates.every(v=>!v.text.includes('“')))
 assert.equal(f.centers.at(-1).x,f.actors.get(p.entityId).x)
 f.talus.sim.clock=start+2.999;f.api.tickPresentation();assert.equal(f.fired.length,0)
 f.talus.sim.clock=start+3;f.api.tickPresentation();assert.equal(f.fired.length,1);assert.equal(f.m.phase,'flight')
 assert.equal(f.texts.at(-1).spec,null);assert.equal(f.order.at(-1),'remove');assert.equal(f.m.attack.launched,1)
 f.shots.get(f.m.attack.rootId).remove();f.api.tickAttack();assert.equal(f.m.phase,'settling');assert.equal(f.m.attack,null)
}
{
 const f=scene(),[a,b]=f.m.roster;f.api.eliminate(a,'test');f.api.eliminate(b,'test');f.api.eliminate(a,'duplicate')
 assert.equal(f.m.presentation.queue.length,2);assert.equal(f.m.chaos.jobs.length,0);assert.deepEqual(f.holds.map(h=>h.seconds),[120,120],'Both queued wrecks receive bounded native holds before camera travel')
 f.api.tickPresentation();const t=f.talus.sim.clock
 f.talus.sim.clock=t+2.9;f.api.tickPresentation();assert.equal(f.m.chaos.jobs.length,0)
 f.talus.sim.clock=t+3;f.api.tickPresentation();assert.equal(f.m.chaos.jobs.length,1)
 assert.equal(f.m.presentation.active.owner,a.entityId);assert.equal(f.m.presentation.active.stage,'effect')
 assert.equal(f.talus.game.saveStatus.allowed,false,'Death camera watch retains its save barrier')
 f.api.tickPresentation();assert.equal(f.m.presentation.active.owner,a.entityId,'No simulation advance means no death-watch advance')
 f.talus.sim.clock=t+5.499;f.api.tickPresentation();assert.equal(f.m.presentation.active.owner,a.entityId)
 f.talus.sim.clock=t+5.5;f.api.tickPresentation();assert.equal(f.m.presentation.active,null)
 f.api.tickPresentation();assert.equal(f.m.presentation.active.owner,b.entityId,'Next death centers only after the previous 2.5-second watch')
 f.talus.sim.clock+=3;f.api.tickPresentation();assert.equal(f.m.chaos.jobs.length,2)
 f.talus.sim.clock+=2.5;f.api.tickPresentation()
 assert.equal(f.m.presentation.active,null);assert.equal(f.m.presentation.queue.length,0);assert.deepEqual(f.holds.slice(-2).map(h=>h.seconds),[0,0])
}
{
 const f=scene(),p=f.m.roster[0];p.weaponId='standard';await f.api.fire();f.api.tickPresentation();f.api.eliminate(p,'interrupted')
 f.talus.sim.clock+=10;f.api.tickPresentation();assert.equal(f.fired.length,0,'Death cancels unlaunched shot')
 f.talus.sim.clock+=3;f.api.tickPresentation();assert.equal(f.fired.length,0);assert.equal(f.m.chaos.jobs.length,1)
}
{
 const f=scene(),p=f.m.roster[0];f.api.bank.players.alpha.stock.mirv=2;p.weaponId='mirv';await f.api.fire();f.api.tickPresentation();f.talus.sim.clock+=3;f.api.tickPresentation()
 const root=f.shots.get(f.m.attack.rootId);root.snapshot().vy=1;f.api.tickAttack()
 for(const [id,h] of f.shots)if(id!==1)assert.deepEqual(h.spec.detonate.looseMatter,{states:['solid','powder']},'Native child shells preserve the authored rain-contact policy');
 assert.equal(f.m.attack.launched,6);assert.equal(f.m.attack.ended,1);assert.equal(f.api.bank.players.alpha.stock.mirv,1,'One MIRV costs one unit, including five warheads')
 const children=[...f.shots.values()].filter(s=>s.exists);assert.equal(children.length,5);assert.equal(children.reduce((sum,h)=>sum+h.snapshot().vx,0)/5,400,'MIRV keeps the carrier horizontal momentum')
 for(const h of children.slice(0,4))h.remove();f.api.tickAttack();assert.ok(f.m.attack,'Four impacts must not advance while the fifth warhead is alive')
 children[4].remove();f.api.tickAttack();assert.equal(f.m.attack,null);assert.equal(f.m.phase,'settling')
}
{
 const f=scene(),p=f.m.roster[0];f.api.bank.players.alpha.stock.mirv=2;p.weaponId='mirv';await f.api.fire();f.api.tickPresentation();f.talus.sim.clock+=3;f.api.tickPresentation()
 const carrier=[...f.shots.values()][0];carrier.remove();carrier.remove();f.api.tickAttack()
 assert.equal(f.m.attack.launched,6,'Early terrain impact releases all five warheads exactly once')
 assert.equal(f.api.bank.players.alpha.stock.mirv,1,'Impact fallback consumes only the original MIRV')
 const children=[...f.shots.values()].filter(s=>s.exists);assert.equal(children.length,5)
 for(const h of children)h.remove();f.api.tickAttack();assert.equal(f.m.attack,null,'Early-impact children do not recursively split')
}
{
 const f=scene(),p=f.m.roster[0];f.api.bank.players.alpha.stock['machine-gun']=1;p.weaponId='machine-gun';await f.api.fire();f.api.tickPresentation();f.talus.sim.clock+=3;f.api.tickPresentation()
 for(let n=0;n<11;n++){for(const h of f.shots.values())if(h.exists)h.remove();f.talus.sim.clock+=.081;f.api.tickAttack();assert.ok(f.m.attack,'Burst remains active between bullets');assert.equal(f.talus.game.saveStatus.allowed,false,'Save stays blocked between bullets')}
 assert.equal(f.m.attack.launched,12);assert.equal(f.api.bank.players.alpha.stock['machine-gun'],0)
 for(const h of f.shots.values())if(h.exists)h.remove();f.api.tickAttack();assert.equal(f.m.attack,null)
}
{
 const f=scene();const seen=new Set();for(let n=0;n<500;n++)seen.add(f.api.nextQuip('shooting').id);assert.equal(seen.size,500)
 const shop=JSON.parse(fs.readFileSync('world/Game/shop.json','utf8'))
 assert.equal(new Set(shop.items.map(i=>i.id)).size,shop.items.length)
 assert.equal(shop.items.filter(i=>i.original&&i.kind==='weapon').length,33)
 assert.equal(shop.items.filter(i=>i.original&&i.kind==='utility').length,15)
 for(const i of shop.items.filter(i=>!i.enabled))assert.ok(i.requires,i.id+' needs an explicit engine dependency')
}
{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId),w=f.api.bank.players.alpha
 w.stock['auto-defense']=1;w.stock.shield=1
 e.defenses.state={shield:{remaining:60,active:false,spec:{capacity:120}}}
 e.defenses.activate=(kind,on)=>{e.defenses.state[kind].active=on;return{accepted:true}}
 f.api.autoDefend();assert.equal(w.stock['auto-defense'],0);assert.equal(e.defenses.state.shield.active,true)
 f.api.autoDefend();assert.equal(w.stock['auto-defense'],0,'Automatic defense is consumed once per round')
}
{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId),w=f.api.bank.players.alpha
 p.control='human';w.stock['lazy-boy']=2;let requests=0;e.runGraph=()=>{requests++}
 assert.equal(f.api.useAutoAim(p),true);assert.equal(f.api.useAutoAim(p),false);assert.equal(requests,1)
 assert.equal(w.stock['lazy-boy'],2,'Unresolved assistance does not consume stock')
 e.blackboard.set('custom.aimAngle',-Math.PI/3);e.blackboard.set('custom.aimPower',.42)
 f.api.cpuAimed({id:p.entityId,turn:f.m.turnNumber});assert.equal(w.stock['lazy-boy'],1)
 assert.ok(Math.abs(e.blackboard.get('custom.angle')-60)<1e-8);assert.equal(e.blackboard.get('custom.power'),42)
 f.api.cpuAimed({id:p.entityId,turn:f.m.turnNumber});assert.equal(w.stock['lazy-boy'],1,'Duplicate callbacks debit once')
 f.emit('indigo:cpu-fire',{id:p.entityId,turn:f.m.turnNumber});assert.equal(f.fired.length,0,'Assisted human keeps firing control')
 assert.equal(f.api.useAutoAim(p),true);f.emit('indigo:cpu-unreachable',{id:p.entityId,turn:f.m.turnNumber})
 assert.equal(w.stock['lazy-boy'],1,'A refused native solve retains the charge')
 f.api.cpuAimed({id:p.entityId,turn:f.m.turnNumber});assert.equal(w.stock['lazy-boy'],1,'A stale callback cannot spend a refused attempt')
}
{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId);p.control='human';p.weaponId='heavy';f.api.bank.players.alpha.stock.heavy=2
 e.controller.posture={status:'blocked'};e.controller.state.grounded=false
 e.controller.seat=()=>{throw new Error('Firing must not seat or displace terrain')}
 e.controller.setPosture=()=>{throw new Error('Firing must not force righting')}
 await f.api.fire();assert.equal(f.m.phase,'telegraph');assert.equal(f.api.bank.players.alpha.stock.heavy,2)
 assert.equal(f.fired.length,0,'The existing speech interval still precedes firing')
}
{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId);p.control='human';let flips=0
 e.controller.setPosture=config=>{flips++;e.controller.posture={config,status:'blocked'};return {accepted:true}}
 e.controller.seat=()=>{throw new Error('Voluntary flip must not displace terrain')}
 f.emit('input.pressed',{slot:0,action:'tank_flip'});assert.equal(flips,1);assert.equal(f.m.phase,'turn')
 f.emit('input.pressed',{slot:0,action:'tank_flip'});assert.equal(flips,1,'Held/repeated input respects native-command renewal cooldown')
 f.talus.sim.clock+=1;f.emit('menu.hud.flip',{});assert.equal(flips,2)
 await f.api.fire();assert.equal(f.m.phase,'telegraph','A blocked flip does not prevent firing')
}
for (const status of ['moving','blocked','unsupported','complete']) {
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId);f.m.phase='deploying';let waits=0
 e.controller.setPosture=config=>{e.controller.posture={config,status};return {accepted:status!=='unsupported'}}
 e.controller.seat=()=>{throw new Error('Best-effort placement must not edit terrain')}
 f.talus.sleepTicks=async n=>{waits+=n}
 await f.api.preparePlacement(p)
 assert.equal(p.placementReady,true,'Every posture outcome permits deployment')
 assert.equal(waits,status==='moving'?60:0,'Placement waits at most one simulation second')
 assert.equal(f.m.phase,'deploying');assert.equal(e.controller.posture.config.mode,'passive')
}
{
 const f=scene(),p=f.m.roster[0],e=f.actors.get(p.entityId);let flips=0,aims=0
 e.snapshot=()=>({x:e.x,y:650,vy:0,alive:true,angle:.7})
 e.controller.setPosture=config=>{flips++;e.controller.posture={config,status:'blocked'};return {accepted:true}}
 e.controller.seat=()=>{throw new Error('CPU flip must not excavate')};e.runGraph=()=>{aims++}
 f.talus.world.watchSettle=()=>{throw new Error('CPU turn must not require settling')}
 f.talus.world.raycast=()=>null
 e.weapon.plan=async()=>({status:'clear',reason:'clear',warnings:[],solution:{angle:-.7,power:.4},work:{candidates:1}})
 await f.api.prepareCpuTurn(p,f.m.turnNumber)
 assert.equal(flips,1,'CPU chooses the same voluntary flip when tilted');assert.equal(aims,1,'Blocked flip still proceeds to aim')
 assert.equal(f.m.phase,'turn')
}
for (const id of ['riot-charge','riot-blast','dirt-charge','earth-disrupter']) {
 const f=scene(),item=f.shop.items.find(i=>i.id===id)
 assert.equal(item.enabled,true,'Physically verified terrain item is available')
 const a={rootId:81,item:id,owner:'tank-0',angle:Math.PI/2,origin:{x:6000,y:610},tasks:0}
 let complete,request;f.talus.world.terrainWork=spec=>(request=spec,new Promise(resolve=>{complete=resolve}))
 const pending=f.api.terrainPayload(a,{x:6200,y:660},item.behavior)
 assert.equal(a.tasks,1,'Attack waits for native terrain completion');assert.equal(request.bounds.h,1024,'Foundation is excluded')
 assert.equal(request.kind,item.behavior.operation)
 if(id==='earth-disrupter') {
  assert.deepEqual(JSON.parse(JSON.stringify(request.shape)),{x:6200,y:660,radius:80})
  assert.equal(request.fracture.release,'all');assert.equal(request.fracture.overflow,'powder')
 } else {
  assert.equal(request.shape.kind,'polygon');assert.equal(request.shape.points[0].x,6000)
  assert.ok(request.shape.points.slice(1).every(p=>p.y>610),'Native pinned world aim sets the wedge direction')
 }
 if(id.startsWith('riot-')) {assert.equal(request.replacement,'matching');assert.equal(request.recipe.macro.strata[0].element,'SMOKE')}
 if(id==='dirt-charge') {assert.equal(request.replacement,'empty');assert.equal(request.recipe.macro.strata[0].element,'DIRT')}
 complete({status:'refused',reason:'budget-or-capacity',accepted:0});await pending
 assert.equal(a.tasks,0,'Native refusal releases attack waiting')
}
console.log('PASS: Riot matching-only SMOKE, Dirt empty-only fill, native Earth collapse, world-oriented masks, protected foundation and completion/refusal waiting')
console.log('PASS: camera/label/fire order, exact three-second minimum, serialized deaths, interrupted-shot cancellation, MIRV apex split and last-warhead completion, burst lifetime/one-magazine accounting, 500 non-repeating phrases, all 33 original weapons and 15 accessories accounted for, finite native aim assistance, bounded best-effort deployment, R/HUD flip and CPU refusal tolerance')

}
main().catch(e=>{console.error(e);process.exitCode=1})
