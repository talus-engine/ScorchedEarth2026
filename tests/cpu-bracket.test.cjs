/** CPUs zero in on a target by bracketing; skill sets how quickly. No randomness is involved. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));

/** Fire repeated planned shots at a fixed target; the world adds `residual` px of unexplained range. */
async function engage(skill, residual = 37, range = 2400, maxShots = 12, untilDirect = false) {
    const f = fixture(), p = f.m.roster[0], tank = f.actors.get(p.entityId), enemy = f.actors.get(f.m.roster[1].entityId);
    f.api.setPersonas(personas);
    f.m.roster.forEach(r => r.cpuSkill = skill);
    f.m.turnNumber = 3;
    f.talus.world.wind = 0;
    f.talus.world.raycast = () => null;
    f.talus.world.groundY = () => null;
    enemy.position = { x: tank.position.x + range, y: tank.position.y };
    // Report the work a real survey spends so small (rookie) budgets are exhausted as in play.
    tank.weapon.plan = async r => ({ status: 'clear', reason: 'clear', warnings: [], candidates: [], obstruction: null, work: { candidates: r.maxCandidates ?? 1 },
        solution: { angle: r.fixedAngle ?? -.9, power: .6, end: { ...r.target } } });
    const misses = [], tactics = [];
    for (let shot = 0; shot < maxShots; shot++) {
        assert.equal(await f.api.planCpuShot(p, f.m.turnNumber), true);
        const s = p.fireSolution, impact = { x: s.point.x + residual, y: enemy.position.y }, dx = impact.x - enemy.position.x;
        misses.push(Math.round(dx));
        tactics.push(p.tactic);
        const hit = Math.abs(dx) <= 20;
        f.api.observeCpuShot(p, { turn: f.m.turnNumber, targetId: enemy.id, weapon: s.weapon, origin: { ...tank.position },
            target: { ...enemy.position }, targetAtLaunch: { ...enemy.position }, impact, reason: 'detonated', collision: hit ? 'body' : 'terrain',
            dx, dy: 0, angle: s.angle, power: s.power, hit, direct: Math.abs(dx) <= 8, split: false, solution: s, wind: 0 });
        f.m.turnNumber += 2;
        if (untilDirect ? Math.abs(dx) <= 8 : hit) break;
    }
    return { misses, tactics, rng: p.aiRng };
}

test('every skill brackets: short, long, then halving onto the target', async () => {
    for (const skill of ['rookie', 'easy', 'regular', 'hard', 'expert']) {
        const { misses, tactics, rng } = await engage(skill);
        assert.ok(Math.abs(misses.at(-1)) <= 20, `${skill} reaches the target: ${misses}`);
        assert.equal(rng, undefined, 'No random skill noise');
        if (misses.length > 2) {
            assert.ok(misses[0] < 0 && misses[1] > 0, `${skill} opens short then long: ${misses}`);
            // Once bracketed, each correction is half the previous one.
            for (let i = 3; i < misses.length; i++)
                assert.ok(Math.abs(Math.abs(misses[i] - misses[i - 1]) - Math.abs(misses[i - 1] - misses[i - 2]) / 2) <= 1, `${skill} keeps halving: ${misses}`);
            assert.equal(tactics[0], 'Ranging shot: opening short');
            assert.ok(tactics.includes('Halving the bracket'), tactics.join(' / '));
        }
    }
});

test('skill sets how many shots it takes to zero in', async () => {
    const shots = {};
    for (const skill of ['rookie', 'easy', 'regular', 'hard', 'expert'])
        shots[skill] = (await engage(skill)).misses.length;
    assert.ok(shots.expert <= 4, JSON.stringify(shots));
    assert.ok(shots.rookie >= 5, JSON.stringify(shots));
    assert.ok(shots.expert <= shots.hard && shots.hard <= shots.regular && shots.regular <= shots.easy && shots.easy <= shots.rookie, JSON.stringify(shots));
});

