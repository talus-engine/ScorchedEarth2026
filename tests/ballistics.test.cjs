/** Live-drag correction of native ballistic forecasts (world/Scripts/lib/ballistics.ts). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { fixture } = require('./support/game.cjs');
const source = fs.readFileSync('world/Scripts/lib/ballistics.ts', 'utf8');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: moduleObject, exports: moduleObject.exports });
const b = moduleObject.exports;

const G = 650, spec = { speed: 1800, speedAtMinPower: 100 };
const powerOf = speed => (speed - spec.speedAtMinPower) / (spec.speed - spec.speedAtMinPower);
/** A drag-free native-style forecast: exact parabola from the muzzle to `x`. */
function forecast(elevationDeg, speed, x, origin = { x: 0, y: 0 }) {
    const a = x >= origin.x ? -elevationDeg * Math.PI / 180 : -(180 - elevationDeg) * Math.PI / 180;
    const vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
    const time = (x - origin.x) / vx;
    return { angle: a, power: powerOf(speed), speed, origin, velocity: { x: vx, y: vy }, time,
        end: { x, y: origin.y + vy * time + G * time * time / 2 } };
}

test('the drag-free flight model agrees with the native parabola', () => {
    const s = forecast(45, 1200, 1500);
    assert.ok(Math.abs(b.impliedGravity(s) - G) < 1e-9);
    const h = b.heightAt({ x: 0, y: 0, vx: s.velocity.x, vy: s.velocity.y }, G, 0, 0, 1500);
    assert.ok(Math.abs(h - s.end.y) < .01, 'Exact stepping reproduces the parabola');
});

test('correction keeps the angle and adds exactly the power live drag removes', () => {
    for (const [elevation, speed, x] of [[45, 1100, 1800], [72, 1700, 2600], [30, 900, 1200]]) {
        const s = forecast(elevation, speed, x), drag = .015;
        const aim = b.compensate(s, s.end, s.end, spec, 0, drag);
        assert.ok(aim && aim.power > s.power && aim.power <= 1, `${elevation}°: more power`);
        assert.ok(Math.abs(Math.atan2(aim.launch.vy, aim.launch.vx) - s.angle) < 1e-9, 'Validated angle unchanged');
        const free = b.heightAt({ x: 0, y: 0, vx: s.velocity.x, vy: s.velocity.y }, G, 0, 0, x);
        const live = b.heightAt(aim.launch, G, 0, drag, x);
        assert.ok(Math.abs(live - free) < .5, `${elevation}°: drag flight crosses the target where the forecast did`);
    }
    const s = forecast(45, 1100, 1800);
    assert.ok(Math.abs(b.compensate(s, s.end, s.end, spec, 0, 0).power - s.power) < 1e-4, 'No drag, no change');
});

test('an edge-of-reach forecast needs a flatter arc; corrections land on any target column', () => {
    const s = forecast(72.5, 1783, 2850);
    assert.equal(b.compensate(s, s.end, s.end, spec, 0, .015), null);
    assert.equal(b.compensate(s, s.end, s.end, spec, 0, .015, true).power, 1, 'Capped correction uses full power');
    // A forecast solved for a different point (here beyond the target) corrects onto the real target.
    const shift = 120, extended = forecast(60, 1700, 2850 + shift), target = { x: 2850, y: extended.origin.y };
    target.y = b.heightAt({ x: 0, y: 0, vx: extended.velocity.x, vy: extended.velocity.y }, G, 0, 0, 2850);
    const aim = b.compensate(extended, extended.end, target, spec, 0, .015);
    assert.ok(aim, 'extended forecast corrects onto the target');
    assert.ok(Math.abs(b.heightAt(aim.launch, G, 0, .015, 2850) - target.y) < 1);
});

test('drag fitted from an observed flight recovers the true coefficient', () => {
    const s = forecast(70, 1600, 2200), launch = { x: 0, y: 0, vx: s.velocity.x, vy: s.velocity.y };
    for (const drag of [0, .012, .03]) {
        const impact = { x: 2000, y: b.heightAt(launch, G, 0, drag, 2000) };
        assert.ok(Math.abs(b.fitDrag(launch, G, 0, impact) - drag) < 1e-4, String(drag));
    }
    assert.equal(b.fitDrag(launch, G, 0, { x: 2000, y: -5000 }), null, 'Impossible impacts are refused');
});

test('calibration starts at the measured default and follows observed flights', () => {
    assert.equal(b.calibratedDrag([]), b.DEFAULT_DRAG);
    assert.ok(Math.abs(b.calibratedDrag([.03, .03]) - (b.DEFAULT_DRAG * 2 + .06) / 4) < 1e-12);
    assert.equal(b.calibratedDrag([1, 1, 1, 1, 1, 1]), .1, 'Clamped');
    assert.ok(b.calibratedDrag(Array(12).fill(.002)) < .005, 'A dozen flights outweigh the default');
});

