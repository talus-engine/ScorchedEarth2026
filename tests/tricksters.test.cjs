const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('world/Scripts/lib/tricksters.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const catalog=require('../world/Game/tricksters.json');
function fixture(){
    const handlers={},actors=new Map(),barriers=new Map(),installed={},blasts=[],smoke=[],regions=[],released=[],failures=[];
    let spawnCounter=0,spawnPromise=null,persistFailure=false;
    const makeActor=(id,x,y)=>({id,isLive:true,exists:true,alive:true,position:{x,y},velocity:{x:0,y:0},blackboard:{values:{},set(k,v){this.values[k]=v;}},snapshot(){return{id,x:this.position.x,y:this.position.y,vx:this.velocity.x,vy:this.velocity.y,alive:this.alive,residency:this.isLive?'live':'stored'};},setVelocity(x,y){this.velocity={x,y};},despawn(){this.exists=false;this.alive=false;actors.delete(id);}});
    const alpha={name:'Alpha',entityId:'original-shooter',eliminated:false,cashEarned:80},bravo={name:'Bravo',entityId:'target',eliminated:false,cashEarned:90};
    actors.set(alpha.entityId,makeActor(alpha.entityId,50,500));actors.set(bravo.entityId,makeActor(bravo.entityId,1000,500));
    const ctx={state:{arena:{bounds:{x:0,y:0,w:2000,h:1280}},match:{phase:'turn',bounds:{x:0,y:0,w:2000,h:1280},roster:[alpha,bravo]},bank:{players:{alpha:{name:'Alpha',cash:500,earned:200,revision:1},bravo:{name:'Bravo',cash:900,earned:300,revision:2}},rounds:{},cpuShops:{}},cashPopups:new Map()},economy:{playerKey:p=>p.name.toLowerCase()},core:{entity:p=>actors.get(p.entityId)},session:{persist(){},fail:e=>failures.push(e)},residency:{emissionRegionReady:(key,spec,particles,actorReady)=>{regions.push({key,spec,particles,actorReady});return actorReady;},releaseEmissionRegion:key=>released.push(key),releaseEmissionRegions:prefix=>released.push(prefix)}};
    const talus={world:{id:'match-world',explode:spec=>{blasts.push(spec);return{carvedCells:0};},spawnParticles:spec=>{smoke.push(spec);return spec.count;}},game:{setSaveBarrier:(id,why)=>why===null?barriers.delete(id):barriers.set(id,why)},on:(event,fn)=>(handlers[event]||=[]).push(fn),entities:{get:id=>actors.get(id),spawn:async(template,x,y)=>{assert.equal(template,'sheep-template');if(spawnPromise)return spawnPromise;const actor=makeActor('sheep-'+(++spawnCounter),x,y);actors.set(actor.id,actor);return actor;}},installed:{set(key,value){if(persistFailure)throw Error('durable store refused');installed[key]=structuredClone(value);}}};
    function service(){const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,talus,Math,Number,Object,JSON,Set});const api=module.exports(ctx);api.configure({...structuredClone(catalog),sheep:{...catalog.sheep,template:'sheep-template'}});return api;}
    const api=service();api.bind();
    const sheep={id:'black-sheep',behavior:{mode:'trickster',kind:'black-sheep'}};
    return{api,ctx,talus,alpha,bravo,sheep,actors,blasts,smoke,regions,released,barriers,installed,failures,service,makeActor,
        emit:(event,data)=>handlers[event]?.forEach(fn=>fn(data)),persistFailure:v=>persistFailure=v,spawnPromise:v=>spawnPromise=v};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('native sheep is saved with original source and runs toward nearby shot or blast noise',async()=>{
    const f=fixture();assert.equal(f.api.impact('black-sheep',f.alpha.entityId,{x:400,y:500}),true);assert.equal(f.api.settling(),true);f.api.tick(.1);assert.equal(f.api.busy(),true);assert.equal(f.barriers.size,1);await flush();
    const job=f.ctx.state.match.tricksters.sheep[0],actor=f.actors.get(job.entityId);assert.equal(f.api.busy(),false);assert.equal(f.barriers.size,0);assert.equal(actor.blackboard.values['custom.originalShooter'],f.alpha.entityId);
    f.emit('weapon.fire',{entity:f.actors.get(f.bravo.entityId)});f.api.tick(.1);assert.equal(actor.velocity.x,catalog.sheep.runSpeed);
    f.emit('explosion',{x:100,y:500});f.api.tick(.1);assert.equal(actor.velocity.x,-catalog.sheep.runSpeed);
    const saved=JSON.parse(JSON.stringify(f.ctx.state.match));f.ctx.state.match=saved;const restored=f.service();restored.tick(.1);assert.equal(f.actors.size,3,'Restoration reuses the durable native body');assert.equal(f.ctx.state.match.tricksters.sheep[0].entityId,job.entityId);
    assert.ok(f.regions.some(r=>r.spec.follow===job.entityId));
});
test('sheep uses native contact and one attributed explosion, even after shooter death',async()=>{
    const f=fixture();f.api.impact('black-sheep',f.alpha.entityId,{x:400,y:500});f.api.tick(.1);await flush();const job=f.ctx.state.match.tricksters.sheep[0];job.age=1;f.alpha.eliminated=true;f.actors.delete(f.alpha.entityId);
    f.emit('entity.contact',{stableId:job.entityId,otherEntityId:f.bravo.entityId});f.api.tick(.1);f.api.tick(.1);
    assert.equal(f.blasts.length,1);assert.equal(f.blasts[0].source,f.alpha.entityId);assert.equal(f.blasts[0].damage,catalog.sheep.damage);assert.equal(f.blasts[0].carveRadius,0);assert.equal(f.api.settling(),false);assert.ok(f.released.includes('trickster:'+job.id));assert.equal(f.smoke[0].count,36);
});
test('sheep fuse bounds settlement, out-of-bounds removal is harmless, and capacity is admitted before ammo',async()=>{
    const f=fixture();for(let n=0;n<catalog.sheep.maxActive;n++)f.api.impact('black-sheep',f.alpha.entityId,{x:400+n*80,y:500});assert.equal(f.api.canFire(f.sheep),false);f.api.tick(.1);await flush();
    const first=f.ctx.state.match.tricksters.sheep[0],body=f.actors.get(first.entityId);body.position.x=-10;f.api.tick(.1);assert.equal(f.blasts.length,0);assert.equal(f.api.canFire(f.sheep),true);
    for(let n=0;n<catalog.sheep.fuseSeconds;n++)f.api.tick(1);assert.equal(f.blasts.length,catalog.sheep.maxActive-1);assert.equal(f.api.settling(),false);assert.equal(f.ctx.state.match.tricksters.sheep.length,0);
});
test('stopping an in-flight native spawn cleans its late body without repopulating another round',async()=>{
    const f=fixture();let resolve;f.spawnPromise(new Promise(done=>resolve=done));f.api.impact('black-sheep',f.alpha.entityId,{x:400,y:500});f.api.tick(.1);assert.equal(f.api.busy(),true);f.api.finish();const body=f.makeActor('late-sheep',400,500);f.actors.set(body.id,body);resolve(body);await flush();assert.equal(body.exists,false);assert.equal(f.api.busy(),false);assert.equal(f.barriers.size,0);assert.equal(f.api.settling(),false);
});