test('a miss on the unexpected side widens the search instead of stalling', async () => {
    // A large residual puts the true range beyond the opening bracket.
    const { misses } = await engage('expert', 400);
    assert.ok(Math.abs(misses.at(-1)) <= 20, String(misses));
    assert.ok(misses.length <= 8, String(misses));
});

test('a near hit narrows the bracket instead of pinning the search (no oscillation)', async () => {
    // Expert, 800 px, the world 37 px short: the second shot is a near hit that still lands short.
    const { misses, tactics } = await engage('expert', -37, 800, 10, true);
    assert.ok(Math.abs(misses[1]) <= 20 && misses[1] < 0, `near hit short: ${misses}`);
    assert.ok(Math.abs(misses.at(-1)) <= 8, `reaches a direct hit: ${misses}`);
    assert.ok(misses.length <= 6, `without oscillating: ${misses}`);
    assert.ok(misses.slice(2).every(m => Math.abs(m) <= 80), `the search never runs away: ${misses}`);
    assert.ok(tactics.includes('Halving the bracket'), tactics.join(' / '));
});

test('a proven direct hit is retried after one contrary shot', async () => {
    const f = fixture(), p = f.m.roster[0], tank = f.actors.get(p.entityId), enemy = f.actors.get(f.m.roster[1].entityId);
    f.api.setPersonas(personas);
    f.m.roster.forEach(r => r.cpuSkill = 'regular');
    f.talus.world.wind = 0;
    f.talus.world.raycast = () => null;
    f.talus.world.groundY = () => null;
    enemy.position = { x: tank.position.x + 1200, y: tank.position.y };
    const observe = (offsetX, dx) => f.api.observeCpuShot(p, { turn: f.m.turnNumber, targetId: enemy.id, weapon: 'standard',
        origin: { ...tank.position }, target: { ...enemy.position }, targetAtLaunch: { ...enemy.position },
        impact: { x: enemy.position.x + dx, y: enemy.position.y }, reason: 'detonated', collision: 'terrain', dx, dy: 0,
        angle: -.9, power: .6, hit: Math.abs(dx) <= 20, direct: Math.abs(dx) <= 8, split: false,
        solution: { kind: 'tank', offsetX, bracket: { width: 216 } }, wind: 0 });
    observe(14, 2);
    observe(14, 60);
    const memory = f.api.fireControl(p, enemy.id, 'standard');
    assert.equal(memory.offsetX, 14, 'Back to the proven offset');
    assert.deepEqual([memory.bracket.short, memory.bracket.long], [14, 14]);
});

test('a ranging point the survey refuses moves to the other side instead of firing the exact shot', async () => {
    const f = fixture(), p = f.m.roster[0], tank = f.actors.get(p.entityId), enemy = f.actors.get(f.m.roster[1].entityId);
    f.api.setPersonas(personas);
    f.m.roster.forEach(r => r.cpuSkill = 'rookie');
    f.talus.world.wind = 0;
    enemy.position = { x: tank.position.x + 2400, y: tank.position.y };
    const requests = [];
    // A ridge short of the target blocks every fixed-angle shot that lands before it.
    tank.weapon.plan = async r => {
        requests.push(structuredClone(r));
        const blocked = r.fixedAngle !== undefined && r.target.x < enemy.position.x;
        return blocked
            ? { status: 'refused', reason: 'obstructed', solution: null, candidates: [], obstruction: { kind: 'terrain', x: r.target.x, y: r.target.y, time: 2 }, warnings: [], work: { candidates: 1 } }
            : { status: 'clear', reason: 'clear', warnings: [], candidates: [], obstruction: null, work: { candidates: 1 }, solution: { angle: r.fixedAngle ?? -.9, power: .6, end: { ...r.target } } };
    };
    assert.equal(await f.api.planCpuShot(p, f.m.turnNumber), true);
    assert.ok(p.fireSolution.offsetX > 0, 'Opening goes long when short is blocked: ' + p.fireSolution.offsetX);
    assert.equal(p.tactic, 'Ranging shot: opening long');
    assert.ok(requests.some(r => r.fixedAngle !== undefined && r.target.x < enemy.position.x), 'Short side was tried first');
});
