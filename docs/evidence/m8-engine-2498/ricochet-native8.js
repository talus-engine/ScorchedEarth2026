talus.sim.resume();talus.ui.closeMenu();talus.camera.centerOn(6400,400);
const owner=talus.entities.get(talus.state.get('m8.native.actor'));
const events=[],damage=[],explosions=[];
for(const name of ['launch','collision','bounce','directHit','hit','detonate','end'])talus.on('projectile.'+name,e=>events.push({event:name,clock:talus.sim.clock,...JSON.parse(JSON.stringify(e))}));
talus.on('damage',e=>damage.push(JSON.parse(JSON.stringify(e))));talus.on('explosion',e=>explosions.push(JSON.parse(JSON.stringify(e))));
const floor=await talus.world.terrainWork({kind:'recipe',recipe:{id:'m8-probe-floor',name:'Probe floor',description:'native test',tags:[],macro:{mode:'volumetric',support:'none',strata:[{element:'STONE',thickness:[1,1]}]},micro:{noise:{algorithm:'simplex',frequency:.1,octaves:3,persistence:.5,lacunarity:2}}},seed:1729,shape:{x:6464,y:400,w:448,h:16},bounds:{x:6464,y:400,w:448,h:16},replacement:'empty',element:talus.elements.get('STONE').id,budget:{cells:7168,particles:7168,work:7168}});
if(floor.status!=='completed')throw new Error(JSON.stringify(floor));
const base={kind:'rigid-body',element:'LEAD',owner,x:6500,y:340,vx:10,vy:0,bodySizePx:4,gravityScale:1,drag:0,independent:true,lifetime:8,bouncing:5,damage:95,aoeRadius:115,carveRadius:52,detonate:{fuse:4,onBody:true,onTerrain:false,onRest:false,atLifetime:true}};
async function fly(spec){const before=talus.sim.clock,p=talus.projectiles.launch(spec);if(!p)throw new Error('Launch refused');const samples=[];for(let i=0;i<600&&!events.some(e=>e.event==='end'&&e.projectileId===p.id);i++){if(p.exists)samples.push({clock:talus.sim.clock,...p.snapshot()});await talus.sleepTicks(1)}return {id:p.id,before,after:talus.sim.clock,exists:p.exists,samples}}
const fuse=await fly(base);
const target=await talus.entities.spawn(owner.snapshot().templateId,6800,350);if(!target||!await target.whenLive({timeoutTicks:600}))throw new Error('Target unavailable');await talus.sleepTicks(120);
const targetBefore=target.snapshot();if(Math.abs(targetBefore.vy)>1||targetBefore.y>401)throw new Error('Target did not settle '+JSON.stringify(targetBefore));
const hpBefore={owner:owner.health,target:target.health};
const body=await fly({...base,x:target.x-100,y:target.y,vx:180,vy:0,gravityScale:0});
const hpAfter={owner:owner.health,target:target.health};
const lifetime=await fly({...base,x:6700,y:200,vx:0,gravityScale:0,lifetime:.3,damage:0,aoeRadius:0,carveRadius:0,detonate:{fuse:4,onBody:false,onTerrain:false,atLifetime:true}});
const expired=await fly({...base,x:6700,y:200,vx:0,gravityScale:0,lifetime:.3,damage:0,aoeRadius:0,carveRadius:0,detonate:{onBody:false,onTerrain:false,atLifetime:false}});
talus.sim.pause();return {owner:owner.id,target:target.id,targetBefore,hpBefore,hpAfter,floor,fuse,body,lifetime,expired,events,damage,explosions};
