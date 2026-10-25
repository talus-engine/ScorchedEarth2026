const e=talus.entities.get(talus.state.get('m8.native.actor'));
const damage=[],events=[],projectiles=[];
talus.on('damage',v=>damage.push(JSON.parse(JSON.stringify(v))));
talus.on('defense',v=>events.push(JSON.parse(JSON.stringify(v))));
for(const name of ['launch','bounce','hit','detonate','end'])talus.on('projectile.'+name,v=>projectiles.push({event:name,...JSON.parse(JSON.stringify(v))}));
const configured=e.defenses.configure('shield',{capacity:60,types:['blast','true']});
const charged=e.defenses.charge('shield',100),activation=e.defenses.activate('shield',true);
const hp0=e.health,hp1=e.damage(40,{source:e,type:'true'});await talus.sleepTicks(30);
const shield1=e.defenses.state,hp2=e.damage(40,{source:e,type:'true'});await talus.sleepTicks(30);
const shield2=e.defenses.state;
const base={kind:'rigid-body',element:'IRON',owner:e,x:6360,y:350,vx:600,vy:0,bodySizePx:4,gravityScale:0,drag:0,independent:true,lifetime:3,bouncing:2,damage:0,aoeRadius:0,carveRadius:0,detonate:{fuse:2,onBody:false,onTerrain:false,atLifetime:true}};
let floor=talus.world.fill({x:6450,y:400,w:128,h:16},'STONE');
const target=await talus.entities.spawn(e.snapshot().templateId,6500,350);if(!target||!await target.whenLive({timeoutTicks:600}))throw new Error('Target unavailable');await talus.sleepTicks(60);
async function fly(){const p=talus.projectiles.launch(base);if(!p)throw new Error('Launch refused');const rows=[];for(let n=0;n<190&&p.exists;n++){if(n%3===0)rows.push({tick:n,...p.snapshot()});await talus.sleepTicks(1)}return {id:p.id,rows,exists:p.exists}}
const ordinary=await fly();
target.defenses.configure('deflector',{capacity:2,radius:180,acceleration:3000,drainPerSecond:4,kinds:['rigid-body'],owners:'others',elements:[talus.elements.get('IRON').id]});
target.defenses.charge('deflector',2);target.defenses.activate('deflector',true);
const fields=talus.world.defenseFields();const bent=await fly();
return {configured,charged,activation,hp0,hp1,hp2,shield1,shield2,damage,events,projectiles,ordinary,bent,fields,final:target.defenses.state,floor,owner:e.id,target:target.id};
