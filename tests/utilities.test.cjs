const assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
const f = fixture('Fuel A\nFuel B', true), p = f.m.roster[0], tank = f.actors.get(p.entityId), w = f.api.bank.players['fuel a'];
const c = { enabled: true, capacity: 12, fuel: 0, held: false }, defenses = {};
let ground = null, chute = null, refuseChute = false;
let released = 0, cancelled = 0, terrain = [];
tank.controller = { get state() { return structuredClone(c); }, addFuel(n) { const add = Math.min(n, 12 - c.fuel); c.fuel += add; return { accepted: !!add, addedSeconds: add }; }, removeFuel(n) { const removed = Math.min(n, c.fuel); c.fuel -= removed; return { accepted: true, removedSeconds: removed }; }, levitate(held) { c.held = held; if (!held)
        released++; return { accepted: true }; } };
Object.assign(tank.controller, {
    configureGroundDrive(config) { ground = { config: structuredClone(config), fuel: 0, spent: 0, intent: 0 }; return { accepted: true }; },
    addGroundFuel(n) { ground.fuel += Math.min(n, ground.config.capacity - ground.fuel); return { accepted: true }; },
    removeGroundFuel(n) { ground.fuel -= Math.min(n, ground.fuel); return { accepted: true }; },
    drive(intent) { ground.intent = intent; return { accepted: true }; },
    configureFallBrake(config) { chute = { config: structuredClone(config), charges: 0, deployed: false }; return { accepted: true }; },
    chargeFallBrake(n) { chute.charges += Math.min(n, chute.config.capacity - chute.charges); return { accepted: true }; },
    removeFallBrakeCharges(n) { chute.charges -= Math.min(n, chute.charges); return { accepted: true }; },
    deployFallBrake() { if (refuseChute)
        return { accepted: false, consumed: 0 }; if (chute.deployed)
        return { accepted: true, consumed: 0 }; if (!chute.charges)
        return { accepted: false, consumed: 0 }; chute.charges--; chute.deployed = true; return { accepted: true, consumed: 1 }; },
});
Object.defineProperties(tank.controller, { groundDrive: { get: () => structuredClone(ground) }, fallBrake: { get: () => structuredClone(chute) } });
tank.defenses = { get state() { return structuredClone(defenses); }, configure(kind, spec) { defenses[kind] = { spec: structuredClone(spec), remaining: 0, active: false }; return { accepted: true }; }, charge(kind, n) { const s = defenses[kind]; s.remaining += Math.min(n, s.spec.capacity - s.remaining); return { accepted: true }; }, discharge(kind, n) { const s = defenses[kind]; s.remaining -= Math.min(n, s.remaining); if (!s.remaining)
        s.active = false; return { accepted: true }; }, activate(kind, on) { const s = defenses[kind]; if (on && !s.remaining)
        return { accepted: false }; s.active = on; return { accepted: true }; } };
f.talus.elements = { get: name => ({ id: { STONE: 9, SAND: 1, DIRT: 2, IRON: 12, LEAD: 91, STEEL: 22 }[name] }) };
f.talus.world.cancelTerrainWork = () => { cancelled++; };
f.talus.world.terrainWork = async (spec) => { terrain.push(spec); return spec.shape.x < 0 ? { status: 'refused', work: 0 } : { status: 'completed', work: 120 }; };
f.m.phase = 'ready';
assert.equal(f.api.purchase(p, 'jetpack'), true);
assert.equal(c.fuel, 6);
assert.equal(w.stock.jetpack, 6);
assert.equal(f.api.purchase(p, 'jetpack'), true);
assert.equal(c.fuel, 12);
assert.equal(w.stock.jetpack, 12);
assert.equal(f.api.purchase(p, 'jetpack'), true);
assert.equal(c.fuel, 12);
assert.equal(w.stock.jetpack, 18, 'Reserve stock is retained beyond native capacity');
c.fuel -= .25;
f.api.syncUtilities(p);
assert.equal(w.stock.jetpack, 17.75);
assert.equal(c.fuel, 12, 'Only bought reserve replenishes native consumption');
for (let i = 0; i < 10; i++)
    f.api.syncUtilities(p);
