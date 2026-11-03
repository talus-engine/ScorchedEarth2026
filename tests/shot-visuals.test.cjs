const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const config = require('../world/Game/shot-trails.json');
const settle = () => new Promise(resolve => setImmediate(resolve));
function scene() {
    const events = {}, sprays = [], strokes = [], barriers = new Map(), logs = [];
    const roster = config.palettes.slice(0, 2).map((p, i) => ({ entityId: 'tank-' + i, color: p.color }));
    const talus = {
        sim: { paused: false }, files: { readText: async () => JSON.stringify(config) },
        elements: { get: name => config.palettes.find(p => p.gas === name) ? { name } : null },
        layers: { get: name => name === config.path.layer ? { type: 'raster' } : null },
        game: { setSaveBarrier: (id, reason) => reason ? barriers.set(id, reason) : barriers.delete(id) },
        world: { spawnParticles: spec => { sprays.push(spec); return spec.count; },
            terrainWork: async spec => { strokes.push(JSON.parse(JSON.stringify(spec))); return { status: 'completed' }; } },
        on: (event, callback) => (events[event] ??= []).push(callback), log: message => logs.push(message),
    };
    const module = { exports: {} }, code = ts.transpileModule(fs.readFileSync('world/Scripts/lib/shot-visuals.ts', 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, { talus, module, exports: module.exports });
    const service = module.exports({ state: { match: { roster } } }); service.bind();
    const emit = (name, event) => (events[name] || []).forEach(f => f(event));
    function shot(id, owner = 0, beforeSnapshot = false) {
        const pos = { x: 10, y: 20, age: 0, held: false }, projectile = { snapshot: () => ({ ...pos }) };
        const snapshot = projectile.snapshot;
        if (beforeSnapshot) projectile.snapshot = () => null;
        emit('projectile.launch', { projectileId: id, projectile, ownerEntityId: roster[owner].entityId, x: pos.x, y: pos.y });
        projectile.snapshot = snapshot;
        return { pos, end: (x = pos.x, y = pos.y) => emit('projectile.end', { projectileId: id, x, y }) };
    }
    return { talus, service, shot, sprays, strokes, barriers, logs, tick: () => emit('tick.sim.post') };
}
test('actual native motion leaves owner-specific gas and a persistent path, without modifying the projectile', async () => {
    const f = scene(); await f.service.load();
    const a = f.shot(1, 0, true), b = f.shot(2, 1);
    Object.assign(a.pos, { x: 20, y: 10, age: .3 }); Object.assign(b.pos, { x: 30, y: 30, age: .3 });
    f.tick(); await settle(); f.tick(); await settle();
    assert.deepEqual(new Set(f.sprays.map(s => s.element)), new Set(config.palettes.slice(0, 2).map(p => p.gas)));
    assert.equal(f.strokes.length, 2);
    assert.deepEqual(f.strokes[0].vector.geometry.points, [{ x: 10, y: 20 }, { x: 20, y: 10 }]);
    assert.equal(f.strokes[0].vector.output.layer.name, 'Shot paths');
    assert.equal(f.strokes[0].budget.particles, 0);
    assert.ok(f.strokes[0].vector.fill.color <= 0xffffff);
    const count = f.sprays.length; f.tick(); assert.equal(f.sprays.length, count, 'A repeated snapshot emits nothing');
    Object.assign(a.pos, { x: 15, y: 15, age: .6 }); f.tick(); await settle();
    a.end(12, 18); b.end(); f.tick(); await settle();
    assert.deepEqual(f.strokes.at(-1).vector.geometry.points.at(-1), { x: 12, y: 18 });
    assert.equal(f.barriers.size, 0);
    assert.equal(f.logs.length, 0);
});
test('pause and native streaming holds emit nothing; large volleys share a finite cosmetic budget', async () => {
    const f = scene(); await f.service.load();
    const shots = Array.from({ length: 100 }, (_, i) => f.shot(i, i % 2));
    shots.forEach(s => Object.assign(s.pos, { x: 110, age: .1, held: true }));
    f.tick(); assert.equal(f.sprays.length, 0);
    shots.forEach(s => s.pos.held = false); f.talus.sim.paused = true;
    f.tick(); assert.equal(f.sprays.length, 0);
    f.talus.sim.paused = false; f.tick();
    assert.equal(f.sprays.length, config.smoke.maxPointsPerTick);
    assert.ok(f.sprays.reduce((sum, s) => sum + s.count, 0) <= config.smoke.maxPointsPerTick * config.smoke.particlesPerPoint);
});
test('long observed paths split into bounded native jobs and raster work runs one job at a time', async () => {
    const f = scene(); await f.service.load(); const a = f.shot(1);
    let release, active = 0;
    f.talus.world.terrainWork = spec => { active++; f.strokes.push(spec); return new Promise(r => release = () => { active--; r({ status: 'completed' }); }); };
    Object.assign(a.pos, { x: 1010, y: -180, age: .5 }); f.tick(); f.tick(); a.end();
    assert.equal(active, 1); assert.ok(f.barriers.size);
    for (let i = 0; i < 40 && f.barriers.size; i++) { release(); await settle(); f.tick(); }
    assert.equal(f.barriers.size, 0); assert.ok(f.strokes.length > 1);
    for (const s of f.strokes) {
        assert.ok(s.shape.w <= config.path.maxSpanPixels + 6 && s.shape.h <= config.path.maxSpanPixels + 6);
        assert.equal(s.vector.output.kind, 'raster'); assert.equal(s.budget.particles, 0);
    }
    const points = f.strokes.flatMap(s => s.vector.geometry.points);
    assert.equal(points.at(-1).x, 1010);
});
test('a refused cosmetic stroke or unavailable particle capture does not fault combat or keep its save barrier', async () => {
    const f = scene(); await f.service.load(); const a = f.shot(1);
    f.talus.world.spawnParticles = () => 0;
    f.talus.world.terrainWork = async () => ({ status: 'refused', reason: 'capture in progress' });
    Object.assign(a.pos, { x: 20, age: .3 }); f.tick(); await settle();
    assert.equal(f.barriers.size, 0); assert.equal(f.logs.length, 1);
});
test('missing cosmetic assets cannot block starting a battle', async () => {
    const f = scene(); f.talus.layers.get = () => null; f.talus.elements.get = () => null;
    await f.service.load(); const a = f.shot(1);
    Object.assign(a.pos, { x: 30, age: .4 }); f.tick(); a.end(); await settle();
    assert.equal(f.strokes.length, 0); assert.equal(f.sprays.length, 0);
    assert.equal(f.barriers.size, 0); assert.equal(f.logs.length, 1);
});
