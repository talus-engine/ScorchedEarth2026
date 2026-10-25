// Policy assertions complement the installed native-material replay.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=process.env.INDIGO_ROOT||path.resolve(__dirname,'..'),stage=process.env.INDIGO_GENERATION_STAGE
const ts=require(require.resolve('typescript',{paths:[path.resolve(root,'../foxtrot')]}))
const source=fs.readFileSync(stage?path.join(stage,'match.ts'):path.join(root,'world/Scripts/match.ts'),'utf8')
const recipes=JSON.parse(fs.readFileSync(stage?path.join(stage,'generation.json'):path.join(root,'world/Game/generation.json'),'utf8'))
const arena=JSON.parse(fs.readFileSync(path.join(root,'world/Game/arena.json'),'utf8'))
function scene(refuseAt=-1,mode='brush'){
 const calls=[],values={},barriers=new Map()
 const talus={editor:{available:false},elements:{get:name=>({id:{DIRT:10,SAND:11,STONE:9}[name]}),list:()=>[0,9,10,11,42].map(id=>({id}))},world:{generation:{status:()=>({recipeId:mode})},seed:1729,findSurface:async()=>640,terrainWork:async s=>{calls.push(structuredClone(s));return calls.length===refuseAt?{status:'refused',reason:'capacity'}:{status:'completed',accepted:1,organisms:s.kind==='growth'?[calls.length]:undefined}}},
  on(){},after(){},log(){},sim:{clock:0},game:{setSaveBarrier:(id,why)=>barriers.set(id,why)},ui:{set(){}},
  state:{getJson:k=>values[k],setJson:(k,v)=>values[k]=structuredClone(v)}}
 const code=source.replace(/}\s*$/,`globalThis.api={generateBrushArena,async hybrid(){await prepareClearance();await generateBrushDetails();await generateLivingArena();await clearCombatSpace()},configure(a,r,mode){arena=a;generationRecipes=r;configureGeneration(mode);match=validate({humans:0,computers:2,turnSeconds:30,generation:mode})},get m(){return match},get arena(){return arena}}\n}`)
 const c={talus,structuredClone};vm.createContext(c);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2024}}).outputText,c)
 c.api.configure(structuredClone(arena),structuredClone(recipes),mode);return {api:c.api,calls,values,barriers}
}
async function main(){
 const a=scene();await a.api.generateBrushArena()
 assert.equal(a.api.m.generated,75);assert.equal(a.api.m.details,50);assert.equal(a.api.m.livingSites,recipes.living.sites)
 assert.ok(a.calls.slice(0,25).every(s=>s.shape.y===1024&&s.shape.h===256&&s.recipe?.id===recipes.foundation.id),'Complete foundation precedes loose fill')
 assert.ok(a.calls.slice(25,75).every(s=>s.shape.y<1024))
 const details=a.calls.filter(s=>s.mixture?.recipes.length===3),plants=a.calls.filter(s=>s.kind==='growth'),clearance=a.calls.filter(s=>s.recipe?.id===recipes.clearance.empty.id||s.mixture?.recipes[0].id===recipes.clearance.empty.id)
 assert.equal(details.length,50,'Every detail site runs, including the combat corridor')
 assert.ok(details.filter(s=>s.neural).length>0)
 assert.ok(details.filter(s=>s.neural).every(s=>s.neural.modelId===recipes.neural.modelId&&s.shape.radius*2<=128))
 for(const s of details){
  assert.equal(s.mixture.recipes.length,3);assert.ok(Math.abs(s.mixture.weights.reduce((n,w)=>n+w.w,0)-1)<1e-9)
  assert.equal(s.replacement,'eligible');assert.equal(s.bounds.h,1024)
  assert.equal(s.exclusions,undefined,'Clear with a subsequent brush, never skip a pass')
 }
 assert.equal(recipes.fill.micro.noise.seed,undefined,'Pure noise inherits the operation/world seed')
 assert.equal(plants.length,recipes.living.sites)
 assert.ok(new Set(plants.map(s=>s.growth.presetId)).size===2)
 for(const s of plants){assert.equal(s.kind,'growth');assert.equal(s.bounds.h,1024);assert.equal(s.exclusions,undefined);assert.ok(s.shape.w<=512&&s.shape.h<=512);assert.ok([32,64].includes(s.growth.radius));assert.equal(s.replacement,'empty')}
 assert.equal(clearance.length,a.api.m.clearancePath.length)
 assert.equal(a.api.m.cleared,clearance.length)
 assert.deepEqual(a.calls.slice(-clearance.length),clearance,'Clearance follows every detail and growth pass')
 assert.equal(recipes.clearance.empty.macro.strata[0].element,'EMPTY')
 assert.ok(new Set(clearance.map(s=>s.shape.radius)).size>1,'Seeded clearing sizes vary')
 for(let i=0;i<clearance.length;i++){
  const s=clearance[i];assert.equal(s.bounds.h,1024);assert.equal(s.replacement,'matching','Never add material to empty sky');assert.deepEqual(s.materials.map(m=>m.element),[9,10,11,42]);assert.ok(s.budget.cells<=262144)
  assert.equal(s.mixture.weights[0].w,.88);assert.equal(s.recipe,undefined,'No perfect EMPTY core pass')
  assert.ok(s.shape.radius>=128&&s.shape.radius<=192)
  assert.equal(s.shape.y+s.shape.radius,a.api.m.clearancePath[i].y-32,'Keep the original ground silhouette below the brush')
 }
 const b=scene();await b.api.generateBrushArena();assert.deepEqual(b.calls,a.calls,'Same seed yields identical native requests')
 const resumed=scene();resumed.api.m.generated=75;resumed.api.m.details=50;resumed.api.m.livingSites=20;resumed.api.m.clearancePath=structuredClone(a.api.m.clearancePath);resumed.api.m.cleared=clearance.length;await resumed.api.generateBrushArena()
 assert.ok(resumed.calls.every(s=>s.kind==='growth'));assert.ok(resumed.calls.every(s=>s.growth.origin.x>=resumed.api.arena.bounds.x+20*256),'Resume never repeats completed sites')
 const refused=scene(75+details.length+1);await assert.rejects(()=>refused.api.generateBrushArena(),/Living brush 0: capacity/);assert.equal(refused.api.m.livingSites,0,'Refusal never records uncommitted work as complete')
 assert.ok(refused.barriers.get('match-sequence'),'Generation keeps the supported save barrier held')
 const clearRefused=scene(75+50+recipes.living.sites+1);await assert.rejects(()=>clearRefused.api.generateBrushArena(),/Clearance brush 0: capacity/);assert.ok(!clearRefused.api.m.cleared)
 const clearResume=scene();Object.assign(clearResume.api.m,{generated:75,details:50,livingSites:recipes.living.sites,clearancePath:structuredClone(a.api.m.clearancePath),cleared:3});await clearResume.api.generateBrushArena();assert.deepEqual(clearResume.calls,clearance.slice(3),'Resume preserves the pre-decoration path and completed clearance jobs')
 const hybrid=scene(-1,'verdant-reach');await hybrid.api.hybrid()
 assert.ok(hybrid.calls.some(s=>s.mixture)&&hybrid.calls.some(s=>s.neural)&&hybrid.calls.some(s=>s.kind==='growth'))
 assert.ok(hybrid.calls.every(s=>s.bounds.x===0&&s.bounds.h===1024),'Hybrid decorates the native zone without overwriting its foundation')
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'world/Game/terrain-recipes.json'),'utf8'))
 for(const recipe of catalog.recipes.filter(r=>r.family==='zone')){
  const center=recipe.zones.find(z=>z.priority===0),terrain=center.terrain
  assert.ok(center.minX<=arena.combat.x-256&&center.maxX>=arena.combat.x+arena.combat.w+256)
  assert.deepEqual(terrain.surface.directions,['s']);assert.ok(terrain.surface.baseline-terrain.surface.amplitude-terrain.surface.blendWidth>=700,'One continuous open-sky band above the central tank area')
  assert.ok(terrain.surface.amplitude<=24&&terrain.frequency<=.0015)
  assert.equal(recipe.foundation.height,256)
 }
 console.log('PASS: foundation ordering, semantic/neural/living hybrid, all detail/growth sites, gentle foreground semantic clearance, connected zone air band, floor protection, deterministic requests, progress resume and refusal safety')
}
main().catch(e=>{console.error(e);process.exitCode=1})
