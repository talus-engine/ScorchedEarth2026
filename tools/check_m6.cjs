// Game-policy regression tests; the installed-build replay tests actual physics.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { cameraMock } = require('./fixture_m12_camera.cjs')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [path.resolve(root, '../foxtrot')] }))
const source = fs.readFileSync(path.join(root, 'world/Scripts/match.ts'), 'utf8')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/chaos.json'), 'utf8'))
const arena = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/arena.json'), 'utf8'))
function fixture(effect, count=2) {
  const handlers={},states={},installed={},actors=new Map(),shots=new Map();let id=0
  const emit=(kind,e)=>{for(const fn of handlers[kind]||[])fn(e)}
  const talus={editor:{available:false},world:{cancelTerrainWork(){},seed:7,id:'policy-test',generation:{status:()=>({recipeId:'wfc'})},spawnParticles:s=>s.count,explode:()=>({carvedCells:1})},
    game:{setSaveBarrier(){}},camera:cameraMock(id=>actors.get(id),{x:5700,y:300,w:1600,h:968}),
    state:{setJson:(k,v)=>states[k]=structuredClone(v),getJson:k=>states[k],set(){}},log(){},
    on:(k,f)=>(handlers[k]??=[]).push(f),after(){},players:{list:()=>[]},
    sim:{clock:0,anchor:()=>({active:true,chunks:[{x:0,y:0}],loaded:1,particles:'simulated',refused:null,update(){},release(){this.active=false}})},ui:{set(){},floatText(){},banner(){},openMenu(){},nameplate(){},worldText(){}},installed:{get:k=>installed[k],set:(k,v)=>installed[k]=v},
    dialogue:{active:false,start:async()=>true},entities:{get:id=>actors.get(id)},
    projectiles:{launch:s=>{const shot={id:++id,exists:true,snapshot:()=>({x:s.x,y:s.y}),detonate(){shots.delete(shot.id);emit('projectile.end',{projectileId:shot.id,x:s.x,y:s.y})}};shots.set(shot.id,shot);emit('projectile.launch',{projectileId:shot.id,projectile:shot,owner:actors.get(s.owner)});return shot},get:id=>shots.get(id)},
  }
  const code=source.replace(/}\s*$/,`globalThis.policy={tickPresentation,validate,eliminate,tickChaos,finish,chaosRandom,
    configure(a,c,q,s){arena=a;chaosCatalog=c;quipCatalog=q;market=s},load(m){match=m;ensureWallets()},read(){return match}}\n}`)
  const context={talus};vm.createContext(context);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2024}}).outputText,context)
  const api=context.policy;api.configure(arena,{...catalog,effects:catalog.effects.filter(f=>f.id===effect).map(f=>({...f,enabled:true}))},JSON.parse(fs.readFileSync(path.join(root,'world/Game/quips.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'world/Game/shop.json'),'utf8')))
  const m=api.validate({humans:0,computers:count,turnSeconds:5});api.load(m);m.phase='turn'
  for(const p of m.roster){p.entityId='tank-'+p.index;const bb=new Map();actors.set(p.entityId,{id:p.entityId,_liveId:p.index+1,get liveId(){return this.isLive||this.isFrozen?this._liveId:null},set liveId(value){this._liveId=value},residency:'live',
    get exists(){return !['destroyed','unresolved'].includes(this.residency)},set exists(value){if(!value)this.residency='destroyed';else if(!this.exists)this.residency='live'},
    get isLive(){return this.residency==='live'},set isLive(value){this.residency=value?'live':'stored'},get isFrozen(){return this.residency==='frozen'},
    can(verb){if(!this.exists)return false;if(['setVelocity','applyImpulse','applyForce','controller','defenses'].includes(verb))return this.isLive;if(['fireHook','runGraph','weapon'].includes(verb))return this.isLive||this.isFrozen;if(['read','teleport','damage','heal','kill','despawn','setTemplate','blackboard.set','keepLiveOffscreen'].includes(verb))return true;throw Error('Unknown native verb '+verb)},
    controller:{state:null,holdPose:seconds=>({accepted:true,seconds})},defenses:{state:{}},health:100,_position:{x:p.spawnX,y:600},get position(){return this.exists?this._position:null},set position(value){this._position=value},blackboard:{get:k=>bb.get(k),set:(k,v)=>bb.set(k,v)},despawn(){this.exists=false},snapshot(){return this.exists?{alive:this.health>0,health:this.health,x:this.position.x,y:this.position.y,residency:this.residency}:null}})}
  return {api,m,actors,shots,emit,installed,talus}
}
function present(f) { f.api.tickPresentation();f.talus.sim.clock+=3;f.api.tickPresentation();f.talus.sim.clock+=2.5;f.api.tickPresentation() }
{
  const f=fixture('magazine');f.m.phase='firing';f.api.eliminate(f.m.roster[0],'destroyed',f.m.roster[1].entityId)
  assert.equal(f.m.phase,'turn','Death cancels the turn-level wait for a cast')
  f.api.eliminate(f.m.roster[0],'destroyed',f.m.roster[1].entityId)
  assert.equal(f.m.presentation.queue.length,1,'Duplicate death has one presentation');present(f)
  assert.equal(f.m.chaos.jobs.length,1,'Duplicate death cannot enqueue another effect')
  assert.equal(f.m.roster[1].kills,1,'Duplicate death cannot award another kill')
  // Mimic a separate primary cast: same owner must still not steal tracking.
  f.m.phase='firing';f.api.tickChaos(1/60)
  assert.equal(f.m.shotId,null,'Synchronous chaos launch cannot become the primary shot')
  assert.equal(f.m.phase,'firing')
  assert.equal(f.m.chaos.jobs.length,0,'All 100 synchronous end callbacks are accounted for')
  assert.equal(f.shots.size,0)
}
{
  const f=fixture('furnace');f.api.eliminate(f.m.roster[1],'destroyed',f.m.roster[0].entityId)
  present(f);assert.equal(f.api.finish(),true);assert.equal(f.m.phase,'aftermath')
  for(let t=0;t<590;t++)f.api.tickChaos(1/60)
  assert.equal(f.m.chaos.jobs.length,1,'Emitter remains active near the end of ten seconds')
  f.api.eliminate(f.m.roster[0],'destroyed',f.m.roster[1].entityId)
  present(f);assert.equal(f.m.chaos.jobs.length,2,'Chain death can add a concurrent effect')
  for(let t=0;t<610;t++)f.api.tickChaos(1/60)
  assert.equal(f.m.chaos.jobs.length,0)
  f.api.finish();assert.equal(f.m.phase,'aftermath','Quiet interval follows the final effect')
  for(let t=0;t<181;t++)f.api.tickChaos(1/60)
  f.api.finish();assert.equal(f.m.phase,'finished');assert.equal(f.m.winner,null,'Chain reaction can produce a draw')
  f.api.finish();assert.equal(f.installed['indigo.scores'].players['cpu 1'].games,1,'Result scores commit once')
  assert.equal(f.installed['indigo.scores'].players['cpu 2'].kills,1,'Posthumous kill is counted')
}
{
  const a=fixture('furnace'),b=fixture('furnace')
  assert.deepEqual(Array.from({length:30},()=>a.api.chaosRandom()),Array.from({length:30},()=>b.api.chaosRandom()),'Effect RNG is repeatable for the same seed')
  const saved=JSON.parse(JSON.stringify(a.m));const expected=a.api.chaosRandom();a.api.load(saved)
  assert.equal(a.api.chaosRandom(),expected,'Saved RNG resumes without rerolling')
}
console.log('PASS: duplicate deaths, interrupted casts, secondary-shot isolation, synchronous 100-shot completion, overlapping hazards, bounded aftermath, draw, posthumous credit, score idempotence, deterministic RNG')
