// Selection/event policy tests. Public-HTTP replays separately verify rendering.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', {paths: [path.resolve(root, '../foxtrot')]}))
const source = fs.readFileSync(path.join(root, 'world/Scripts/match.ts'), 'utf8')
const quips = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/quips.json'), 'utf8'))
function fixture(seed=7, saved, worldId='quip-world-a') {
  const handlers={}, state=saved?.state ? structuredClone(saved.state) : {}, installed=saved?.installed ? structuredClone(saved.installed) : {}, ui={}, actors=new Map()
  const talus={editor:{available:false},on:(k,f)=>(handlers[k]??=[]).push(f),after(){},log(){},
    world:{seed,id:worldId},sim:{clock:0},camera:{view:{viewport:{x:0,y:0,w:1600,h:968}}},
    state:{getJson:k=>state[k]&&structuredClone(state[k]),setJson:(k,v)=>state[k]=structuredClone(v)},
    installed:{get:k=>installed[k]&&structuredClone(installed[k]),set:(k,v)=>installed[k]=structuredClone(v)},
    ui:{set:(k,v)=>typeof k==='string'?ui[k]=structuredClone(v):Object.assign(ui,k),floatText(){}},
    entities:{get:id=>actors.get(id)},players:{list:()=>[]}}
  const code=source.replace(/}\s*$/,`globalThis.api={nextQuip,say,chaosRandom,
    setup(q){quipCatalog=q;booted=true;arena={biome:{name:'Test'}};chaosCatalog={effects:[{id:'test',name:'Test',enabled:true}]};
    market={awards:{},items:[{id:'standard',name:'Cannon',enabled:true,kind:'weapon'}]};bank={players:{test:{cash:0,stock:{}}}};
    match={seed:${seed},phase:'firing',turnNumber:1,focusIndex:0,remaining:30,cashShots:{},chaos:{rng:123,serial:0,jobs:[],quiet:0},
    roster:[{index:0,entityId:'tank',name:'Test',color:'#fff',kills:0,control:'cpu',weaponId:'standard',cashEarned:0,cashBreakdown:{}}]};},
    get match(){return match},setSecondary(v){launchingChaos=v}}\n}`)
  const context={talus};vm.createContext(context);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2024}}).outputText,context)
  const api=context.api;api.setup(quips)
  const bb=new Map(), tank={id:'tank',position:{x:800,y:480},health:100,blackboard:{get:k=>bb.get(k),set:(k,v)=>bb.set(k,v)}}
  actors.set('tank',tank)
  const emit=(k,e)=>{for(const fn of handlers[k]||[])fn(e)}
  return {api,state,installed,ui,actors,tank,bb,emit,talus}
}
assert.equal(quips.shooting.length,500);assert.equal(quips.death.length,500)
const all=[...quips.shooting,...quips.death]
assert.equal(new Set(all.map(q=>q.id)).size,1000)
assert.equal(new Set(all.map(q=>q.text.toLowerCase().replace(/[^a-z0-9]/g,''))).size,1000)
assert.equal(all.filter(q=>q.text===q.text.toUpperCase()).length,25)
for(const kind of ['shooting','death']) {
  const f=fixture(), lines=Array.from({length:500},()=>f.api.nextQuip(kind).id)
  assert.equal(new Set(lines).size,500,'A whole deck is used without repeats')
  assert.notEqual(f.api.nextQuip(kind).id,lines.at(-1),'No immediate repeat across deck boundaries')
  const saved=structuredClone({state:f.state,installed:f.installed}), expected=f.api.nextQuip(kind).id
  assert.equal(fixture(7,saved).api.nextQuip(kind).id,expected,'Reload continues the same deck')
}
{
  const a=fixture(),b=fixture(7,undefined,'quip-world-b'),c=fixture(9)
  const draw=f=>Array.from({length:20},()=>f.api.nextQuip('shooting').id)
  const aLines=draw(a);assert.notDeepEqual(aLines,draw(b),'A fresh installation gets a world-unique initial shuffle')
  assert.deepEqual(aLines,draw(c),'Terrain seed does not control dialogue')
  const saved={installed:structuredClone(a.installed)}, expected=draw(a)
  const nextGame=fixture(7,saved,'quip-world-c')
  assert.deepEqual(draw(nextGame),expected,'Same-seed new round continues the installed deck')
  assert.equal(new Set([...aLines,...expected]).size,40,'New rounds do not replay the opening phrases')
  for(let n=0;n<80;n++)a.api.nextQuip(n%2?'death':'shooting')
  assert.equal(a.api.chaosRandom(),b.api.chaosRandom(),'Speech cannot change combat RNG')
}
console.log('PASS: 1,000 unique lines, mixed case, full-deck nonrepetition, installed deck across same-seed rounds/reloads, terrain/combat RNG independence; native label sequencing is covered by check_m9.cjs')