test('incomplete forecasts and fixed-speed casts are left unchanged', () => {
    assert.equal(b.compensate({ angle: -1, power: .5 }, { x: 1, y: 1 }, { x: 1, y: 1 }, spec, 0, .015), null);
    assert.equal(b.correctable({ speed: 900, speedAtMinPower: 900 }), false);
    const s = forecast(45, 900, 900);
    assert.equal(b.compensate(s, s.end, s.end, { speed: 900, speedAtMinPower: 900 }, 0, .015), null);
});

test('CPU survey corrects power, re-surveys for headroom and calibrates from its impact', async () => {
    const f = fixture(), p = f.m.roster[0], tank = f.actors.get(p.entityId), victim = f.actors.get(f.m.roster[1].entityId);
    const exact = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
    exact.personas.forEach(persona => persona.strategy.bracket = 0);
    f.api.setPersonas(exact);
    const requests = [], responses = [];
    tank.weapon.state.equipped = null;
    tank.weapon.equip = template => { tank.weapon.state.equipped = template; return true; };
    // The native survey solves the steepest drag-free arc that reaches; far points need full power.
    tank.weapon.plan = async request => {
        requests.push(structuredClone(request));
        const origin = { x: tank.position.x + 30, y: tank.position.y - 20 }, dx = request.target.x - origin.x, dy = request.target.y - origin.y;
        // Speed for an elevation to cross the target point in a drag-free parabola.
        const needed = elevation => { const r = elevation * Math.PI / 180, c = Math.cos(r);
            return Math.sqrt(G * dx * dx / (2 * c * c * (Math.abs(dx) * Math.tan(r) + dy))); };
        let elevation = null;
        if (request.fixedAngle !== undefined) elevation = Math.abs(Math.atan2(-Math.sin(request.fixedAngle), Math.abs(Math.cos(request.fixedAngle)))) * 180 / Math.PI;
        else for (let e = Math.min(85, request.maxElevation ?? 85); e >= (request.minElevation ?? 5); e -= .5) if (needed(e) <= 1800) { elevation = e; break; }
        const speed = elevation === null ? Infinity : needed(elevation);
        if (!(speed <= 1800)) return { status: 'refused', reason: 'unreachable', solution: null, candidates: [], obstruction: null, warnings: [], work: { candidates: 1 } };
        const a = dx >= 0 ? -elevation * Math.PI / 180 : -(180 - elevation) * Math.PI / 180;
        const vx = Math.cos(a) * speed, vy = Math.sin(a) * speed, time = dx / vx;
        return responses[responses.push({ status: 'clear', reason: 'clear', warnings: ['evolving-air-fields-not-predicted'], candidates: [], obstruction: null, work: { candidates: 1 },
            solution: { angle: a, power: powerOf(speed), speed, origin, velocity: { x: vx, y: vy }, time,
                end: { x: request.target.x, y: origin.y + vy * time + G * time * time / 2 }, path: [], coverage: 'impact', childImpacts: 'not-planned' } }) - 1];
    };
    victim.position = { x: tank.position.x + 2300, y: tank.position.y };
    assert.equal(await f.api.planCpuShot(p, f.m.turnNumber), true);
    const solution = p.fireSolution, plan = tank.blackboard.get('custom.aimPlan');
    assert.ok(responses[0].solution.power > .97, 'First native arc is solved at the edge of reach');
    const last = requests.at(-1);
    assert.equal(last.target.x, requests[0].target.x, 'Headroom search keeps the real target');
    assert.ok(last.maxElevation < -responses[0].solution.angle * 180 / Math.PI, 'and asks for a flatter arc');
    assert.equal(plan.solution.angle, responses.at(-1).solution.angle, 'The flatter arc is the one fired');
    assert.ok(solution.power < 1 && solution.power > responses.at(-1).solution.power - .2);
    assert.equal(tank.blackboard.get('custom.aimPower'), solution.power);
    const live = b.heightAt(solution.flight.launch, solution.flight.gravity, 0, b.DEFAULT_DRAG, requests[0].target.x);
    assert.ok(Math.abs(live - requests[0].target.y) < 1, 'Corrected flight crosses the real target under live drag');
    assert.equal(solution.point.x - solution.target.x, solution.offsetX, 'Learned offset excludes the drag correction');
    const flight = solution.flight;
    const impact = { x: victim.position.x, y: b.heightAt(flight.launch, flight.gravity, 0, .024, victim.position.x) };
    f.api.observeCpuShot(p, { turn: f.m.turnNumber, targetId: victim.id, weapon: solution.weapon, origin: tank.position,
        target: victim.position, targetAtLaunch: victim.position, impact, reason: 'detonated', collision: 'terrain',
        dx: impact.x - victim.position.x, dy: impact.y - victim.position.y, hit: false, direct: false, split: false, solution, wind: 0 });
    assert.ok(Math.abs(f.m.flightCalibration.samples[0] - .024) < 1e-3, 'Observed flight calibrates live drag');
    assert.ok(f.api.liveDrag() > b.DEFAULT_DRAG, 'Calibration moves toward the observed drag');
});
