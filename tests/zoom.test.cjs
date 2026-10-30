const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture } = require('./support/game.cjs');

function scene() {
    const f = fixture(), calls = [];
    f.talus.camera.view.zoom = 2;
    let snapshot = { id: 1, x: 6000, y: 600, vx: 200, vy: -300, age: 0, held: false };
    f.m.phase = 'flight';
    f.m.attack = { ids: { 1: { launch: { ...snapshot } } }, targetAtLaunch: { x: 7200, y: 600 } };
    f.game.context.state.shot = { snapshot: () => ({ ...snapshot }) };
    f.talus.camera.setZoom = zoom => {
        assert(zoom >= 1 && zoom <= 2);
        calls.push(zoom);
        f.talus.camera.view.zoom = zoom;
        return f.talus.camera.view;
    };
    const frame = (dt = 1 / 60) => f.emit('tick.frame', { dt });
    const at = (age, extra = {}) => {
        snapshot = { ...snapshot, age, x: 6000 + 200 * age, y: 600 - 300 * age + 50 * age ** 2,
            vy: -300 + 100 * age, ...extra };
        frame();
        assert.notEqual(f.m.phase, 'fault');
        return f.talus.camera.view.zoom;
    };
    return { ...f, calls, at, frame };
}

test('live ascent widens to 100% at the apex, descent closes to 200%, then turns stay wide', () => {
    const f = scene(), samples = [];
    for (let n = 0; n <= 360; n++) samples.push(f.at(n / 60));
    assert.equal(samples[0], 2);
    assert(samples[90] < 1.6 && samples[90] > 1);
    assert.equal(samples[180], 1);
    assert(samples[270] > 1 && samples[270] < 1.8);
    assert.equal(samples[360], 2);
    for (let n = 1; n <= 180; n++) assert(samples[n] <= samples[n - 1]);
    for (let n = 181; n <= 360; n++) assert(samples[n] >= samples[n - 1]);
    f.m.phase = 'settling';
    f.m.attack = null;
    f.frame();
    assert.equal(f.talus.camera.view.zoom, 2);
    for (const phase of ['focusing', 'turn', 'finished']) {
        f.m.phase = phase;
        for (let n = 0; n < 30; n++) f.frame();
        assert.equal(f.talus.camera.view.zoom, 1);
    }
});

test('approaching a wall tightens early; unloaded, held and paused flights do not advance zoom', () => {
    const f = scene();
    for (let n = 0; n <= 150; n++) f.at(n / 60);
    const wide = f.talus.camera.view.zoom;
    assert(wide < 1.6);
    f.talus.world.raycast = (from) => ({ x: from.x + 20, y: from.y });
    for (let n = 151; n <= 169; n++) f.at(n / 60);
    assert(f.talus.camera.view.zoom > 1.88, 'Actual nearby terrain takes priority over the expected apex');
    const before = f.calls.length;
    f.at(3, { held: true });
    f.talus.sim.paused = true;
    f.at(3.1, { held: false });
    assert.equal(f.calls.length, before);
    f.talus.sim.paused = false;
    f.game.context.state.shot = { snapshot: () => null };
    f.frame();
    assert.equal(f.calls.length, before);
});

test('MIRV child tracking retains zoom continuity without needing the shooter to remain loaded', () => {
    const f = scene();
    for (let n = 0; n <= 180; n++) f.at(n / 60);
    f.actors.clear();
    f.m.attack.ids = { 2: { launch: { x: 6600, y: 150, vy: 40 } } };
    let previous = f.talus.camera.view.zoom;
    for (let n = 0; n <= 90; n++) {
        const value = f.at(n / 60, { id: 2, x: 6600 + n * 3, y: 150 + n * 5, vy: 300 });
        assert(Math.abs(value - previous) <= .200001);
        previous = value;
    }
    assert.equal(previous, 2);
});

test('speech waits for a close view, then fires after 1.5 seconds independently of camera travel', () => {
    const f = fixture(), p = f.m.roster[0], lines = [];
    let fired = 0;
    f.talus.ui.worldText = (id, spec) => lines.push(spec);
    f.game.context.combat.performAttack = () => fired++;
    f.talus.camera.view.zoom = 1;
    f.m.phase = 'telegraph';
    f.api.queuePresentation(p, 'shooting');
    f.api.tickPresentation();
    assert.equal(lines.length, 0);
    for (let n = 0; n < 20; n++) f.emit('tick.frame', { dt: 1 / 60 });
    assert.equal(f.talus.camera.view.zoom, 2);
    f.api.tickPresentation();
    assert(lines[0].text);
    const start = f.talus.sim.clock;
    f.talus.sim.clock = start + 1.499;
    f.api.tickPresentation();
    assert.equal(fired, 0);
    f.talus.sim.clock = start + 1.5;
    f.api.tickPresentation();
    assert.equal(fired, 1);
});
