const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./support/game.cjs');

function scene(effect) {
    const f = fixture(), ctx = f.game.context, p = f.m.roster[1], wreck = f.actors.get(p.entityId);
    const calls = [], pending = [], holds = [], shots = [], sprays = [], despawns = [];
    const fx = ctx.state.chaosCatalog.effects.find(fx => fx.id === effect);
    ctx.state.chaosCatalog = { ...ctx.state.chaosCatalog, effects: [fx] };
    const control = { ready: true, particles: 'simulated', status: 'completed', reason: 'ok', defer: null };
    wreck.alive = false;
    wreck.controller.holdPose = seconds => { holds.push(seconds); return { accepted: true, seconds }; };
    wreck.despawn = () => { despawns.push(wreck.id); wreck.exists = false; };
    wreck.transmute = async spec => {
        calls.push(structuredClone(spec));
        if (control.defer) await control.defer;
        const receipt = { status: control.status, reason: control.reason, changed: spec.element === 'FIRE' ? 5 : 523,
            released: spec.element === 'HYDROCHLORIC_ACID' ? 523 : spec.element === 'FIRE' ? 5 : 0 };
        if (receipt.status === 'completed' && spec.element === 'HYDROCHLORIC_ACID') wreck.exists = false;
        return receipt;
    };
    f.talus.sim.anchor = () => ({ active: true, chunks: [{ x: 0, y: 0 }], get loaded() { return +control.ready; },
        get particles() { return control.particles; }, refused: null, update() {}, release() { this.active = false; } });
    f.talus.projectiles = { launch(spec) { const shot = { id: shots.length + 1, spec: structuredClone(spec), exists: true };
        shots.push(shot); return shot; }, get(id) { return shots.find(s => s.id === id); } };
    f.talus.world.spawnParticles = spec => { sprays.push(structuredClone(spec)); return spec.count; };
    f.talus.world.explode = () => ({ carvedCells: 0 });
    ctx.session.run = fn => pending.push(fn());
    f.api.queueChaos(p);
    const job = f.m.chaos.jobs[0];
    return { ...f, ctx, p, wreck, job, fx, control, calls, pending, holds, shots, sprays, despawns,
        step(dt) { f.talus.sim.clock += dt; f.api.tickChaos(dt); },
        async settle() { await Promise.all(pending); } };
}

test('Dynamite adopts the painted frame, ignites only its local centre and leaves the real wreck to react', async () => {
    const f = scene('dynamite');
    f.control.particles = 'held';
    f.step(.1);
    assert.equal(f.calls.length, 0, 'Native capture waits for simulated material');
    assert.equal(f.job.elapsed, 0);
    let release;
    f.control.defer = new Promise(resolve => { release = resolve; });
    f.control.particles = 'simulated';
    f.step(.01);
    assert.equal(f.calls.length, 1);
    f.step(.01);
    assert.equal(f.calls.length, 1, 'Only one native conversion can be pending');
    assert.equal(f.barriers.get('match-sequence')?.includes('death'), true);
    release();
    await f.settle();
    assert.deepEqual(f.calls.map(c => [c.element, c.source, c.preserveColor]), [
        ['DYNAMITE', 'visual-frame', true], ['FIRE', undefined, false],
    ]);
    assert.deepEqual(f.calls[1].region, { x: -1, y: -1, w: 2, h: 2 });
    assert.equal(f.job.convertedMembers, 523);
    assert.equal(f.job.ignitedMembers, 5, 'Overlapping real members are not limited to four artificial pixels');
    assert.equal(f.job.emissionDone, true);
    assert.equal(f.wreck.exists, true);
    assert.equal(f.despawns.length, 0, 'Physical dynamite is not removed before native combustion');
    assert.deepEqual(f.holds, [20, 0]);
    f.step(.01);
    assert.equal(f.m.chaos.jobs.length, 0, 'The rest of play need not wait for chemistry to settle');
});

test('Acid releases the actual painted frame without a synthetic spray or replacement body', async () => {
    const f = scene('acid');
    f.step(.01);
    await f.settle();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].element, 'HYDROCHLORIC_ACID');
    assert.equal(f.job.releasedMembers, 523);
    assert.equal(f.wreck.exists, false);
    assert.equal(f.despawns.length, 0);
    assert.equal(f.sprays.length, 0);
    assert.equal(f.ctx.state.deathPoseHolds.size, 0);
});

