const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/ordnance.json'), 'utf8'));
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'world/Scripts/lib/ordnance.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS }
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function scene() {
    const handlers = {}, launches = [], terrain = [], labels = [], bodies = new Map(), projectiles = new Map(), promises = [], errors = [];
    let serial = 0, nativeRefuses = false, pendingTerrain = null;
    const match = { seed: 'ordnance-check', phase: 'turn', bounds: { x: 0, y: 0, w: 4096, h: 1280 }, roster: [{ entityId: 'tank-A', eliminated: false }] };
    const actor = { isLive: true, alive: true, position: { x: 50, y: 700 }, snapshot() { return this.position; } };
    const makeBody = (at, count = 43) => {
        const body = { id: 'rigid@' + ++serial, exists: true, isLive: true, position: { ...at },
            snapshot() { return this.exists ? { ...this.position, cells: count, vx: 0, vy: 0 } : null; }, destroy() { if (!this.exists) throw Error('DESTROYED'); this.exists = false; } };
        bodies.set(body.id, body); return body;
    };
    const emit = (kind, e) => { for (const handler of handlers[kind] || []) handler(e); };
    const ctx = { state: { match, launchingChaos: false, market: { looseMatter: { states: ['solid', 'powder'] } } },
        core: { chaosSeed: text => [...text].reduce((n, c) => (n * 33 ^ c.charCodeAt(0)) >>> 0, 5381),
            clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)), entity: () => actor },
        session: { persist() {}, run: task => { const promise = task().catch(e => errors.push(e)); promises.push(promise); } },
        residency: { emissionRegionReady: () => true, releaseEmissionRegion() {} },
        combat: { materialRecipe: element => ({ material: element }) } };
    const talus = { on: (kind, fn) => (handlers[kind] ||= []).push(fn), elements: { get: name => ({ id: { IRON: 23, GOLD: 1, SILVER: 94, OBSIDIAN: 15, COPPER: 25 }[name] }) },
        ui: { worldText: (id, spec) => labels.push({ id, spec: plain(spec) }) },
        bodies: { get: id => bodies.get(id), create: async spec => makeBody({ x: spec.cells[0].x, y: spec.cells[0].y }, spec.cells.length) },
        world: { terrainWork: async spec => {
            terrain.push(plain(spec));
            if (pendingTerrain) return await pendingTerrain(spec);
            if (spec.kind === 'vector') {
                const at = spec.vector.geometry.points[0];
                const body = makeBody(at); return { status: 'completed', reason: 'ok', bodies: [body.id], added: 43 };
            }
            return { status: 'completed', reason: 'ok', added: 80 };
        } }, projectiles: { get: id => projectiles.get(id), launch: spec => {
            launches.push({ spec: plain(spec), isolated: ctx.state.launchingChaos });
            if (nativeRefuses) return null;
            const shot = { id: ++serial, exists: true, position: { x: spec.x, y: spec.y },
                detonate() { this.exists = false; emit('projectile.end', { projectileId: this.id, reason: 'detonated', ...this.position }); },
                remove() { this.exists = false; emit('projectile.end', { projectileId: this.id, reason: 'removed', ...this.position }); } };
            projectiles.set(shot.id, shot); return shot;
        } } };
    const sandbox = vm.createContext({ talus, module: { exports: {} } }); vm.runInContext(code, sandbox);
    const api = sandbox.module.exports(ctx), catalog = structuredClone(config); api.configure(catalog); api.bind();
    async function flush() { while (promises.length) await Promise.all(promises.splice(0)); }
    return { ctx, api, catalog, match, actor, launches, terrain, bodies, projectiles, labels, emit, flush, errors,
        refuse(value = true) { nativeRefuses = value; }, pending(fn) { pendingTerrain = fn; } };
}
test('normal shell impact creates one persistent mine, survives parking/save, and detonates once with original credit', async () => {
    const f = scene(); assert.equal(f.api.impact('mine', 'departed-shooter', { x: 500, y: 700 }), true);
    f.api.tick(.1); assert.equal(f.api.busy(), true); await f.flush();
    assert.equal(f.terrain[0].kind, 'vector'); assert.equal(f.terrain[0].vector.output.kind, 'body');
    const color = f.terrain[0].vector.fill.color;
    assert.equal(color, 0x448844); assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff, 'Native vector colors are packed RGB without an alpha byte');
    const placement = f.terrain[0], geometry = placement.vector.geometry, radius = Math.ceil(geometry.width / 2), region = placement.shape;
    for (const offset of placement.placement.offsets) for (const point of geometry.points) {
        assert.ok(point.x + offset.x - radius >= region.x && point.x + offset.x + radius < region.x + region.w,
            'The whole translated line width fits the native job region horizontally');
        assert.ok(point.y + offset.y - radius >= region.y && point.y + offset.y + radius < region.y + region.h,
            'The whole translated line width fits the native job region vertically');
    }
    const xs = [0, ...placement.placement.offsets.map(p => p.x)], ys = [0, ...placement.placement.offsets.map(p => p.y)];
    const chargedCells = (region.w + Math.max(...xs) - Math.min(...xs)) * (region.h + Math.max(...ys) - Math.min(...ys));
    assert.equal(chargedCells, 1519);
    assert.ok(placement.budget.cells >= chargedCells, 'The budget includes the union of every translated job region');
    assert.equal(f.api.busy(), false, 'Dormant mines never hold the turn open');
    f.match.ordnance = plain(f.match.ordnance);
    const mine = f.match.ordnance.jobs[0], body = f.bodies.get(mine.bodyId);
    body.isLive = false; f.api.tick(10); assert.equal(mine.elapsed, 0, 'A parked mine does not advance its arming clock');
    body.isLive = true; f.api.tick(1.3); assert.equal(mine.phase, 'armed'); assert.equal(f.launches.length, 0);
    f.actor.position = { ...body.position }; f.ctx.state.match.attack = { owner: 'departed-shooter', spent: false };
    f.api.tick(.1); f.api.tick(.1);
    assert.equal(f.launches.length, 1); assert.equal(f.launches[0].spec.owner, 'departed-shooter');
    assert.equal(f.launches[0].isolated, true); assert.equal(f.ctx.state.launchingChaos, false);
    assert.equal(f.ctx.state.match.attack.spent, false, 'A prior mine cannot spend the current shot');
    assert.equal(f.launches[0].spec.aoeRadius, 112); assert.equal(body.exists, false); assert.equal(f.api.busy(), false);
});
test('mine placement refusal does not leave an invisible active hazard; dormant mines clean up at match end', async () => {
    const f = scene(); f.pending(async () => ({ status: 'refused', reason: 'occupancy' }));
    f.api.impact('mine', 'tank-A', { x: 500, y: 700 }); f.api.tick(.1); await f.flush(); f.api.tick(.1);
    assert.equal(f.match.ordnance.jobs.length, 0); assert.match(f.match.message, /occupancy/); assert.equal(f.api.busy(), false);
    f.pending(null); f.api.impact('mine', 'tank-A', { x: 500, y: 700 }); f.api.tick(.1); await f.flush();
    const body = [...f.bodies.values()][0]; f.api.finish(); assert.equal(body.exists, false); assert.equal(f.match.ordnance.jobs.length, 0);
});
test('cancelled asynchronous placement removes its resulting body without adopting a stale mine', async () => {
    const f = scene(); let release;
    f.pending(() => new Promise(resolve => { release = resolve; }));
    f.api.impact('mine', 'tank-A', { x: 500, y: 700 }); f.api.tick(.1); f.api.finish();
    const body = { exists: true, destroy() { this.exists = false; } }; f.bodies.set('rigid@late', body);
    release({ status: 'completed', bodies: ['rigid@late'] }); await f.flush();
    assert.equal(body.exists, false); assert.equal(f.api.busy(), false); assert.equal(f.match.ordnance.jobs.length, 0);
});
test('airstrike uses finite isolated native flights and actual material receipts; expired carriers do not deposit', async () => {
    const f = scene(); f.api.impact('airstrike-acid', 'dead-owner', { x: 500, y: 700 });
    for (let n = 0; n < 10; n++) f.api.tick(.25);
    assert.equal(f.launches.length, 5); assert.ok(f.launches.every(x => x.isolated && x.spec.owner === 'dead-owner' && x.spec.independent));
    assert.equal(f.api.busy(), true);
    let n = 0;
    for (const shot of f.projectiles.values()) {
        f.emit('projectile.collision', { projectileId: shot.id, with: n % 2 ? 'particle' : 'terrain' });
        f.emit('projectile.end', { projectileId: shot.id, reason: n++ === 0 ? 'expired' : 'detonated', x: 500, y: 700 });
        f.emit('projectile.end', { projectileId: shot.id, reason: 'detonated', x: 500, y: 700 });
    }
    assert.equal(f.api.busy(), true, 'Pending material work remains behind the save boundary'); await f.flush(); f.api.tick(.1);
    assert.equal(f.terrain.length, 4, 'Duplicate end delivery never repeats a payload');
    assert.ok(f.terrain.every(s => s.recipe.material === 'HYDROCHLORIC_ACID' && s.replacement === 'empty'));
    assert.equal(f.api.busy(), false); assert.deepEqual(f.errors, []);
});
test('duck fuses burst actual water in midair and keep authored grid geometry and finite bounce counts', async () => {
    const f = scene(); f.api.impact('ducks', 'tank-A', { x: 500, y: 700 });
    for (let n = 0; n < 6; n++) f.api.tick(.2);
    assert.equal(f.launches.length, 6);
    for (const row of f.launches) { assert.equal(row.spec.bouncing, 5); assert.equal(row.spec.detonate.fuse, 4); assert.equal(row.spec.missileSlot.kind, 'grid'); assert.ok(row.spec.vy < 0); }
    for (const shot of f.projectiles.values()) shot.detonate();
    await f.flush(); assert.equal(f.terrain.length, 6); assert.ok(f.terrain.every(s => s.recipe.material === 'WATER')); assert.equal(f.api.busy(), false);
});
test('meteor lottery is seeded, finite, and can select one real Nuke-radius catastrophe', () => {
    const a = scene(), b = scene();
    for (const f of [a, b]) {
        f.api.impact('meteors', 'tank-A', { x: 500, y: 700 }); f.match.ordnance.rng = 1;
        for (let n = 0; n < 8; n++) f.api.tick(.3);
    }
    assert.deepEqual(a.launches, b.launches); assert.equal(a.launches.length, 8);
    assert.equal(a.launches[0].spec.aoeRadius, 280); assert.ok(a.launches.some(x => x.spec.aoeRadius === 52));
    a.api.stop(); assert.equal(a.api.busy(), false); assert.ok([...a.projectiles.values()].every(p => !p.exists));
});
test('Holy grenade stays unavailable until true 2800-radius support; accepted configuration counts 1, 3, 5 before one blast', async () => {
    const f = scene(); assert.equal(f.catalog.effects.holy.blast.aoeRadius, 2800); assert.equal(f.api.permitted('holy'), false);
    assert.equal(f.api.impact('holy', 'tank-A', { x: 500, y: 700 }), false); assert.equal(f.match.ordnance, undefined);
    f.catalog.nativeLargeBlast = true; f.api.configure(f.catalog);
    f.api.impact('holy', 'tank-A', { x: 500, y: 700 }); f.api.tick(.1); await f.flush();
    assert.equal(f.api.busy(), true); assert.equal(f.labels.at(-1).spec.text, '1');
    f.api.tick(1); assert.equal(f.labels.at(-1).spec.text, '3'); f.api.tick(1); assert.equal(f.labels.at(-1).spec.text, '5');
    assert.equal(f.launches.length, 0); f.api.tick(1);
    assert.equal(f.launches.length, 1); assert.equal(f.launches[0].spec.aoeRadius, 2800); assert.equal(f.labels.at(-1).spec, null);
    assert.equal(f.api.busy(), false); assert.deepEqual(f.errors, []);
});
test('native refusal restores nested launch suppression and keeps the unspent mine intact', async () => {
    const f = scene(); f.api.impact('mine', 'tank-A', { x: 500, y: 700 }); f.api.tick(.1); await f.flush();
    const body = [...f.bodies.values()][0]; f.actor.position = { ...body.position }; f.ctx.state.launchingChaos = true; f.refuse();
    assert.throws(() => f.api.tick(2), /launch refused/); assert.equal(f.ctx.state.launchingChaos, true); assert.equal(body.exists, true);
    assert.equal(f.match.ordnance.jobs[0].phase, 'armed'); assert.equal(f.match.ordnance.flights && Object.keys(f.match.ordnance.flights).length, 0);
});
test('pre-cast admission preserves ammunition for full mine capacity and unavailable Holy blast', () => {
    const f = scene(), mine = { behavior: { mode: 'ordnance', kind: 'mine' } };
    assert.equal(f.api.canFire(mine), true);
    for (let n = 0; n < f.catalog.maxMines; n++) assert.equal(f.api.impact('mine', 'tank-A', { x: 500, y: 700 }), true);
    assert.equal(f.api.canFire(mine), false); assert.equal(f.api.impact('mine', 'tank-A', { x: 500, y: 700 }), false);
    assert.equal(f.api.canFire({ behavior: { mode: 'ordnance', kind: 'holy' } }), false);
    assert.equal(f.api.canFire({ behavior: { mode: 'ordnance', kind: 'ducks' } }), true);
    assert.equal(f.api.canFire({ behavior: { mode: 'battery' } }), true);
});
test('native body tombstones are removed from hazard state without destroying them twice', async () => {
    const f = scene(); f.api.impact('mine', 'tank-A', { x: 500, y: 700 }); f.api.tick(.1); await f.flush();
    const body = [...f.bodies.values()][0]; body.destroy(); f.api.tick(.1); f.api.finish();
    assert.equal(f.match.ordnance.jobs.length, 0); assert.equal(f.launches.length, 0); assert.equal(f.api.busy(), false);
});
