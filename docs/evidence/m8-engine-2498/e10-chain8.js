talus.sim.resume();talus.ui.closeMenu();talus.camera.centerOn(6400,400);await talus.sleepTicks(60);
const owner=talus.entities.get(talus.state.get('m8.native.actor')),tpl=owner.snapshot().templateId;
const a=await talus.entities.spawn(tpl,6590,350),b=await talus.entities.spawn(tpl,6660,350);if(!a||!b||!await a.whenLive({timeoutTicks:600})||!await b.whenLive({timeoutTicks:600}))throw new Error('chain fixture spawn');await talus.sleepTicks(120);
a.damage(85,{type:'true',source:owner});await talus.sleepTicks(90);
const events=[],damage=[],shots=[];for(const name of ['launch','hit','detonate','end'])talus.on('projectile.'+name,e=>events.push({event:name,...JSON.parse(JSON.stringify(e))}));talus.on('damage',e=>{damage.push(JSON.parse(JSON.stringify(e)));if(e.amount>0)talus.state.set('m8.chain8.damage',true)});
const base={kind:'rigid-body',element:'LEAD',vx:300,vy:0,gravityScale:0,independent:true,lifetime:2,carveRadius:0,aoeRadius:32,detonate:{onBody:true,onTerrain:true,atLifetime:true}};
talus.on('death',e=>{if(e.stableId===a.id||e.entity?.id===a.id){const p=talus.projectiles.launch({...base,owner:a,x:b.x-25,y:b.y,damage:40});if(p)shots.push(p.id)}});
talus.state.set('m8.chain8.ready',true);await new Promise(r=>talus.on('m8:chain8-fire',()=>r()));const p=talus.projectiles.launch({...base,owner,x:a.x-25,y:a.y,damage:95});if(!p)throw new Error('primary');shots.push(p.id);
await talus.sleepTicks(180);return {a:a.snapshot(),b:b.snapshot(),events,damage,shots,view:talus.camera.view};
