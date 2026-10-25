talus.sim.pause();
const m=talus.state.getJson('indigo.match'),a=talus.entities.get(m.roster[0].entityId),b=talus.entities.get(m.roster[1].entityId);
const target=()=>({target:b.position,targetBodyId:b.liveId,preferHighArc:true});
const ammoBefore=JSON.stringify(a.weapon.state.ammo),wind=talus.world.wind,out={};
out.clear=await a.weapon.plan(target());
out.low=await a.weapon.plan({...target(),fixedAngle:-Math.PI/4});
out.carrier=await a.weapon.plan({...target(),goal:'apex'});
out.budget=await a.weapon.plan({...target(),maxCells:100});
out.unloaded=await a.weapon.plan({...target(),terrain:'resident'});
out.wrongBody=await a.weapon.plan({...target(),targetBodyId:2147483647,maxCandidates:2});
try {talus.world.wind=20;out.opposite=await b.weapon.plan({target:a.position,targetBodyId:a.liveId,preferHighArc:true});}
finally {talus.world.wind=wind;}
const weapon=a.weapon.state.equipped,rounds=a.weapon.state.ammo[weapon];
try {a.weapon.setAmmo(weapon,0);out.empty=await a.weapon.plan(target());}
finally {a.weapon.setAmmo(weapon,rounds===undefined?null:rounds);}
const d=a.defenses.state?.deflector;
if(d && !d.active && d.remaining===0) {
 const charged=a.defenses.charge('deflector',1);
 try {out.activation=a.defenses.activate('deflector',true);out.defense=await a.weapon.plan(target());}
 finally {a.defenses.activate('deflector',false);a.defenses.discharge('deflector',charged.added);}
}
const tick=async()=>{talus.sim.resume();await talus.sleepTicks(2);talus.sim.pause();};
const clear=async(shape)=>talus.world.terrainWork({kind:'excavate',shape,bounds:shape,replacement:'eligible',materials:[{element:talus.elements.get('STONE').id,hardness:1}],budget:{cells:shape.w*shape.h,particles:shape.w*shape.h,work:shape.w*shape.h}});
const add=shape=>{for(let y=shape.y;y<shape.y+shape.h;y++)for(let x=shape.x;x<shape.x+shape.w;x++)if(talus.world.cell(x,y)?.element)throw Error('Diagnostic fixture is not empty');return talus.world.fill(shape,'STONE');};
if(!out.clear.solution)throw Error('Expected a clear actual valley plan');
const spot=out.clear.solution.path.slice(0,4).find(p=>[0,1].every(dx=>[0,1].every(dy=>!talus.world.cell(Math.floor(p.x)+dx,Math.floor(p.y)+dy)?.element)));
if(!spot)throw Error('No empty muzzle-course fixture');
const muzzle={x:Math.floor(spot.x),y:Math.floor(spot.y),w:2,h:2};out.muzzleFixture=muzzle;
let filled=0;
try {filled=add(muzzle);await tick();out.muzzle=await a.weapon.plan({...target(),fixedAngle:out.clear.solution.angle});}
finally {if(filled)out.muzzleCleanup=await clear(muzzle);}
const roofY=Math.floor(a.y-72),right=Math.floor(a.x+118),roofX=Math.floor(a.x-20),floor=1024;
const shapes=[{x:roofX,y:roofY,w:128,h:2},{x:roofX+128,y:roofY,w:right-roofX-128+2,h:2},{x:right,y:roofY+2,w:2,h:floor-roofY-2}];
const added=[];
try {
 for(const s of shapes){const count=add(s);added.push({shape:s,count});}
 await tick();out.overhang=await a.weapon.plan(target());
} catch(error) {out.overhangFixtureRefused=String(error);}
 finally {
 out.overhangCleanup=[];
 for(const s of added)out.overhangCleanup.push({added:s.count,receipt:await clear(s.shape)});
}
out.opened=await a.weapon.plan(target());
out.ammoUnchanged=ammoBefore===JSON.stringify(a.weapon.state.ammo);
out.actors=[a.snapshot(),b.snapshot()];out.save=talus.game.saveStatus;
return out;