assert.equal(w.stock.jetpack, 17.75, 'No debit for idle time or re-observing the same native state');
w.stock.jetpack = 1.5;
f.api.syncUtilities(p);
assert.equal(c.fuel, 1.5, 'Older saved fuel is bounded by the installed supply balance');
c.fuel = 0;
f.api.syncUtilities(p);
assert.equal(w.stock.jetpack, 0);
assert.equal(c.fuel, 0, 'Exhausted purchases cannot regenerate');
// Native restoration/reconfiguration never counts as newly purchased energy.
w.stock.shield = 2;
w.stock.magnet = 1;
f.api.syncUtilities(p);
assert.equal(defenses.shield.remaining, 120);
assert.equal(defenses.deflector.remaining, 6);
f.m.phase = 'turn';
assert.equal(f.api.useDefense(p, 'shield'), true);
assert.equal(defenses.shield.active, true);
defenses.shield.remaining -= 40;
f.api.accountSupply(p);
assert.ok(Math.abs(w.stock.shield - 4 / 3) < 1e-9);
f.api.syncUtilities(p);
assert.equal(defenses.shield.remaining, 80, 'Absorbed damage debits shield supply once');
const cash = p.cashEarned;
f.emit('damage', { source: tank, target: tank, amount: 0, amountRequested: 40, amountAbsorbed: 40, blocked: false });
assert.equal(p.cashEarned, cash, 'Fully absorbed hits pay no hull-damage cash');
defenses.deflector.remaining -= .5;
f.api.accountSupply(p);
assert.ok(Math.abs(w.stock.magnet - 11 / 12) < 1e-9);
f.api.syncUtilities(p);
assert.equal(defenses.deflector.remaining, 5.5);
w.stock.shield = 0;
w.stock.magnet = 0;
f.api.syncUtilities(p);
assert.equal(defenses.shield.remaining, 0);
assert.equal(defenses.shield.active, false);
assert.equal(defenses.deflector.remaining, 0);
assert.equal(f.api.useDefense(p, 'shield'), false, 'Empty field cannot activate');
w.stock['fuel-tank'] = 6;
w.stock.parachute = 2;
f.api.syncUtilities(p);
assert.equal(ground.fuel, 6);
assert.equal(chute.charges, Math.min(2, chute.config.capacity));
ground.fuel -= 2;
ground.spent += 2;
f.api.syncUtilities(p);
assert.equal(w.stock['fuel-tank'], 4, 'Ground supply uses accepted native work');
for (let i = 0; i < 10; i++)
    f.api.syncUtilities(p);
assert.equal(w.stock['fuel-tank'], 4, 'Observing unchanged native work does not debit again');
ground.fuel = ground.config.capacity;
ground.spent = 0;
f.api.syncUtilities(p);
assert.equal(ground.fuel, 4, 'Older native motor state cannot mint fuel');
assert.equal(f.api.useParachute(p), true);
assert.equal(w.stock.parachute, 1);
assert.equal(f.api.useParachute(p), true);
assert.equal(w.stock.parachute, 1, 'Already-deployed chute cannot debit twice');
chute.deployed = false;
refuseChute = true;
assert.equal(f.api.useParachute(p), false);
assert.equal(w.stock.parachute, 1, 'Refused deployment retains its charge');
c.held = true;
ground.intent = 1;
f.api.input(false);
assert.equal(c.held, false);
assert.equal(ground.intent, 0);
assert.ok(released > 0, 'Turn/cancel releases thrust and motor intent');
assert.equal(cancelled, 0, 'An idle tool must not cancel unrelated native material payloads');
async function main() {
    w.stock.digger = 5;
    await f.api.dig(p, 1);
    assert.equal(terrain.length, 1);
    assert.equal(w.stock.digger, 5 - 120 / f.shop.items.find(i => i.id === 'digger').tool.workPerSecond);
    assert.equal(terrain[0].kind, 'excavate');
    assert.equal(terrain[0].actor.entity, tank);
    assert.equal(terrain[0].bounds.y + terrain[0].bounds.h, 1024, 'Solid foundation is outside author work bounds');
    const before = w.stock.digger;
    f.talus.sim.clock += 1;
    tank.position.x = -1000;
    await f.api.dig(p, -1);
    assert.equal(w.stock.digger, before, 'Refused work consumes no digger fuel');
    f.m.phase = 'finished';
    await f.api.dig(p, 1);
    assert.equal(terrain.length, 2, 'No tool work after turn/end cancellation');
    f.m.phase = 'turn';
    tank.position.x = 1000;
    f.talus.sim.clock += 1;
    let finishWork;
    f.talus.world.terrainWork = () => new Promise(resolve => { finishWork = resolve; });
    const pending = f.api.dig(p, 1), beforeCancel = w.stock.digger;
    assert.equal(typeof finishWork, 'function', 'The native excavation job is in flight');
    f.api.input(false);
    assert.equal(cancelled, 1, 'Turn cancellation cancels an active excavation');
    finishWork({ status: 'cancelled', work: 0 });
    await pending;
    assert.equal(w.stock.digger, beforeCancel, 'Cancelled work consumes no digger fuel');
    console.log('PASS: purchased fuel capacity/reserve/consumption/reconciliation, finite shield/deflector stock, native ground-work debits, parachute consumption/refusal, full absorption pays no damage cash, release/cancel, accepted-work-only excavation and foundation bounds');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
