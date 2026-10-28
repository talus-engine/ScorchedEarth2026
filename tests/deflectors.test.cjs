const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
function scene() {
    const f = fixture('Reflect A\nReflect B'), p = f.m.roster[0], e = f.actors.get(p.entityId);
    p.control = 'human';
    f.shop.items.find(i => i.id === 'magnet').enabled = true;
    const wallet = f.api.wallet(p), native = {}, calls = [];
    Object.assign(wallet.stock, { magnet: 2, 'super-mag': 2 });
    let rejectConfigure = false, rejectActivate = false;
    e.defenses = {
        get state() { return structuredClone(native); },
        configure(kind, spec) {
            calls.push(['configure', kind]);
            if (rejectConfigure) return { accepted: false, reason: 'fixture-refusal', added: 0 };
            native[kind] = { spec: structuredClone(spec), remaining: Math.min(native[kind]?.remaining || 0, spec.capacity), active: false };
            return { accepted: true, reason: 'ok', added: 0 };
        },
        charge(kind, amount) { const s = native[kind], added = Math.min(amount, s.spec.capacity - s.remaining); s.remaining += added; calls.push(['charge', kind, added]); return { accepted: added > 0, reason: 'ok', added }; },
        discharge(kind, amount) { const s = native[kind], removed = Math.min(amount, s.remaining); s.remaining -= removed; if (!s.remaining) s.active = false; calls.push(['discharge', kind, removed]); return { accepted: true, reason: 'ok', added: 0, removed }; },
        activate(kind, active) { const s = native[kind]; if (rejectActivate || !s || active && !s.remaining) return { accepted: false, reason: 'empty', added: 0 }; s.active = active; calls.push(['activate', kind, active]); return { accepted: true, reason: 'ok', added: 0 }; }
    };
    f.talus.elements = { get: name => ({ id: { IRON: 12, LEAD: 91, TUNGSTEN: 60, STEEL: 22 }[name] }) };
    return { ...f, p, e, wallet, native, calls, refusal(configure, activate = false) { rejectConfigure = configure; rejectActivate = activate; } };
}
test('Super Mag owns a finite reflective field and its own reserve; normal magnets keep repulsion', () => {
    const f = scene(); f.api.syncUtilities(f.p);
    assert.equal(f.native.deflector.remaining, 12); assert.equal(f.native.deflector.spec.reflection, undefined);
    assert.equal(f.api.useDefense(f.p, 'super-mag'), true);
    assert.deepEqual(f.native.deflector.spec.reflection, { restitution: 1, maxDeltaSpeed: 1000, energyPerSpeed: .01 });
    assert.equal(f.native.deflector.remaining, 24); assert.equal(f.native.deflector.active, true);
    assert.equal(Object.keys(f.native).length, 1); assert.equal(f.wallet.stock.magnet, 2); assert.equal(f.wallet.stock['super-mag'], 2);
    f.native.deflector.remaining -= 3.6; f.api.accountSupply(f.p);
    assert.ok(Math.abs(f.wallet.stock['super-mag'] - 1.7) < 1e-9); assert.equal(f.wallet.stock.magnet, 2);
    for (let i = 0; i < 4; i++) f.api.syncUtilities(f.p);
    assert.ok(Math.abs(f.native.deflector.remaining - 20.4) < 1e-9);
    assert.equal(f.api.useDefense(f.p, 'magnet'), true);
    assert.equal(f.native.deflector.spec.reflection, undefined); assert.equal(f.native.deflector.remaining, 12);
    assert.equal(f.wallet.stock.magnet, 2); assert.ok(Math.abs(f.wallet.stock['super-mag'] - 1.7) < 1e-9);
    assert.equal(f.api.useDefense(f.p, 'super-mag'), true);
    assert.ok(Math.abs(f.native.deflector.remaining - 20.4) < 1e-9, 'Switching cannot refill already spent reflector energy');
    f.api.publish(); assert.equal(f.ui.supplies.reflectOn, true); assert.equal(f.ui.supplies.magnetOn, false);
    assert.equal(f.ui.supplies.deflectorName, 'Reflector');
    assert.equal(f.ui.supplies.reflectStock, '1.7');
});
test('configuration and activation refusal consume no reserve or auto-defense charge', () => {
    const f = scene(); f.api.syncUtilities(f.p);
    const before = structuredClone(f.wallet.stock), field = structuredClone(f.native.deflector);
    f.refusal(true);
    assert.equal(f.api.useDefense(f.p, 'super-mag'), false);
    assert.deepEqual(structuredClone(f.wallet.stock), before); assert.deepEqual(f.native.deflector, field);
    assert.equal(f.api.selectedDeflector(f.p), 'magnet');
    f.refusal(false, true);
    assert.equal(f.api.useDefense(f.p, 'super-mag'), false);
    assert.deepEqual(structuredClone(f.wallet.stock), before); assert.equal(f.native.deflector.active, false);
    f.wallet.stock['auto-defense'] = 1;
    f.api.autoDefend(f.p); assert.equal(f.wallet.stock['auto-defense'], 1);
    assert.equal(f.api.tankUtilityLedger(f.p).autoDefenseChecked, undefined);
});
test('native depletion, parking and older component values cannot mint reflector stock', () => {
    const f = scene(); f.api.useDefense(f.p, 'super-mag');
    f.native.deflector.remaining = 12; f.api.accountSupply(f.p);
    assert.equal(f.wallet.stock['super-mag'], 1);
    f.e.isLive = false; f.api.syncUtilities(f.p);
    f.e.isLive = true; f.native.deflector.remaining = 24;
    f.api.syncUtilities(f.p);
    assert.equal(f.native.deflector.remaining, 12); assert.equal(f.wallet.stock['super-mag'], 1);
    f.native.deflector.remaining = 0; f.native.deflector.active = false;
    f.api.syncUtilities(f.p);
    assert.equal(f.wallet.stock['super-mag'], 0); assert.equal(f.native.deflector.remaining, 0);
    assert.equal(f.api.useDefense(f.p, 'super-mag'), false);
    assert.equal(f.wallet.stock.magnet, 2, 'Reflector depletion cannot spend the ordinary magnet reserve');
});
test('CPU auto-defense selects an owned reflector once and preserves normal reserve purchases', () => {
    const f = scene(); f.p.control = 'cpu'; f.wallet.stock['auto-defense'] = 1;
    f.api.autoDefend(f.p);
    assert.equal(f.api.preferredDeflector(f.p), 'super-mag'); assert.equal(f.api.selectedDeflector(f.p), 'super-mag');
    assert.equal(f.native.deflector.active, true); assert.equal(f.wallet.stock['auto-defense'], 0);
    const activations = f.calls.filter(c => c[0] === 'activate').length;
    f.api.autoDefend(f.p); assert.equal(f.calls.filter(c => c[0] === 'activate').length, activations);
    f.native.deflector.active = false; f.wallet.stock['super-mag'] = 0;
    assert.equal(f.api.preferredDeflector(f.p), 'magnet');
    assert.equal(f.api.useDefense(f.p, 'magnet'), true);
    assert.equal(f.native.deflector.spec.reflection, undefined); assert.equal(f.wallet.stock.magnet, 2);
});
test('buying a reflector adds reflector stock and leaves previously bought magnets unchanged', () => {
    const f = scene(); f.m.phase = 'ready'; f.wallet.cash = 2000;
    assert.equal(f.api.purchase(f.p, 'super-mag'), true);
    assert.equal(f.wallet.stock['super-mag'], 3); assert.equal(f.wallet.stock.magnet, 2);
    assert.equal(f.wallet.cash, 1150); assert.equal(f.native.deflector.spec.reflection, undefined);
});
