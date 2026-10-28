const { loadGame } = require('./support/runtime.cjs');
// Game placement policy over controlled cell snapshots. Real residency,
// settling and renderer output require the separate native acceptance pass.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { cameraMock } = require('./support/camera.cjs');
const root = path.resolve(__dirname, '..');
const settings = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/arena.json'), 'utf8'));
const solid = (name = 'STONE', extra = {}) => ({ state: 'solid', element: { name }, ...extra });
const rect = (x, y, w, h) => (sx, sy) => sx >= x && sx < x + w && sy >= y && sy < y + h;
function scene(sample, spawnX = 6400, count = 3) {
    const calls = [], sleeps = [], frames = [], spawns = [], records = [], state = {};
    const existing = { id: 'existing', position: { x: 6284, y: 611 }, teleport() { throw Error('Existing tank must not move'); }, setPosition() { throw Error('Existing tank must not move'); } };
    const talus = {
        editor: { available: false }, on() { }, after() { }, log(kind, detail) { records.push({ kind, ...detail }); },
        world: { cell(x, y) { calls.push({ x, y }); return sample(x, y); } },
        camera: cameraMock(() => existing, undefined, frames),
        entities: { get: () => existing, spawn: async (...args) => { spawns.push(args); return { id: 'spawned' }; } },
        sim: { clock: 0 }, sleepTicks: async (ticks) => { sleeps.push(ticks); },
        ui: { set() { } }, state: { getJson: key => state[key], setJson: (key, value) => { state[key] = value; } },
    };
    const context = { talus };
    const ctx = loadGame(context.talus, context).context;
    context.api = {
        deploymentGround: ctx.generation.deploymentGround,
        configure(a, x, count) {
            ctx.state.arena = a;
            ctx.state.match = { seed: 20261025, bounds: { ...a.bounds, x: a.combat.x, w: a.combat.w }, phase: 'deploying',
                roster: Array.from({ length: count }, (_, i) => ({ name: 'Pilot ' + i, spawnX: i === 1 ? x : a.combat.x + a.combat.spawnInset + i * (a.combat.w - a.combat.spawnInset * 2) / (count - 1), entityId: null })),
                presentation: { active: null, queue: [] }, chaos: { jobs: [] } };
            ctx.state.match.roster[1].spawnX = x;
        },
        get player() { return ctx.state.match.roster[1]; }, get match() { return ctx.state.match; }
    };
    context.api.configure(structuredClone(settings), spawnX, count);
    return { api: context.api, calls, sleeps, frames, spawns, records, existing };
}
const position = result => ({ x: result.x, y: result.y });
async function run() {
    const flat = scene((x, y) => y >= 640 ? solid() : null);
    assert.deepEqual(position(await flat.api.deploymentGround(flat.api.player)), { x: 6400, y: 640 });
    assert.deepEqual(flat.sleeps, [90], 'Native arrival precedes the authored terrain settling interval');
    assert.equal(flat.frames[0].target.point.x, 6400);
    assert.equal(flat.frames[0].options.whilePaused, false);
    const distantX = settings.combat.x + settings.combat.spawnInset;
    const distant = scene((x, y) => Math.abs(x - distant.frames.at(-1).target.point.x) <= 128 && y >= 640 ? solid() : null, distantX);
    assert.deepEqual(position(await distant.api.deploymentGround(distant.api.player)), { x: distantX, y: 640 });
    assert.equal(distant.frames[0].target.point.x, distantX, 'A spread-out spawn loads its own terrain, not the arena centre');
    for (const name of ['WOOD', 'LEAF', 'ROOTS_STEM']) {
        const canopy = scene((x, y) => y >= 640 ? solid() : rect(6200, 544, 400, 16)(x, y) ? solid(name) : null);
        assert.deepEqual(position(await canopy.api.deploymentGround(canopy.api.player)), { x: 6400, y: 640 }, name + ' canopy is not terrain support');
    }
    for (const ownership of [{ body: { id: 'loose-plank' } }, { entity: { id: 'other-tank' } }]) {
        const owned = scene((x, y) => y >= 640 ? solid() : rect(6200, 544, 400, 16)(x, y) ? solid('STONE', ownership) : null);
        assert.deepEqual(position(await owned.api.deploymentGround(owned.api.player)), { x: 6400, y: 640 }, 'A body/entity surface is not selected as ground');
    }
    const spike = scene((x, y) => y >= 640 || rect(6398, 540, 4, 100)(x, y) ? solid() : null);
    const spikePosition = position(await spike.api.deploymentGround(spike.api.player));
    assert.equal(spikePosition.y, 640);
    assert.equal(spikePosition.x, 6424, 'Search beside a narrow spike rather than balancing on it');
    const adjacent = scene((x, y) => rect(6424, 640, 48, 384)(x, y) ? solid() : null);
    const lane = position(await adjacent.api.deploymentGround(adjacent.api.player));
    assert.deepEqual(lane, { x: 6440, y: 640 });
    assert.ok(lane.x - settings.combat.tankHalfWidth >= adjacent.api.match.bounds.x);
    assert.ok(lane.x + settings.combat.tankHalfWidth <= adjacent.api.match.bounds.x + adjacent.api.match.bounds.w);
    const fallback = scene((x, y) => rect(6584, 744, 48, 280)(x, y) ? solid() : null);
    const fallbackLane = position(await fallback.api.deploymentGround(fallback.api.player));
    assert.deepEqual(fallbackLane, { x: 6600, y: 744 }, 'Search the rest of the combat frame after every preferred-lane candidate fails');
    assert.ok(Math.abs(fallbackLane.x - fallback.api.player.spawnX) > 120);
    assert.ok(fallbackLane.x - settings.combat.tankHalfWidth >= fallback.api.match.bounds.x);
    assert.ok(fallbackLane.x + settings.combat.tankHalfWidth <= fallback.api.match.bounds.x + fallback.api.match.bounds.w);
    const occupied = scene((x, y) => y >= 640 ? solid() : null);
    occupied.api.match.roster[0].entityId = 'existing';
    occupied.existing.position.x = 6400; // Its current position differs from the old spawn lane.
    const occupiedBefore = structuredClone(occupied.existing.position);
    const openLane = position(await occupied.api.deploymentGround(occupied.api.player));
    assert.deepEqual(openLane, { x: 6452, y: 640 });
    assert.ok(Math.abs(openLane.x - occupied.existing.position.x) >= settings.combat.tankHalfWidth * 2 + 12);
    assert.deepEqual(occupied.existing.position, occupiedBefore, 'Finding another tank a lane never relocates the existing tank');
    const stored = scene((x, y) => y >= 640 ? solid() : null);
    Object.assign(stored.api.match.roster[0], { entityId: 'stored', spawnX: 6400 });
    stored.existing.position = null;
    assert.deepEqual(position(await stored.api.deploymentGround(stored.api.player)), { x: 6452, y: 640 }, 'A previously spawned tank without a live position retains its reserved spawn lane');
    const foundation = scene((x, y) => y >= 1024 ? solid() : null);
    assert.deepEqual(position(await foundation.api.deploymentGround(foundation.api.player)), { x: 6400, y: 1024 }, 'The top of the protected bottom stone tile is an eligible supported surface');
    const edgeX = settings.combat.x + settings.combat.tankHalfWidth;
    const outside = scene((x, y) => x < settings.combat.x && y >= 640 ? solid() : null, edgeX);
    await assert.rejects(() => outside.api.deploymentGround(outside.api.player), /No supported open deployment position/);
    assert.ok(outside.calls.every(p => p.x >= settings.combat.x), 'Neither support nor clearance scans leave the allowed combat lane');
    const water = scene((x, y) => y >= 640 ? solid() : y >= 550 ? { state: 'liquid', element: { name: 'WATER' } } : null);
    await assert.rejects(() => water.api.deploymentGround(water.api.player), /No supported open deployment position.*seed 20261025/, 'Neither liquid nor submerged solid ground is a deployable tank position');
    const missing = scene(() => null);
    await assert.rejects(() => missing.api.deploymentGround(missing.api.player), /No supported open deployment position for Pilot 1; seed 20261025/);
    const powder = scene((x, y) => y >= 640 ? { state: 'powder', element: { name: 'SAND' } } : null);
    assert.deepEqual(position(await powder.api.deploymentGround(powder.api.player)), { x: 6400, y: 640 }, 'A sufficiently deep powder bed is supported by game policy');
    for (const [name, state] of [['ICE', 'solid'], ['SNOW', 'powder']]) {
        const cold = scene((x, y) => y >= 640 ? { state, element: { name } } : null);
        assert.deepEqual(position(await cold.api.deploymentGround(cold.api.player)), { x: 6400, y: 640 }, 'A thick ' + name + ' bed remains usable in cold biomes');
    }
    const thin = scene((x, y) => y >= 640 && y < 642 ? solid() : null);
    await assert.rejects(() => thin.api.deploymentGround(thin.api.player), /No supported open deployment position/, 'A broad but only two-pixel-thick ledge does not provide the required support depth');
    const hollow = scene((x, y) => (y >= 640 && y < 642) || (y >= 648 && y < 650) ? solid() : null);
    await assert.rejects(() => hollow.api.deploymentGround(hollow.api.player), /No supported open deployment position/, 'Separated top and bottom samples must not disguise a hollow support cavity');
    const gas = scene((x, y) => y >= 640 ? solid() : { state: 'gas', element: { name: 'SMOKE' } });
    assert.deepEqual(position(await gas.api.deploymentGround(gas.api.player)), { x: 6400, y: 640 });
    console.log('PASS: continuous terrain support, canopy/body/entity/thin/hollow rejection, preferred and broad lane search, occupied-lane spacing, foundation-top placement, combat bounds, water/empty failure, cold terrain and existing-tank reuse without respawn or relocation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
