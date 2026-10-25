const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path')
const {cameraMock}=require('./fixture_m12_camera.cjs')
const root=path.resolve(__dirname,'..'),ts=require(require.resolve('typescript',{paths:[path.resolve(root,'../foxtrot')]}))
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))
const catalog=read('world/Game/shop.json'),arena=read('world/Game/arena.json')
const source=fs.readFileSync(path.join(root,'world/Scripts/match.ts'),'utf8')
function fixture(namesText='Alpha\nBravo', native=false, computers=2) {
 const shop=structuredClone(catalog);if(native)for(const i of shop.items)i.enabled=true;else for(const i of shop.items)if(['jetpack','digger','magnet','shield','parachute','fuel-tank'].includes(i.id))i.enabled=false
 const handlers={},values={},installed={},actors=new Map(),ui={},barriers=new Map()
 const talus={editor:{available:false},world:{seed:17,id:'economic-world',generation:{status:()=>({recipeId:'wfc'})},cancelTerrainWork(){}},sim:{clock:1,anchor:()=>({active:true,chunks:[{x:0,y:0}],loaded:1,particles:'simulated',refused:null,update(){},release(){this.active=false}})},elements:{get:name=>({id:{DIRT:8,SAND:3,STONE:9}[name]})},sleepTicks:async()=>{},log(){},after(){},
  game:{setSaveBarrier:(id,reason)=>reason===null?barriers.delete(id):barriers.set(id,reason),get saveStatus(){return {allowed:barriers.size===0}}},
  on:(k,f)=>(handlers[k]??=[]).push(f),state:{getJson:k=>values[k],setJson:(k,v)=>values[k]=structuredClone(v)},
  installed:{get:k=>installed[k],set:(k,v)=>installed[k]=structuredClone(v)},
  players:{list:()=>[]},entities:{get:id=>actors.get(id)},camera:cameraMock(id=>actors.get(id)),
  ui:{set:(k,v)=>typeof k==='string'?ui[k]=v:Object.assign(ui,k),floatText(){},openMenu(){},closeMenu(){}}}
 const code=source.replace(/}\s*$/,`globalThis.api={cameraTank,cameraPoint,trackCamera,cameraArrived,focus,refreshRestoredTanks,boot,prepareReload(){persist();booted=false;booting=false},resumeAfterPresentation,resumeCurrentTurn,restoreFocusAfterBoot,checkRoster,speech,queueChaos,applyBattlefieldPolicy,movementVelocity,targetSnapshot,targetReference,prepareCpuEscape,cpuNoAction,cpuProgress,unlimited,owned,testCpuHooks(advance,retry){if(advance)beginTurn=advance;if(retry)prepareCpuTurn=retry},planCpuShot,doctrine,scoreSeries,nextGeneration,selectTarget,nextPersonaShout,setPersonas(v){personaCatalog=v},showArcadeCard,turnScoreCard,cancelArcade,terrainPayload,driveTank,preparePlacement,flipUpright,prepareCpuTurn,passivePosture,beginTurn,useAutoAim,cpuAimed,autoDefend,fire,tickPresentation,tickAttack,queuePresentation,performAttack,nextQuip,validate,reward,settleWallets,ensureWallets,purchase,chooseWeapon,useBattery,cpuShopping,shotReward,syncLoadout,eliminate,syncUtilities,accountSupply,useDefense,useParachute,dig,input,
 configure(a,s,q,c){arena=a;market=s;quipCatalog=q;chaosCatalog=c},load(m){match=m;ensureWallets();booted=true},get match(){return match},get bank(){return bank}}\n}`)
 const context={talus};vm.createContext(context);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2024}}).outputText,context)
 const api=context.api;api.configure(arena,shop,read('world/Game/quips.json'),read('world/Game/chaos.json'))
 const m=api.validate({humans:0,computers,turnSeconds:5,namesText});api.load(m);m.phase='turn'
 for(const p of m.roster){p.entityId='tank-'+p.index;const bb=new Map(),ammo={};actors.set(p.entityId,{
  id:p.entityId,_liveId:p.index+1,get liveId(){return this.isLive||this.isFrozen?this._liveId:null},set liveId(value){this._liveId=value},residency:'live',get isLive(){return this.residency==='live'},set isLive(value){this.residency=value?'live':'stored'},get isFrozen(){return this.residency==='frozen'},
  get exists(){return !['destroyed','unresolved'].includes(this.residency)},set exists(value){if(!value)this.residency='destroyed';else if(!this.exists)this.residency='live'},
  can(verb){if(!this.exists)return false;if(['setVelocity','applyImpulse','applyForce','controller','defenses'].includes(verb))return this.isLive;if(['fireHook','runGraph','weapon'].includes(verb))return this.isLive||this.isFrozen;if(['read','teleport','damage','heal','kill','despawn','setTemplate','blackboard.set','keepLiveOffscreen'].includes(verb))return true;throw Error('Unknown native verb '+verb)},
  alive:true,controller:{state:null,holdPose(seconds){return {accepted:true,reason:'ok',seconds}}},defenses:{state:{}},_position:{x:p.spawnX,y:650},get position(){return this.exists?this._position:null},set position(value){this._position=value},x:p.spawnX,health:100,maxHealth:100,
  blackboard:{get:k=>bb.get(k),set:(k,v)=>bb.set(k,v)},
  weapon:{setAmmo:(k,v)=>ammo[k]=v,equip:id=>true,aim:()=>true,state:{ammo}},
  snapshot(){return this.exists?{id:this.id,liveId:this.isLive||this.isFrozen?this.liveId??null:null,residency:this.residency,x:this.position.x,y:this.position.y,vx:0,vy:0,angle:0,health:this.health,alive:this.alive}:null},
  heal(amount){this.health=Math.min(this.maxHealth,this.health+amount);return this.health}})}
 return {api,m,actors,installed,ui,talus,shop,barriers,emit:(k,e)=>{for(const f of handlers[k]||[])f(e)}}
}
{
 const f=fixture(),p=f.m.roster[0],tank=f.actors.get(p.entityId)
 f.emit('damage',{source:tank,target:tank,targetStableId:tank.id,amount:10,blocked:false})
 assert.equal(p.cashEarned,60,'Self damage pays hit, damage and hurt rewards')
 f.emit('damage',{source:tank,target:tank,amount:0,blocked:true});assert.equal(p.cashEarned,60)
 f.emit('damage',{source:tank,target:{id:'outside-roster'},amount:5,blocked:false})
 assert.equal(p.cashEarned,95,'Damage to any entity pays the attacker')
 f.api.eliminate(p,'self-hit',tank.id,{x:5800,y:650});f.api.eliminate(p,'duplicate',tank.id)
 assert.equal(p.cashBreakdown.death,100);assert.equal(p.cashBreakdown.kill,100)
 for(let n=0;n<100;n++){
  const e={projectileId:n,owner:tank};f.api.shotReward(e,'launch');f.api.shotReward(e,'launch')
  f.api.shotReward(e,'landing');f.api.shotReward(e,'landing');f.api.shotReward(e,'end');f.api.shotReward(e,'end')
 }
 assert.equal(p.cashBreakdown.shoot,2000);assert.equal(p.cashBreakdown.landing,1500)
 assert.equal(Object.keys(f.m.cashShots).length,0,'Completed-shot receipt memory is bounded by live shots')
 f.api.settleWallets();const total=f.api.bank.players.alpha.cash
 f.api.settleWallets();assert.equal(f.api.bank.players.alpha.cash,total,'Result cannot pay twice')
 const stale=JSON.parse(JSON.stringify(f.m));stale.roster[0].cashEarned+=99999;f.api.load(stale);f.api.settleWallets()
 assert.equal(f.api.bank.players.alpha.cash,total,'Old save cannot duplicate a banked round')
}
{
 const f=fixture(),p=f.m.roster[0],w=f.api.bank.players.alpha;f.m.phase='ready'
 assert.equal(w.cash,600);assert.equal(f.api.purchase(p,'magnet'),false,'Unavailable items cannot take money')
 assert.equal(f.api.purchase(p,'missing'),false);assert.equal(f.api.purchase(p,'standard'),false)
 assert.equal(f.api.purchase(p,'heavy',w.revision),true);assert.equal(w.cash,360);assert.equal(w.stock.heavy,3)
 assert.equal(f.api.purchase(p,'heavy',0),false,'Stale double-click cannot purchase twice')
 assert.equal(f.api.purchase(p,'heavy',w.revision),true);assert.equal(w.cash,120);assert.equal(w.stock.heavy,6)
 assert.equal(f.api.purchase(p,'heavy'),false);assert.equal(w.cash,120,'Insufficient funds leave wallet untouched')
 assert.equal(f.api.chooseWeapon(p,'heavy'),true);assert.equal(p.weaponId,'heavy')
 assert.equal(f.api.chooseWeapon(p,'ricochet'),false,'Cannot select empty paid gun')
 assert.equal(f.api.purchase(p,'battery'),true);assert.equal(w.stock.battery,2)
 f.m.phase='turn';const tank=f.actors.get(p.entityId)
 assert.equal(f.api.useBattery(p),false);assert.equal(w.stock.battery,2,'Full-health use does not consume a battery')
 tank.health=45;assert.equal(f.api.useBattery(p),true);assert.equal(tank.health,75);assert.equal(w.stock.battery,1)
 assert.equal(f.m.phase,'turn');assert.equal(p.cashBreakdown.utility,15)
 f.api.useBattery(p);assert.equal(tank.health,100);assert.equal(w.stock.battery,0)
 assert.equal(f.api.useBattery(p),false)
 assert.equal(f.api.bank.players.bravo.cash,600,'Accounts are isolated by player name')
}
{
 const f=fixture();f.m.phase='finished';f.api.cpuShopping()
 const spent=f.api.bank.players.alpha.spent;f.api.cpuShopping()
 assert.equal(f.api.bank.players.alpha.spent,spent,'CPU basket is bought once per visit stage, including reload')
 f.api.load(f.m);f.api.cpuShopping();assert.equal(f.api.bank.players.alpha.spent,spent)
 const before=f.api.bank.players.alpha.cash;f.api.ensureWallets();assert.equal(f.api.bank.players.alpha.cash,before,'Starting grant only applies once')
}
{
 const f=fixture('__proto__\nconstructor');f.m.phase='ready';f.api.cpuShopping()
 for(const p of f.m.roster){const w=f.api.bank.players[p.name];assert.ok(Object.hasOwn(f.api.bank.players,p.name));assert.ok(w.cash<600)}
 f.m.phase='turn';f.api.reward(f.m.roster[0],'shoot');f.api.settleWallets()
 assert.equal(f.api.bank.rounds['economic-world'].paid.__proto__,20)
}
module.exports={fixture}
console.log('PASS: self/any-target damage, death/kill, 100 posthumous launches/landings, duplicate-event isolation, idempotent payouts/old saves, transaction validation, stock/equip, real repair consumption, CPU shopping persistence, independent named wallets including object-property names')
