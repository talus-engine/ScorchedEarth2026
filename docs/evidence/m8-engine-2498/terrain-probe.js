const stone=talus.elements.get('STONE').id,sand=talus.elements.get('SAND').id;
const actor=talus.entities.get(talus.state.get('m8.native.actor'));
actor.teleport(6260,350);actor.setVelocity(0,0);await talus.sleepTicks(60);
const start=actor.snapshot(),placed=talus.world.fill({x:6290,y:360,w:32,h:40},'STONE');
await talus.sleepTicks(10);
const policy={kind:'excavate',bounds:{x:6016,y:280,w:384,h:128},exclusions:[{x:6016,y:400,w:384,h:16}],replacement:'eligible',materials:[{element:stone,hardness:3}],budget:{cells:4096,particles:4096,work:12288},actor:{entity:actor,reach:100}};
const refused=await talus.world.terrainWork({...policy,shape:{x:6290,y:360,w:32,h:40},budget:{cells:1280,particles:1280,work:1}});
const first=await talus.world.terrainWork({...policy,shape:{x:6235,y:355,w:90,h:50},budget:{cells:5000,particles:5000,work:15000}});
const second=await talus.world.terrainWork({...policy,shape:{x:6290,y:360,w:32,h:40}});
for(let n=0;n<90;n++){const s=actor.snapshot();actor.setVelocity(55,s.vy);await talus.sleepTicks(1)}
actor.setVelocity(0,actor.snapshot().vy);
const walked=actor.snapshot();
const recipe={id:'m8-native-sand',name:'Seeded sand bank',description:'native diagnostic',tags:[],macro:{mode:'volumetric',support:'none',strata:[{element:'SAND',thickness:[1,1],bands:[{element:'SAND',endPos:.55},{element:'EMPTY',endPos:1}]}]},micro:{noise:{algorithm:'simplex',frequency:.1,octaves:3,persistence:.5,lacunarity:2}}};
const camera=talus.camera.view;
const near=await talus.world.terrainWork({kind:'recipe',shape:{x:6370,y:330,radius:24},bounds:{x:0,y:0,w:12800,h:1024},budget:{cells:4096,particles:4096,work:4096},replacement:'empty',recipe,seed:1729,holdSeconds:2});
return {stone,sand,start,placed,refused,first,second,walked,near,cameraBefore:camera,cameraAfter:talus.camera.view,actorHealth:actor.health};
