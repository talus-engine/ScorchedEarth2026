// Determinism, bounded native requests, resume and refusal; real rendering is
// separately accepted in Talus. No native material kernel is mocked as proof.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),ts=require(require.resolve('typescript',{paths:[path.resolve(root,'../foxtrot')]}))
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))
const source=fs.readFileSync(path.join(root,'world/Scripts/match.ts'),'utf8'),recipes=read('world/Game/generation.json'),arena=read('world/Game/arena.json'),catalog=read('world/Game/Presets/catalog.json')
const models=read('world/Game/Presets/neural.json').models
const growth=read('world/Game/Presets/living.json').presets
const storyFile='Game/landscape-stories.json',stories=read('world/'+storyFile)
const metadata={noise:read('world/Game/Presets/noise.json').presets,semantic:read('world/Game/Presets/semantic.json').recipes,growth,vector:read('world/Game/Presets/vectors.json').shapes,neural:models}
const paths={'Game/Presets/noise.json':{presets:metadata.noise},'Game/Presets/semantic.json':{recipes:metadata.semantic},'Game/Presets/living.json':{presets:growth},'Game/Presets/vectors.json':{shapes:metadata.vector},'Game/Presets/neural.json':{models},[storyFile]:stories}
function scene(seed=20261025,refuse=-1,withStory=false){
 const calls=[],values={},barriers=new Map(),fileReads=[]
 const talus={editor:{available:false},elements:{get:name=>({id:{DIRT:10,SAND:11,STONE:9}[name]}),list:()=>[0,9,10,11,42].map(id=>({id}))},
  world:{generation:{status:()=>({recipeId:'brush'})},seed,id:'diagnostic',findSurface:async()=>640,
   resources:{catalogs:async()=>[structuredClone(catalog)],read:async(c,k,id)=>structuredClone((k==='neural'?models:growth).find(m=>m.id===id)),validate:async()=>catalog.manifest.entries.map(e=>({...e,ok:true,runtime:{supported:true}}))},
   terrainWork:async s=>{calls.push(structuredClone(s));return calls.length===refuse?{status:'refused',reason:'capacity'}:{id:calls.length,status:'completed',accepted:1,bodies:s.kind==='vector'?['body-'+calls.length]:undefined,
    ...(s.vector?.output.kind==='body'?{placement:{preview:false,selected:{index:0,offset:s.placement.offsets[0]},evaluated:1,cells:1,attempts:[]}}:{})}}},
  files:{readText:async name=>{fileReads.push(name);return paths[name]?JSON.stringify(paths[name]):null}},
  on(){},after(){},log(){},sim:{clock:0},game:{setSaveBarrier:(id,why)=>barriers.set(id,why)},ui:{set(){}},
  state:{getJson:k=>values[k],setJson:(k,v)=>values[k]=structuredClone(v)}}
 const code=source.replace(/}\s*$/,`globalThis.api={prepareProcedural,generateBrushArena,generateCatalogDetails,generateCatalogLife,generationChoices,configure(a,r){arena=a;generationRecipes=r;configureGeneration('brush');match=validate({humans:0,computers:2,turnSeconds:30,generation:'brush'})},get m(){return match},restore(m){match=m},get arena(){return arena}}\n}`)
 const c={talus,structuredClone};vm.createContext(c);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2024}}).outputText,c)
 const config=structuredClone(recipes);if(withStory)config.catalog.storyFile=storyFile;else delete config.catalog.storyFile
 c.api.configure(structuredClone(arena),config);return {api:c.api,calls,values,barriers,talus,fileReads}
}
async function main(){
 const a=scene();await a.api.prepareProcedural();const original=structuredClone(a.api.m);await a.api.generateBrushArena()
 const p=a.api.m.procedural
 assert.equal(p.hash,catalog.hash);assert.equal(p.sites.length,50)
 assert.deepEqual(JSON.parse(JSON.stringify(p.completed)),{noise:50,semantic:50,neural:17,structures:25,growth:50,clearance:7})
 assert.equal(new Set(p.choices.growth.slice(0,18)).size,18);assert.equal(new Set(p.choices.neural.slice(0,4)).size,4)
 for(const kind of ['noise','semantic','growth','neural','vector']){
  const ids=catalog.manifest.entries.filter(e=>e.kind===kind).map(e=>e.id)
  const bag=a.api.generationChoices(ids,ids.length*2,kind)
  assert.deepEqual([...bag.slice(0,ids.length)].sort(),ids.sort(),'Every captured '+kind+' remains selectable')
  assert.deepEqual([...bag.slice(ids.length)].sort(),ids.sort());assert.notEqual(bag[ids.length-1],bag[ids.length])
 }
 assert.ok(a.calls.slice(0,25).every(s=>s.shape.y===1024&&s.recipe.id===recipes.foundation.id))
 const native=a.calls.slice(75),noises=native.filter(s=>s.preset?.kind==='noise'),neural=native.filter(s=>s.neural),life=native.filter(s=>s.kind==='growth'),bodies=native.filter(s=>s.kind==='vector'),clear=native.filter(s=>s.mixture)
 assert.equal(noises.length,50);assert.equal(neural.length,17);assert.equal(life.length,50);assert.equal(bodies.length,25);assert.equal(clear.length,7)
 for(const s of native){assert.equal(s.catalog,catalog.id);assert.ok(s.shape.w<=512&&s.shape.h<=512);assert.equal(s.bounds.h,1024);assert.equal(s.exclusions,undefined);assert.ok(s.budget.cells>=s.shape.w*s.shape.h)}
 for(const s of noises){assert.ok(s.stroke.spinDeg!==0);assert.ok(s.stroke.sizeLfo.amplitudePx>0);assert.equal(s.layerPolicy,'authored')}
 assert.ok(new Set(noises.map(s=>s.stroke.spinDeg)).size>10)
 for(const s of neural){assert.equal(s.stroke,undefined);assert.ok(s.shape.w<=128&&s.shape.h<=128);assert.equal(s.layerPolicy,'authored');assert.ok(s.budget.pixels>0);assert.ok(models.find(m=>m.id===s.neural.modelId).architecture.anchors.some(a=>a.id===s.preset.id),'The neural pass uses a captured training anchor for its selected model')}
 for(const s of life){assert.equal(s.layerPolicy,'authored');assert.ok(s.growth.radius>=1&&s.growth.radius<=64);assert.equal(s.growth.jobs,64);const g=growth.find(g=>g.id===s.growth.presetId);if(g.stroke.sizeMode==='scale')assert.ok(g.sheet.lengthMax*s.growth.radius/g.stroke.sizeReference<=128+1e-8,'Native nominal tube length stays within the requested maximum');else assert.ok(s.growth.radius>=32);const rate=g.stroke.sizeMode==='scatter'?Math.max(g.sheet.tubesPerStep,1/g.stroke.sizeReference)*s.growth.radius/g.stroke.sizeReference:g.sheet.tubesPerStep;assert.ok(g.sheet.startTubes+Math.floor(s.growth.path.length*rate+1e-6)<=64,'Authored scatter density respects the native planting budget')}
 assert.ok(bodies.some(s=>s.vector.geometry.kind==='line'));assert.ok(bodies.some(s=>s.vector.fill.element==='WOOD'));assert.ok(bodies.some(s=>s.vector.fill.element==='CONCRETE'))
 for(const s of bodies){assert.equal(s.vector.output.kind,'body');assert.equal(s.layerPolicy,'active-only');assert.equal(s.replacement,'empty')}
 for(let i=0;i<clear.length;i++){const s=clear[i];assert.equal(s.targetLayer,'world');assert.equal(s.layerPolicy,'active-only');assert.equal(s.replacement,'matching');assert.equal(s.stroke.shape.id,'builtin:flower');assert.equal(s.shape.y+s.shape.h,a.api.m.clearancePath[i].y-32);assert.equal(s.mixture.weights[0].w,.88)}
 const repeat=scene();await repeat.api.prepareProcedural();await repeat.api.generateBrushArena();assert.deepEqual(repeat.calls,a.calls)
 const other=scene(987);await other.api.prepareProcedural();assert.notDeepEqual(other.api.m.procedural.choices,p.choices)
 const resumed=scene();resumed.api.restore(structuredClone(a.api.m));await resumed.api.prepareProcedural();await resumed.api.generateBrushArena();assert.equal(resumed.calls.length,0,'Completed work is never repainted')
 const refused=scene(20261025,76);await refused.api.prepareProcedural();await assert.rejects(()=>refused.api.generateBrushArena(),/noise 0: capacity/);assert.equal(refused.api.m.procedural.completed.noise,undefined);assert.equal(refused.api.m.generated,75);assert.ok(refused.barriers.get('match-sequence'))
 const resumeRefusal=scene();resumeRefusal.api.restore(structuredClone(refused.api.m));await resumeRefusal.api.prepareProcedural();await resumeRefusal.api.generateBrushArena();assert.deepEqual(resumeRefusal.calls,a.calls.slice(75))
 const missing=scene();missing.talus.world.resources.catalogs=async()=>[];await assert.rejects(()=>missing.api.prepareProcedural(),/pinned resources/);assert.equal(missing.calls.length,0)
 assert.equal(original.chaos.rng,a.api.m.chaos.rng,'Terrain does not consume combat randomness')
 assert.equal(a.fileReads.length,0,'No-story generation does not read story files or metadata')
 const themed=scene(20261025,-1,true);await themed.api.prepareProcedural()
 const themedPlan=themed.api.m.procedural,story=themedPlan.story,theme=stories.themes.find(t=>t.id===story.id)
 assert.ok(theme);assert.equal(story.name,theme.name);assert.equal(story.version,stories.version);assert.equal(story.sourceFile,storyFile)
 assert.equal(story.motifs.length,5);assert.equal(story.motifs.filter(m=>m.central).length,1);assert.equal(story.motifs[0].central,true)
 assert.equal(new Set(story.motifs.slice(0,theme.motifs.length).map(m=>m.id)).size,theme.motifs.length)
 for(let i=0;i<story.motifs.length;i++){
  const motif=story.motifs[i],authored=theme.motifs.find(m=>m.id===motif.id)
  assert.ok(authored);assert.equal(motif.kind,authored.kind);assert.deepEqual(JSON.parse(JSON.stringify(motif.parameters)),authored.parameters);assert.equal(motif.siteIndex,i)
  if(i)assert.notEqual(motif.id,story.motifs[i-1].id,'No immediate motif repetition at bag boundaries')
 }
 assert.ok(JSON.stringify(story).length<12000,'Retain one compact story and selected motif settings, not the full document')
 assert.equal(story.themes,undefined);assert.equal(story.catalog,undefined);assert.equal(themedPlan.metadata,undefined)
 assert.deepEqual([...new Set(themed.fileReads)].sort(),Object.keys(paths).sort(),'Read immutable project metadata for every family once')
 let weightedDifference=false
 for(const kind of ['noise','semantic','growth','neural','vector']){
  const ids=catalog.manifest.entries.filter(e=>e.kind===kind).map(e=>e.id)
  const words=[...new Set((theme.affinities[kind]||[]).map(w=>w.trim().toLowerCase()).filter(Boolean))]
  const weights=Object.fromEntries(ids.map(id=>{
   const resource=metadata[kind].find(r=>r.id===id),text=[resource.id,resource.name,resource.description,resource.group,...(resource.tags||[])].join(' ').toLowerCase()
   return [id,stories.selection.baseWeight+stories.selection.affinityBonus*words.filter(w=>text.includes(w)).length]
  }))
  assert.ok(Object.values(weights).every(w=>w>0),'Every pinned resource retains positive probability')
  if(kind!=='neural')assert.ok(Object.values(weights).some(w=>w>stories.selection.baseWeight),'Actual '+kind+' resources receive story affinity bonuses')
  const count=themedPlan.choices[kind].length,expected=themed.api.generationChoices(ids,count,kind,words.length?weights:undefined)
  assert.deepEqual(themedPlan.choices[kind],expected,'Runtime '+kind+' choices apply the authored affinity policy')
  if(JSON.stringify(expected)!==JSON.stringify(themed.api.generationChoices(ids,count,kind)))weightedDifference=true
  const bag=themed.api.generationChoices(ids,ids.length*2,kind,weights)
  assert.deepEqual([...bag.slice(0,ids.length)].sort(),ids.sort());assert.deepEqual([...bag.slice(ids.length)].sort(),ids.sort())
  assert.notEqual(bag[ids.length-1],bag[ids.length])
 }
 assert.ok(weightedDifference,'The theme changes actual selection order, not only stored labels')
 assert.equal(themed.api.generationChoices(['ordinary','preferred'],2,'large-affinity',{ordinary:1,preferred:1000000})[0],'preferred')
 assert.throws(()=>themed.api.generationChoices(['missing'],1,'invalid-weight',{missing:0}),/positive/)
 for(let n=0;n<themedPlan.choices.neural.length;n++)assert.ok(models.find(m=>m.id===themedPlan.choices.neural[n]).architecture.anchors.some(a=>a.id===themedPlan.choices.neuralRecipe[n]),'Themed neural contexts remain trained anchors')
 assert.equal(themed.api.m.chaos.rng,original.chaos.rng,'Story selection does not consume combat randomness')
 const themedAgain=scene(20261025,-1,true);await themedAgain.api.prepareProcedural();assert.deepEqual(structuredClone(themedAgain.api.m.procedural),structuredClone(themedPlan))
 const storyIds=new Set()
 for(let seed=1;seed<=40;seed++){const sampled=scene(seed,-1,true);await sampled.api.prepareProcedural();storyIds.add(sampled.api.m.procedural.story.id)}
 assert.equal(storyIds.size,10,'Independent seeded story selection can reach all ten authored stories')
 const themedResume=scene(20261025,-1,true);themedResume.api.restore(structuredClone(themed.api.m));themedResume.talus.files.readText=async()=>{throw Error('Old saves must not re-read story metadata')};await themedResume.api.prepareProcedural();assert.deepEqual(structuredClone(themedResume.api.m.procedural),structuredClone(themedPlan))
 const legacyResume=scene(20261025,-1,true);legacyResume.api.restore(structuredClone(a.api.m));await legacyResume.api.prepareProcedural();assert.equal(legacyResume.api.m.procedural.story,undefined);assert.equal(legacyResume.fileReads.length,0,'Enabling stories in a template does not retrofit an existing plan')
 const badMetadata=scene(20261025,-1,true);const readText=badMetadata.talus.files.readText;badMetadata.talus.files.readText=async name=>name==='Game/Presets/noise.json'?JSON.stringify({presets:[]}):readText(name)
 await assert.rejects(()=>badMetadata.api.prepareProcedural(),/Story metadata lacks pinned resource/);assert.equal(badMetadata.api.m.procedural,undefined);assert.equal(badMetadata.calls.length,0)
 console.log('PASS: complete seeded catalog bags, authentic layers, dynamic noise masks, independent NCA, textured physical props, full living selection, bounded foreground flower clearance, pinned-resource refusal and exact progress replay')
 console.log('PASS: optional deterministic stories, real affinity weights with complete positive bags, compatible neural anchors, compact selected motifs, immutable resume and no-story metadata isolation')
}
module.exports={scene}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
