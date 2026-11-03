const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const settings = JSON.parse(fs.readFileSync('world/Game/input.json'));
const rules = JSON.parse(fs.readFileSync('world/Game/arena-rules.json'));
const plain = value => JSON.parse(JSON.stringify(value));
async function setup() {
    const f = fixture();
    f.talus.files = { readText: async p => fs.readFileSync('world/' + p, 'utf8') };
    f.talus.state.set = () => {};
    f.talus.ui.banner = () => {};
    await f.game.context.simulation.load();
    return f;
}

test('whole-map readiness gates play without demanding a GPU layer for empty sky', async () => {
    const f = await setup(), calls = [];
    const setRing = f.talus.sim.setRing;
    f.talus.sim.setRing = (...args) => { calls.push(plain(args)); return setRing(...args); };
    let release;
    f.talus.sim.whenRingLoaded = () => new Promise(resolve => { release = resolve; });
    let ready = false;
    const preparing = f.game.context.simulation.prepare().then(() => { ready = true; });
    assert.equal(ready, false);
    assert.match(f.ui.simulationNotice, /Preparing battlefield/);
    assert.deepEqual(calls[0], [settings.startRing, { electrical: settings.startElectrical }]);
    assert.deepEqual(plain(f.talus.camera.view.frame.spec), settings.startCameraFrame);
    const ring = f.talus.sim.ring;
    ring.resident = 2400; ring.open = ring.chunks - ring.resident;
    release(true);
    await preparing;
    assert.equal(ready, true);
    assert.equal(f.ui.simulationNotice, '');
    f.api.cameraPoint({ x: 100, y: 600 }, 'left');
    f.api.cameraPoint({ x: 12600, y: 600 }, 'right');
    assert.equal(calls.length, 1, 'Camera travel does not move or re-pin the simulation');
    assert.deepEqual(plain(f.m.bounds), { x: 0, y: 0, w: 12800, h: 1280 });
    f.talus.sim.whenRingLoaded = async () => true;
    await f.game.context.simulation.prepare();
    assert.deepEqual(calls[1], calls[0], 'Reload reasserts the same authored full-map policy');
});

test('a refusal, unreachable wall or incomplete load never admits play', async () => {
    for (const kind of ['refused', 'wall', 'loading', 'budget']) {
        const f = await setup();
        f.game.context.state.arena = { ...f.game.context.state.arena, simulation: { loadTimeoutTicks: 120, budgetTimeoutSeconds: 10 } };
        if (kind === 'refused') f.talus.sim.setRing = () => { throw Error('REFUSED: electrical window'); };
        if (kind === 'wall') {
            f.talus.sim.ring.arena = { wallsOutside: [{ edge: 'right' }] };
            f.talus.sim.ring.problems = ['right wall outside ring'];
        }
        if (kind === 'budget') f.talus.sim.ring.overBudget = true;
        let waits = 0;
        f.talus.sim.whenRingLoaded = async () => { waits++; return false; };
        await assert.rejects(f.game.context.simulation.prepare(), /REFUSED|walls lie outside|loading timed out|exceeds its simulation memory/);
        assert.equal(waits, ['loading', 'budget'].includes(kind) ? 2 : 0);
    }
});

test('transient memory pressure recovers; persistent pressure is a visible failure, not an endless wait', async () => {
    const f = await setup(), failures = [];
    f.game.context.session.fail = e => failures.push(String(e));
    f.emit('sim.ring-budget', { overBudget: true, awaitingLayers: 3 });
    f.game.context.simulation.tick(4);
    assert.match(f.ui.simulationNotice, /3 chunks waiting/);
    f.emit('sim.ring-budget', { overBudget: false, awaitingLayers: 0 });
    f.game.context.simulation.tick(20);
    assert.equal(f.ui.simulationNotice, '');
    assert.deepEqual(failures, []);
    f.emit('sim.ring-budget', { overBudget: true, awaitingLayers: 12 });
    f.talus.sim.paused = true;
    f.game.context.simulation.tick(60);
    assert.deepEqual(failures, [], 'User pause does not consume the recovery window');
    f.talus.sim.paused = false;
    f.game.context.simulation.tick(10);
    assert.match(failures[0], /memory is full/);
});

test('deferred particle shortfalls are reported without replaying the emission', async () => {
    const f = await setup(), logs = [];
    f.talus.log = text => logs.push(text);
    f.talus.world.spawnParticles = () => { throw Error('A shortfall must not duplicate its accepted particles'); };
    f.emit('world.spawn-shortfall', { x: 12000, y: -1000, requested: 32, placed: 21, reason: 'timeout' });
    assert.match(logs[0], /21\/32/);
    assert.match(f.ui.simulationNotice, /21 \/ 32/);
    f.game.context.simulation.tick(5);
    assert.equal(f.ui.simulationNotice, '');
});

test('in-ring effects use the existing simulation without spending a second anchor reserve', async () => {
    const f = await setup();
    await f.game.context.simulation.prepare();
    f.talus.sim.anchor = () => { throw Error('The battlefield already owns this region'); };
    const spec = { rect: { x: 12000, y: 500, w: 128, h: 128 } };
    assert.equal(f.api.emissionRegionReady('test', spec, true), true);
    f.talus.sim.ring.ready--;
    assert.equal(f.api.emissionRegionReady('test', spec, true), false);
    f.talus.sim.ring.ready++;
    assert.equal(f.api.emissionRegionReady('test', spec, true, false), false);
    assert.equal(f.api.emissionRegionReady('test', spec, true), true);
});

test('confined camera arrival accepts a visible edge subject only after travel and native readiness', async () => {
    const f = await setup(), view = f.talus.camera.view;
    view.frame = { spec: { bounds: { x: 0, y: 0, w: 4000, h: 2000 }, mode: 'confine' } };
    view.viewport = { x: 0, y: 100, w: 1600, h: 1000 };
    const state = { phase: 'moving', ready: true, targetPoint: { x: 20, y: 600 }, center: { x: 800, y: 600 }, tolerance: 12 };
    assert.equal(f.api.cameraArrived(state), true);
    assert.equal(f.api.cameraArrived({ ...state, center: { x: 840, y: 600 } }), false);
    assert.equal(f.api.cameraArrived({ ...state, ready: false }), false);
    assert.equal(f.api.cameraArrived({ ...state, phase: 'held' }), false);
});

test('flight walls sit inside the ring while tank bounds and deployment spacing stay unchanged', () => {
    const arena = JSON.parse(fs.readFileSync('world/Game/arena.json')), b = arena.bounds, r = settings.startRing;
    assert.equal(arena.combat.w, 3072);
    for (const rule of rules) {
        assert.equal(rule.projectiles, 'remove'); assert.equal(rule.looseBodies, 'remove');
        assert.equal(rule.kill, false, 'Tank death continues through the game rules and presentation');
        for (const edge of rule.edges) {
            const wall = { left: b.x - rule.marginPx, right: b.x + b.w + rule.marginPx,
                top: b.y - rule.marginPx, bottom: b.y + b.h + rule.marginPx }[edge];
            assert(edge === 'left' ? wall > r.x : edge === 'right' ? wall < r.x + r.w : edge === 'top' ? wall > r.y : wall < r.y + r.h);
        }
    }
    assert(settings.engineBudgets.particleSlots > 8314112, 'The WFC source census needs room for emitted matter');
    assert.equal(settings.weatherOverOpenSky, true);
});
