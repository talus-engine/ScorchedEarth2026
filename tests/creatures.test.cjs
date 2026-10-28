const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const catalog = JSON.parse(fs.readFileSync('world/Game/creatures.json', 'utf8'));
const source = ts.transpileModule(fs.readFileSync('world/Scripts/lib/creatures.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS },
}).outputText;

function scene() {
    const actors = new Map(), calls = { cuts: [], spawns: [], forces: [], holds: [], kills: [], damage: [], released: [], anchors: [] };
    const listeners = {}, jobs = [], control = { cut: null, ready: true };
    let serial = 0, service;
    function entity(id, at, alive = true) {
        const e = { id, liveId: ++serial, persistent: true, position: { ...at }, velocity: { x: 0, y: 0 }, exists: true, isLive: true, alive,
            can: () => e.exists && e.isLive,
            setVelocity() {}, applyForce(x, y) { calls.forces.push({ id, x, y }); },
            kill(owner) { calls.kills.push({ id, owner }); e.alive = false; },
            damage(amount, opts) { calls.damage.push({ id, amount, ...opts }); },
            despawn() { e.exists = false; },
            controller: { holdPose(seconds) { calls.holds.push([id, seconds]); return { accepted: true }; } } };
        actors.set(id, e);
        return e;
    }
    const talus = { sim: { clock: 1, paused: false }, camera: { view: { viewport: { x: 0, y: 0, w: 1200, h: 900 } } },
        elements: { get: name => ({ id: catalog.worm.materials.indexOf(name) + 1 }) },
        entities: { get: id => typeof id === 'number' ? [...actors.values()].find(e => e.liveId === id) || null : actors.get(id) || null,
            async spawn(template, at) { calls.spawns.push({ template, at }); return entity('creature-' + serial, at, template === catalog.worm.template ? null : true); } },
        world: { async terrainWork(spec) { calls.cuts.push(spec); if (control.cut) return control.cut; return { status: 'completed', work: 45, reason: 'ok' }; } },
        on(name, fn) { (listeners[name] ||= []).push(fn); }, log() {} };
    const ctx = { state: { match: { seed: 123, turnNumber: 1, bounds: { x: 0, y: 0, w: 12800, h: 1280 },
        roster: [{ entityId: 'shooter' }, { entityId: 'target' }] }, arena: { terrain: { solidBottomTileRow: 4 }, tiles: { chunksPerTile: 4 } } },
        core: { chaosSeed: s => [...s].reduce((v, c) => (Math.imul(v, 31) + c.charCodeAt(0)) >>> 0, 17),
            clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), entity: p => actors.get(p.entityId) },
        residency: { releaseEmissionRegion: key => calls.released.push(key),
            emissionRegionReady(key, spec, particles, actorReady) { calls.anchors.push({ key, spec, particles }); return control.ready && actorReady; } },
        session: { persist() {}, run(fn) { jobs.push(fn()); } } };
    entity('shooter', { x: 200, y: 500 }); entity('target', { x: 500, y: 500 });
    const module = { exports: {} };
    vm.runInNewContext('(function(module,exports){' + source + '\n})', { talus })(module, module.exports);
    function load() { service = module.exports(ctx); service.configure(structuredClone(catalog)); return service; }
    load().bind();
    return { actors, calls, control, ctx, talus, load, get service() { return service; },
        creature: () => ctx.state.match.creatures.items[0], entity, async settle() { await Promise.all(jobs); },
        tick(dt = .1) { talus.sim.clock += dt; service.tick(dt); },
        contact(a, b) { for (const fn of listeners['entity.contact']) fn({ with: 'body', entity: actors.get(a), entityId: actors.get(a).liveId, otherEntityId: String(actors.get(b).liveId) }); } };
}

test('The worm excavates a bounded native corridor before spawning one durable jointed template', async () => {
    const f = scene();
    const outcome = await f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    assert.equal(outcome.status, 'spawned');
    assert.equal(f.calls.cuts.length, 1);
    const cut = f.calls.cuts[0];
    assert.equal(cut.kind, 'excavate');
    assert.equal(cut.requireEligible, undefined, 'Native matching leaves protected geometry for physical contact');
    assert.equal(cut.replacement, 'matching');
    assert.equal(cut.excavation.output, 'EMPTY');
    assert.equal(cut.shape.width, 30);
    assert.equal(cut.bounds.h, 1024, 'Foundation lies outside the working bounds');
    assert.ok(cut.budget.cells < 512 * 512);
    assert.equal(f.calls.spawns[0].template, catalog.worm.template);
    assert.equal(f.creature().owner, 'shooter');
    assert.equal(f.service.busy(), false, 'Persistent creature lifetime is a normal saved state');
    assert.equal(f.service.settling(), false, 'A multi-turn worm cannot delay round completion forever');
    assert.equal(f.service.canFire({ behavior: { mode: 'creature', creature: 'worm' } }), false);
    assert.equal(f.service.canFire({ behavior: { mode: 'creature', creature: 'crow' } }), true);
    assert.equal(f.service.canFire({ id: 'standard' }), true);
    assert.equal((await f.service.spawn('worm', 'shooter', { x: 700, y: 500 })).reason, 'creature-limit');
});