test('Last laugh shoots ten independent random directions before native dynamite ignition', async () => {
    const f = scene('last-laugh');
    for (let n = 0; n < 75; n++) f.step(.01);
    await f.settle();
    assert.equal(f.shots.length, 10);
    assert.equal(new Set(f.shots.map(s => Math.atan2(s.spec.vy, s.spec.vx))).size, 10);
    assert.ok(f.shots.every(s => s.spec.owner === f.wreck.id && s.spec.independent));
    assert.equal(f.calls[0].element, 'DYNAMITE');
    assert.equal(f.calls[1].element, 'FIRE');
    assert.equal(f.job.emissionDone, true);
    assert.equal(f.despawns.length, 0);
    assert.equal(f.m.chaos.jobs.length, 1, 'Real descendant lifecycle still fences the script queue');
    for (const shot of f.shots) f.emit('projectile.end', { projectileId: shot.id, ownerStableId: f.wreck.id });
    f.step(.01);
    assert.equal(f.job.ended, 10);
    assert.equal(f.m.chaos.jobs.length, 0);
});

test('A refused native conversion releases its pose and region without pretending the effect completed', async () => {
    const f = scene('dynamite');
    f.control.status = 'refused';
    f.control.reason = 'external-joints';
    f.step(.01);
    await assert.rejects(f.settle(), /Death material conversion refused: external-joints/);
    assert.equal(f.job.emissionDone, false);
    assert.equal(f.calls.length, 1);
    assert.equal(f.ctx.state.emissionRegions.size, 0);
    assert.equal(f.ctx.state.deathPoseHolds.size, 0);
    assert.equal(f.despawns.length, 0);
});

test('Conversion errors survive a second failure while releasing the native pose', async () => {
    const f = scene('dynamite'), logs = [];
    f.talus.log = line => logs.push(line);
    f.control.status = 'refused';
    f.control.reason = 'external-joints';
    f.wreck.controller.holdPose = () => ({ accepted: false, reason: 'capture-busy' });
    f.step(.01);
    await assert.rejects(f.settle(), /Death material conversion refused: external-joints/);
    assert.equal(f.ctx.state.deathPoseHolds.size, 0);
    assert.equal(f.ctx.state.emissionRegions.size, 0);
    assert.ok(logs.some(line => line.includes('capture-busy')));
});

test('A match fault releases every death hold and reports its original error when one cleanup is refused', () => {
    const f = scene('furnace'), logs = [], banners = [], records = [], other = f.actors.get(f.m.roster[0].entityId);
    const releases = [];
    f.talus.log = line => logs.push(line);
    f.talus.ui.banner = (...args) => banners.push(args);
    f.talus.state.set = (...args) => records.push(args);
    f.wreck.controller.holdPose = () => ({ accepted: false, reason: 'capture-busy' });
    other.controller.holdPose = seconds => { releases.push(seconds); return { accepted: true, seconds }; };
    f.ctx.state.deathPoseHolds.set(other.id, { liveId: other.liveId, until: f.talus.sim.clock + 20 });
    assert.doesNotThrow(() => f.api.fail(Error('original volley failure')));
    assert.equal(f.m.phase, 'fault');
    assert.equal(f.m.message, 'Error: original volley failure');
    assert.deepEqual(releases, [0]);
    assert.equal(f.ctx.state.deathPoseHolds.size, 0);
    assert.ok(logs.some(line => line.includes('capture-busy')));
    assert.equal(records.at(-1)[1], 'Error: original volley failure');
    assert.equal(banners.at(-1)[1].sub, 'Error: original volley failure');
});

test('Concurrent native destruction cancels hull work without replacing the missing tank', async () => {
    const f = scene('dynamite');
    f.wreck.exists = false;
    f.step(.01);
    await f.settle();
    assert.equal(f.calls.length, 0);
    assert.equal(f.job.conversionCancelled, 'wreck-destroyed');
    assert.equal(f.job.emissionDone, true);
    assert.equal(f.despawns.length, 0);
    f.step(.01);
    assert.equal(f.m.chaos.jobs.length, 0);
});

test('The furnace emits exactly one hundred finite pulses while the next turn can continue', () => {
    const f = scene('furnace');
    for (let n = 0; n < 101; n++) f.step(.1);
    assert.equal(f.sprays.length, 100);
    assert.equal(f.job.particles, 3200);
    assert.equal(f.job.emissionDone, true);
    assert.equal(f.m.phase, 'turn');
    assert.equal(f.ctx.state.emissionRegions.size, 0);
    assert.equal(f.ctx.state.deathPoseHolds.size, 0);
    f.step(2);
    assert.equal(f.sprays.length, 100, 'Residual material does not restart the emitter');
});
