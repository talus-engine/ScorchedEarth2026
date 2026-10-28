/** Game aim estimates; native cutting, contacts and payload flight are tested in Talus. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync('world/Scripts/lib/special-weapons.ts', 'utf8');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: moduleObject, exports: moduleObject.exports });
const { supported, candidate, flightReach } = moduleObject.exports;
const arena = require('../world/Game/arena.json');
const origin = { x: 6100, y: 650 }, target = { x: 6500, y: 680 };
const cutter = { id: 'digger-shell', enabled: true, kind: 'weapon', projectile: {
    kind: 'rigid-body', speed: 220, speedAtMinPower: 220, lifetime: 6, gravityScale: 0,
    spawnOffset: 36, aoeRadius: 70, excavation: {
        radius: 6, distance: 640, noise: { width: 5 }, materials: [{ element: 9, hardness: 3 }],
    },
} };
const context = { arena, targetId: 'enemy' };

test('special estimates preserve direction and distinguish themselves from forecasts', () => {
    assert.equal(supported(cutter), true);
    const right = candidate(cutter, origin, target, context);
    assert.equal(right.power, 1);
    assert.equal(right.angle, Math.atan2(30, 400));
    assert.match(right.reason, /Exploratory/);
    assert.equal(right.repeated, false);
    const left = candidate(cutter, target, origin, context);
    assert.equal(left.angle, Math.atan2(-30, -400));
    assert.equal('solution' in right, false, 'A straight-line guess is never a native clear-corridor receipt');
});

test('finite reach, foundation margin, protected bodies and known uncuttable materials refuse', () => {
    assert.equal(candidate(cutter, origin, { x: 7000, y: 650 }, context), null);
    assert.equal(candidate(cutter, origin, { x: 6500, y: 1018 }, context), null);
    assert.equal(candidate(cutter, origin, { x: 6160, y: 650 }, context), null, 'Do not aim splash inside the muzzle safety margin');
    assert.equal(candidate(cutter, origin, target, { ...context, obstruction: { body: {}, element: { id: 9 } } }), null);
    assert.equal(candidate(cutter, origin, target, { ...context, obstruction: { element: { id: 23 } } }), null);
    assert.ok(candidate(cutter, origin, target, { ...context, obstruction: { element: { id: 9 } } }));
    assert.ok(candidate(cutter, origin, target, { ...context, obstruction: { entity: { id: 'enemy' }, body: {} } }));
    assert.equal(candidate(cutter, { x: NaN, y: 650 }, target, context), null);
});

test('confirmed direct hits retain angle and power; misses do not invent learned certainty', () => {
    const best = { angle: -.14, power: .85, direct: true };
    const shot = candidate(cutter, origin, target, { ...context, best });
    assert.equal(shot.angle, best.angle);
    assert.equal(shot.power, best.power);
    assert.equal(shot.repeated, true);
    assert.equal(shot.guidance, null, 'A measured unguided hit stays explicitly unguided');
    assert.match(shot.reason, /Repeat measured direct hit/);
    const miss = candidate(cutter, origin, target, { ...context, best: { ...best, direct: false } });
    assert.equal(miss.repeated, false);
    assert.equal(miss.angle, Math.atan2(30, 400));
    assert.equal(Object.hasOwn(miss, 'guidance'), false);
    assert.equal(candidate(cutter, origin, target, { ...context, best: { ...best, guidance: 'heat-guidance' } }).guidance, 'heat-guidance');
});

test('native payload reach is finite and shifted arenas keep the same foundation', () => {
    const carrier = { ...cutter.projectile, speed: 200, lifetime: 8, detonate: { fuse: .8 },
        triggerChild: [{ ...cutter.projectile, speed: 160, lifetime: 2, excavation: { distance: 260 } }] };
    assert.equal(flightReach(carrier), 420, 'Fuse travels 160px; child cuts at most 260px');
    const shifted = structuredClone(arena);
    const offset = 16384;
    shifted.bounds.x += offset;
    assert.ok(candidate(cutter, { ...origin, x: origin.x + offset }, { ...target, x: target.x + offset }, { ...context, arena: shifted }));
    assert.equal(candidate(cutter, origin, target, { ...context, arena: shifted }), null);
});

test('only configured cutting particles and finite straight excavators use this policy', () => {
    const laser = { id: 'laser', enabled: true, kind: 'weapon', projectile: {
        kind: 'particle', caImpact: true, speed: 600, speedAtMinPower: 600,
        gravityScale: 0, lifetime: 2, spawnOffset: 40,
    } };
    assert.ok(candidate(laser, origin, target, context));
    assert.equal(flightReach(laser.projectile), 1200);
    assert.equal(supported({ ...laser, id: 'flamethrower' }), false);
    assert.equal(supported({ ...cutter, enabled: false }), false);
    assert.equal(supported({ ...cutter, projectile: { ...cutter.projectile, gravityScale: 1 } }), false);
    assert.equal(supported({ ...cutter, projectile: { ...cutter.projectile, homing: 2 } }), false);
    assert.equal(supported({ ...cutter, projectile: { ...cutter.projectile, lifetime: 0 } }), false);
});
