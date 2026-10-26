const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
function scene() {
    const f = fixture(), p = f.m.roster[0], e = f.actors.get(p.entityId);
    p.control = 'human'; p.targetId = f.m.roster[1].entityId; p.weaponId = 'standard';
    e.blackboard.set('custom.angle', 60); e.blackboard.set('custom.power', 20);
    for (const id of ['horz-guidance','vert-guidance','ballistic-guidance','contact-trigger']) f.api.wallet(p).stock[id] = 2;
    return { ...f, p, e, attachment: f.game.context.attachments };
}
test('attachment arming costs nothing; a real compatible launch consumes one charge', () => {
    const f = scene(), w = f.api.wallet(f.p);
    assert.equal(f.attachment.arm(f.p, 'horz-guidance'), true); assert.equal(w.stock['horz-guidance'], 2);
    assert.equal(f.attachment.arm(f.p, 'contact-trigger'), true);
    const a = { item:'standard', targetAtLaunch: {x:100,y:600} };
    f.attachment.attach(f.p,a); f.attachment.attach(f.p,a);
    assert.equal(w.stock['horz-guidance'],1); assert.equal(w.stock['contact-trigger'],1);
    assert.equal(a.guidanceArmed,'horz-guidance'); assert.equal(f.p.guidanceArmed,null);
    f.p.weaponId='flamethrower'; assert.equal(f.attachment.arm(f.p,'horz-guidance'),false);
    f.p.guidanceArmed='vert-guidance'; f.api.publish();
    assert.equal(f.ui.attachments.find(i=>i.action==='arm-vert-guidance').disabled,false,'An armed attachment can be disarmed after changing to an incompatible weapon');
    assert.equal(f.attachment.arm(f.p,'vert-guidance'),true); assert.equal(f.p.guidanceArmed,null);
});
test('ballistic aid only accepts a clear unchanged fixed-angle solution and keeps refused charges', async () => {
    const f = scene(); f.attachment.arm(f.p,'ballistic-guidance'); let request;
    f.e.weapon.plan = async r => {request=r;return {status:'clear',solution:{power:.62,angle:r.fixedAngle}}};
    assert.equal(await f.attachment.prepare(f.p),true); assert.equal(request.maxCandidates,1);
    assert.equal(f.e.blackboard.get('custom.power'),62); assert.equal(f.api.wallet(f.p).stock['ballistic-guidance'],2);
    assert.equal(f.attachment.ready(f.p),true); f.e.position.x+=5;
    assert.equal(f.attachment.ready(f.p),false); assert.equal(f.m.phase,'turn');
    f.e.weapon.plan=async()=>({status:'refused',reason:'obstructed'});
    assert.equal(await f.attachment.prepare(f.p),false); assert.equal(f.api.wallet(f.p).stock['ballistic-guidance'],2);
});
test('guidance waits for its crossing, native held/paused shots do not change, contact affects root only', () => {
    for (const type of ['horz-guidance','vert-guidance']) {
        const f=scene(), target=f.actors.get(f.p.targetId).position;
        const s={x:target.x-10,y:target.y-10,vx:100,vy:80,held:false}, velocities=[];let blasts=0;
        const shot={snapshot:()=>s,setVelocity:(x,y)=>velocities.push([x,y]),exists:true,detonate:()=>{blasts++;shot.exists=false;}};
        f.talus.projectiles={get:()=>shot};
        f.m.attack={rootId:4,guidanceArmed:type,contactArmed:'contact-trigger',targetId:f.p.targetId,origin:{x:s.x-10,y:s.y-10}};
        f.attachment.tickGuidance();assert.equal(velocities.length,0);
        if(type==='horz-guidance')s.y=target.y+1;else s.x=target.x+1;
        s.held=true;f.attachment.tickGuidance();assert.equal(velocities.length,0);
        s.held=false;f.talus.sim.paused=true;f.attachment.tickGuidance();assert.equal(velocities.length,0);
        f.talus.sim.paused=false;f.attachment.tickGuidance();assert.equal(velocities.length,1);
        if(type==='vert-guidance')assert.ok(velocities[0][1]>0);else assert.ok(velocities[0][0]>0);
        f.attachment.contact(shot,5);assert.equal(blasts,0);
        f.attachment.contact(shot,4);f.attachment.contact(shot,4);assert.equal(blasts,1);
    }
});
