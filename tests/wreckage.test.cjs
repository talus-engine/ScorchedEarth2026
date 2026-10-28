const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
const chaos = require('../world/Game/chaos.json');
function scene() {
    const f=fixture(),ctx=f.game.context,p=f.m.roster[1],tank=f.actors.get(p.entityId);
    const pending=[],events=[],impulses=[];
    const job={id:1,owner:tank.id,name:p.name,x:500,y:400,projectileIds:[],effect:'test',emissionDone:false};
    f.m.chaos.jobs=[job];ctx.state.deathPoseHolds.set(tank.id,{liveId:tank.liveId,until:30});
    const parts=[[-8,-3,60],[7,3,12],[0,-8,20]].map(([x,y,members],i)=>({id:'rigid@part-'+i,members,center:{x:500+x,y:400+y},
        body:{can:verb=>verb==='applyImpulse',applyImpulse:(x,y)=>{events.push('impulse');impulses.push({id:i,x,y});}}}));
    const release=async spec=>{events.push('release');assert.deepEqual(structuredClone(spec),{maxMembers:16384,maxParts:32,waitSeconds:5});tank.exists=false;return{status:'completed',reason:'ok',released:3,center:{x:500,y:400},parts};};
    tank.releaseParts=release;
    tank.despawn=()=>{throw Error('Never delete the surviving wreck');};
    f.talus.elements.get=()=>({id:42});
    f.talus.world.terrainWork=async spec=>{events.push(spec);return{status:'completed',added:10,reason:'ok'};};
    ctx.session.run=fn=>pending.push(fn());
    return{...f,ctx,job,tank,events,parts,impulses,release,
        async drain(){let n=-1;while(n!==pending.length){n=pending.length;await Promise.all(pending);}}};
}
test('every authored death effect uses the same final part release, impulse and dynamite ignition',async()=>{
    for(const fx of chaos.effects.filter(fx=>fx.enabled)){
        const f=scene();
        f.job.materialConverted=true;f.job.finaleResult={status:'completed',reason:'ok'};
        assert.equal(f.api.finishEmission(f.job,fx),false);
        await f.drain();
        assert.equal(f.job.wreckDone,true,fx.id);assert.equal(f.job.emissionDone,true,fx.id);
        assert.deepEqual(f.job.partsResult.ids,['rigid@part-0','rigid@part-1','rigid@part-2']);
        assert.equal(f.impulses.length,3);assert.equal(f.ctx.state.deathPoseHolds.size,0);
        assert.equal(new Set(f.impulses.map(p=>p.x+':'+p.y)).size,3);
        const charges=f.events.filter(e=>typeof e==='object');
        assert.deepEqual(charges.map(e=>e.recipe.macro.strata[0].element),['DYNAMITE','FIRE']);
        assert.equal(charges[0].replacement,'empty');assert.equal(charges[1].replacement,'matching');
        assert.equal(charges[1].materials[0].element,42);assert.ok(charges[1].shape.radius<charges[0].shape.radius);
        f.api.finishEmission(f.job,fx);await f.drain();assert.equal(f.impulses.length,3,'Repeated completion never kicks or charges twice');
    }
});
test('wreck release waits for every descendant shell and native release receipt',async()=>{
    const f=scene(),fx={};let resolve;
    f.job.projectileIds=[10];
    f.api.finishEmission(f.job,fx);assert.equal(f.events.length,0);assert.equal(f.job.emissionDone,false);
    f.job.projectileIds=[];f.tank.releaseParts=()=>new Promise(done=>resolve=done);
    f.api.finishEmission(f.job,fx);assert.equal(f.job.workPending,true);assert.equal(f.job.emissionDone,false);
    f.api.finishEmission(f.job,fx);assert.equal(f.events.length,0);
    resolve(await f.release({maxMembers:16384,maxParts:32,waitSeconds:5}));await f.drain();
    assert.equal(f.job.emissionDone,true);assert.equal(f.impulses.length,3);
});
test('release refusal or destruction does not soft-lock the match or reconstruct a missing tank',async()=>{
    for(const outcome of ['refused','throw','consumed']){
        const f=scene();f.tank.releaseParts=async()=>{if(outcome==='throw')throw Error('capture busy');return{status:'refused',reason:'not-live',released:0,parts:[]};};
        if(outcome==='consumed')f.tank.exists=false;
        f.api.finishEmission(f.job,{});await f.drain();
        assert.equal(f.job.emissionDone,true);assert.equal(f.m.phase,'turn');assert.equal(f.ctx.state.deathPoseHolds.size,0);
        assert.equal(f.impulses.length,0);
    }
});
test('late native release cannot apply impulses or terrain edits to a replacement match',async()=>{
    const f=scene();let resolve;f.tank.releaseParts=()=>new Promise(done=>resolve=done);
    f.api.finishEmission(f.job,{});f.ctx.state.match={phase:'turn',chaos:{jobs:[]}};
    resolve({status:'completed',reason:'ok',released:3,center:{x:500,y:400},parts:f.parts});await f.drain();
    assert.equal(f.events.length,0);assert.equal(f.impulses.length,0);
});