test('Cancellation and native refusal never manufacture an entity or claim terrain clearance', async () => {
    const f = scene();
    let resolve;
    f.control.cut = new Promise(r => { resolve = r; });
    const promise = f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    assert.equal(f.service.busy(), true);
    f.service.stop();
    resolve({ status: 'completed', work: 45 });
    assert.equal((await promise).status, 'cancelled');
    assert.equal(f.calls.spawns.length, 0);
    assert.equal(f.service.busy(), false);
    f.load();
    f.control.cut = Promise.resolve({ status: 'refused', reason: 'anchor-admission-capacity' });
    assert.equal((await f.service.spawn('worm', 'shooter', { x: 800, y: 600 })).reason, 'anchor-admission-capacity');
    assert.equal(f.calls.spawns.length, 0);
});

test('Worm contact is a native kill with durable credit, including the shooter; proximity alone does nothing', async () => {
    const f = scene();
    await f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    const worm = f.creature();
    f.actors.get(worm.entityId).position = { ...f.actors.get('target').position };
    assert.equal(f.calls.kills.length, 0);
    f.contact(worm.entityId, 'target');
    f.contact('shooter', worm.entityId);
    assert.deepEqual(f.calls.kills, [{ id: 'target', owner: 'shooter' }, { id: 'shooter', owner: 'shooter' }]);
    assert.equal(f.calls.damage.length, 0);
});

test('Articulation is driven only after bounded native work; a pending job has one pose hold and no duplicate cut', async () => {
    const f = scene();
    await f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    let resolve;
    f.control.cut = new Promise(r => { resolve = r; });
    f.tick(); f.tick();
    assert.equal(f.calls.cuts.length, 2);
    assert.equal(f.calls.forces.length, 0);
    assert.equal(f.service.busy(), true);
    assert.equal(f.calls.anchors[0].spec.halfWidth, 288);
    assert.deepEqual(f.calls.holds.map(h => h[1]), [10]);
    resolve({ status: 'completed', work: 8 }); await f.settle();
    f.tick();
    assert.equal(f.service.busy(), false);
    assert.equal(f.calls.forces.length, 1);
    assert.deepEqual(f.calls.holds.map(h => h[1]), [10, 0]);
    f.tick(4);
    assert.ok(f.calls.released.includes('creature:1'), 'Idle worm releases its finite simulation region');
});

test('Unavailable simulation regions hold movement without spending the worm turn or cutting terrain', async () => {
    const f = scene();
    await f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    f.control.ready = false;
    const remaining = f.creature().remaining;
    f.tick(2);
    assert.equal(f.calls.cuts.length, 1);
    assert.equal(f.calls.forces.length, 0);
    assert.equal(f.creature().remaining, remaining);
});

test('Protected cells may remain after native matching work; only actual contact can kill a tank', async () => {
    const f = scene();
    await f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    f.control.cut = Promise.resolve({ status: 'completed', work: 0, accepted: 0, skipped: 128 });
    f.tick(); await f.settle(); f.tick();
    assert.equal(f.calls.cuts.at(-1).requireEligible, undefined);
    assert.equal(f.calls.forces.length, 1, 'Head force lets native collision decide whether movement is possible');
    assert.equal(f.calls.kills.length, 0);
    assert.equal(f.actors.get('target').alive, true);
    f.contact(f.creature().entityId, 'target');
    assert.deepEqual(f.calls.kills, [{ id: 'target', owner: 'shooter' }]);
});

test('Crow chooses the nearest tank, rate-limits actual contacts, then stops damage and leaves within a finite window', async () => {
    const f = scene();
    await f.service.spawn('crow', 'shooter', { x: 490, y: 500 });
    const crow = f.creature();
    assert.equal(crow.target, 'target');
    assert.equal(f.service.settling(), true);
    f.actors.get('shooter').exists = false;
    f.contact(crow.entityId, 'target'); f.contact(crow.entityId, 'target');
    assert.deepEqual(f.calls.damage, [{ id: 'target', amount: 22, type: 'kinetic', source: 'shooter' }]);
    f.tick(.6); f.contact('target', crow.entityId);
    assert.equal(f.calls.damage.length, 2);
    f.actors.get(crow.entityId).isLive = false;
    f.tick(4);
    assert.equal(f.service.settling(), false);
    f.contact(crow.entityId, 'target');
    assert.equal(f.calls.damage.length, 2);
    f.tick(9);
    assert.equal(f.actors.get(crow.entityId).exists, false, 'Offscreen streaming cannot strand the departing crow');
});

test('Reload retains creature identity and turn RNG; repeated hooks do not age a worm twice', async () => {
    const f = scene();
    await f.service.spawn('worm', 'shooter', { x: 800, y: 600 });
    const saved = JSON.parse(JSON.stringify(f.ctx.state.match)), prior = f.creature();
    f.ctx.state.match = saved; f.load();
    f.ctx.state.match.turnNumber++;
    f.service.onTurn();
    const heading = f.creature().heading, turns = f.creature().turns;
    f.service.onTurn();
    assert.equal(f.creature().entityId, prior.entityId);
    assert.equal(f.creature().turns, prior.turns - 1);
    assert.equal(f.creature().turns, turns);
    assert.equal(f.creature().heading, heading);
    assert.equal(f.calls.spawns.length, 1);
    f.service.finish();
    assert.equal(f.actors.get(prior.entityId).exists, false);
    assert.equal(f.service.busy(), false);
});
