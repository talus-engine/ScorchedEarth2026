const fs = require('node:fs'), path = require('node:path');
const { cameraMock } = require('./camera.cjs');
const root = path.resolve(__dirname, '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const catalog = read('world/Game/shop.json'), arena = read('world/Game/arena.json');
const { loadGame } = require('./runtime.cjs');
function fixture(namesText = 'Alpha\nBravo', native = false, computers = 2) {
    const shop = structuredClone(catalog);
    if (native)
        for (const i of shop.items)
            i.enabled = true;
    else
        for (const i of shop.items)
            if (['jetpack', 'digger', 'magnet', 'shield', 'parachute', 'fuel-tank'].includes(i.id))
                i.enabled = false;
    const handlers = {}, values = {}, installed = {}, actors = new Map(), ui = {}, barriers = new Map();
    const talus = { editor: { available: false }, world: { seed: 17, id: 'economic-world', generation: { status: () => ({ recipeId: 'wfc' }) }, cancelTerrainWork() { } }, sim: { clock: 1, anchor: () => ({ active: true, chunks: [{ x: 0, y: 0 }], loaded: 1, particles: 'simulated', refused: null, update() { }, release() { this.active = false; } }) }, elements: { get: name => ({ id: { DIRT: 8, SAND: 3, STONE: 9 }[name] }) }, sleepTicks: async () => { }, log() { }, after() { },
        game: { setSaveBarrier: (id, reason) => reason === null ? barriers.delete(id) : barriers.set(id, reason), get saveStatus() { return { allowed: barriers.size === 0 }; } },
        on: (k, f) => (handlers[k] ??= []).push(f), state: { getJson: k => values[k], setJson: (k, v) => values[k] = structuredClone(v) },
        installed: { get: k => installed[k], set: (k, v) => installed[k] = structuredClone(v) },
        players: { list: () => [] }, entities: { get: id => actors.get(id) }, camera: cameraMock(id => actors.get(id)),
        ui: { set: (k, v) => typeof k === 'string' ? ui[k] = v : Object.assign(ui, k), floatText() { }, openMenu() { }, closeMenu() { } } };
    talus.world.raycast = () => null;
    const game = loadGame(talus), state = game.context.state, api = game.api;
    api.configure = (a, s, q, c) => Object.assign(state, { arena: a, market: s, quipCatalog: q, chaosCatalog: c });
    api.load = m => { state.match = m; api.ensureWallets(); state.booted = true; };
    api.setSupplies = v => { state.supplyCatalog = v; };
    api.setPersonas = v => { state.personaCatalog = v; };
    api.prepareReload = () => { api.persist(); state.booted = false; state.booting = false; };
    api.testCpuHooks = (advance, retry) => { if (advance)
        game.context.turns.beginTurn = advance; if (retry)
        game.context.cpu.prepareCpuTurn = retry; };
    api.configure(arena, shop, read('world/Game/quips.json'), read('world/Game/chaos.json'));
    const m = api.validate({ humans: 0, computers, turnSeconds: 5, namesText });
    api.load(m);
    m.phase = 'turn';
    for (const p of m.roster) {
        p.entityId = 'tank-' + p.index;
        const bb = new Map(), ammo = {};
        actors.set(p.entityId, {
            id: p.entityId, _liveId: p.index + 1, get liveId() { return this.isLive || this.isFrozen ? this._liveId : null; }, set liveId(value) { this._liveId = value; }, residency: 'live', get isLive() { return this.residency === 'live'; }, set isLive(value) { this.residency = value ? 'live' : 'stored'; }, get isFrozen() { return this.residency === 'frozen'; },
            get exists() { return !['destroyed', 'unresolved'].includes(this.residency); }, set exists(value) { if (!value)
                this.residency = 'destroyed';
            else if (!this.exists)
                this.residency = 'live'; },
            can(verb) { if (!this.exists)
                return false; if (['setVelocity', 'applyImpulse', 'applyForce', 'controller', 'defenses'].includes(verb))
                return this.isLive; if (['fireHook', 'runGraph', 'weapon'].includes(verb))
                return this.isLive || this.isFrozen; if (['read', 'teleport', 'damage', 'heal', 'kill', 'despawn', 'setTemplate', 'blackboard.set', 'keepLiveOffscreen'].includes(verb))
                return true; throw Error('Unknown native verb ' + verb); },
            alive: true, controller: { state: null, holdPose(seconds) { return { accepted: true, reason: 'ok', seconds }; } }, defenses: { state: {} }, _position: { x: p.spawnX, y: 650 }, get position() { return this.exists ? this._position : null; }, set position(value) { this._position = value; }, x: p.spawnX, health: 100, maxHealth: 100,
            blackboard: { get: k => bb.get(k), set: (k, v) => bb.set(k, v) },
            weapon: { setAmmo: (k, v) => ammo[k] = v, equip: id => true, aim: () => true, state: { ammo } },
            snapshot() { return this.exists ? { id: this.id, liveId: this.isLive || this.isFrozen ? this.liveId ?? null : null, residency: this.residency, x: this.position.x, y: this.position.y, vx: 0, vy: 0, angle: 0, health: this.health, alive: this.alive } : null; },
            heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); return this.health; }
        });
    }
    return { api, game, m, actors, installed, ui, talus, shop, barriers, emit: (k, e) => { for (const f of handlers[k] || [])
            f(e); } };
}
module.exports = { fixture };
