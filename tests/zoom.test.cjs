const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture } = require('./support/game.cjs');

// camera.ts: wide to close takes a quarter second (zoomRate 4), the wall probe
// starts 8 px ahead of the shell, counts a wall after two probes in a row and
// holds it a quarter second after the last probe that saw it.
const MAX_STEP = 4 / 60 + 1e-9;

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
    return { ...f, calls, at, frame, current: () => snapshot };
}

/** A raycast mock that knows which probe it serves: the first segment of a probe
 *  starts within the guard distance of the shell. `decide(probe, from)` answers. */
function probeMock(f, decide) {
    let probe = 0;
    return (from, to) => {
        const s = f.current();
        if (Math.hypot(from.x - s.x, from.y - s.y) < 9) probe++;
        return decide(probe, from, to);
    };
}

/** A vertical wall at world x = X: where the probe segment crosses it, else null.
 *  A real wall stays put, so the shell's time to it only shrinks between probes. */
const wallAt = X => (from, to) => from.x <= X && X <= to.x
    ? { x: X, y: from.y + (to.y - from.y) * (X - from.x) / (to.x - from.x) } : null;

/** Frame-to-frame direction changes of a zoom series (zero steps ignored). */
function reversals(samples) {
    let count = 0, sign = 0;
    for (let n = 1; n < samples.length; n++) {
        const d = Math.sign(samples[n] - samples[n - 1]);
        if (d === 0) continue;
        if (sign !== 0 && d !== sign) count++;
        sign = d;
    }
    return count;
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
    for (let n = 1; n <= 360; n++) assert(Math.abs(samples[n] - samples[n - 1]) <= MAX_STEP, 'zoom moves at most zoomRate per second');
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
    // A wall 150 px ahead comes into the probe's 0.75 s horizon at frame 156; the
    // next probe (frame 162) confirms it, then the view tightens as the shell nears
    // it, at most a quarter second wide-to-close.  (The shell reaches it at frame 195.)
    f.talus.world.raycast = wallAt(6650);
    for (let n = 151; n <= 161; n++) f.at(n / 60);
    assert(f.talus.camera.view.zoom <= wide, 'one probe alone does not tighten');
    let previous = f.talus.camera.view.zoom;
    for (let n = 162; n <= 190; n++) {
        const zoom = f.at(n / 60);
        assert(zoom >= previous && zoom - previous <= MAX_STEP, 'tightens monotonically at the zoom rate');
        previous = zoom;
    }
    assert(f.talus.camera.view.zoom > 1.88, 'Actual nearby terrain takes priority over the expected apex');
    const before = f.calls.length;
    f.at(3.5, { held: true });
    f.talus.sim.paused = true;
    f.at(3.6, { held: false });
    assert.equal(f.calls.length, before);
    f.talus.sim.paused = false;
    f.game.context.state.shot = { snapshot: () => null };
    f.frame();
    assert.equal(f.calls.length, before);
});

test('a probe hitting the shell itself, or flickering, never swings the zoom at the apex', () => {
    const baseline = scene(), clean = [];
    for (let n = 0; n <= 360; n++) clean.push(baseline.at(n / 60));
    assert.equal(reversals(clean), 1, 'wide at the apex, close on both sides: one turn');

    // The shell's own body: a hit on the cell the probe would start from.
    const self = scene(), own = [];
    self.talus.world.raycast = () => { const s = self.current(); return { x: s.x + 2, y: s.y }; };
    for (let n = 0; n <= 360; n++) own.push(self.at(n / 60));
    assert.deepEqual(own, clean, 'a hit inside the guard distance is not a wall');

    // A wall at the apex (x 6600, reached at frame 180) that the probe sees on every
    // other pass only: never two in a row, so never a wall.
    const flicker = scene(), seen = [], wall = wallAt(6600);
    flicker.talus.world.raycast = probeMock(flicker, (probe, from, to) => probe % 2 === 0 ? wall(from, to) : null);
    for (let n = 0; n <= 360; n++) seen.push(flicker.at(n / 60));
    assert.deepEqual(seen, clean, 'a hit that comes and goes is not a wall');

    // The same wall, seen steadily except for one probe: held, not dropped and re-found.
    const hold = scene(), held = [], hitsBeforeGap = new Set();
    let gapProbeRan = false;
    hold.talus.world.raycast = probeMock(hold, (probe, from, to) => {
        if (probe === 27) { gapProbeRan = true; return null; }
        const cell = probe >= 23 ? wall(from, to) : null;
        if (cell && probe < 27) hitsBeforeGap.add(probe);
        return cell;
    });
    for (let n = 0; n <= 175; n++) held.push(hold.at(n / 60));
    assert(gapProbeRan && hitsBeforeGap.size >= 2, 'the wall was confirmed before the gap probe');
    // The ascent is still widening when the wall is confirmed (~frame 149); from there
    // one unbroken climb runs through the gap probe (~frame 168) to the apex.
    const climbFrom = held.lastIndexOf(Math.min(...held));
    assert(climbFrom > 130 && climbFrom < 160, 'the wall is confirmed during the ascent, before the gap (frame ' + climbFrom + ')');
    assert.equal(reversals(held.slice(climbFrom)), 0, 'one climb toward the wall: no release and re-find');
    assert(held[175] > 1.8, 'the wall is still in view at the apex');
    for (let n = 1; n <= 175; n++) assert(Math.abs(held[n] - held[n - 1]) <= MAX_STEP);
});

test('MIRV child tracking retains zoom continuity without needing the shooter to remain loaded', () => {
    const f = scene();
    for (let n = 0; n <= 180; n++) f.at(n / 60);
    f.actors.clear();
    f.m.attack.ids = { 2: { launch: { x: 6600, y: 150, vy: 40 } } };
    let previous = f.talus.camera.view.zoom;
    for (let n = 0; n <= 90; n++) {
        const value = f.at(n / 60, { id: 2, x: 6600 + n * 3, y: 150 + n * 5, vy: 300 });
        assert(Math.abs(value - previous) <= MAX_STEP);
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
