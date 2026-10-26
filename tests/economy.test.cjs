const assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
{
    const f = fixture(), p = f.m.roster[0], tank = f.actors.get(p.entityId);
    f.emit('damage', { source: tank, target: tank, targetStableId: tank.id, amount: 10, blocked: false });
    assert.equal(p.cashEarned, 60, 'Self damage pays hit, damage and hurt rewards');
    f.emit('damage', { source: tank, target: tank, amount: 0, blocked: true });
    assert.equal(p.cashEarned, 60);
    f.emit('damage', { source: tank, target: { id: 'outside-roster' }, amount: 5, blocked: false });
    assert.equal(p.cashEarned, 95, 'Damage to any entity pays the attacker');
    f.api.eliminate(p, 'self-hit', tank.id, { x: 5800, y: 650 });
    f.api.eliminate(p, 'duplicate', tank.id);
    assert.equal(p.cashBreakdown.death, 100);
    assert.equal(p.cashBreakdown.kill, 100);
    for (let n = 0; n < 100; n++) {
        const e = { projectileId: n, owner: tank };
        f.api.shotReward(e, 'launch');
        f.api.shotReward(e, 'launch');
        f.api.shotReward(e, 'landing');
        f.api.shotReward(e, 'landing');
        f.api.shotReward(e, 'end');
        f.api.shotReward(e, 'end');
    }
    assert.equal(p.cashBreakdown.shoot, 2000);
    assert.equal(p.cashBreakdown.landing, 1500);
    assert.equal(Object.keys(f.m.cashShots).length, 0, 'Completed-shot receipt memory is bounded by live shots');
    f.api.settleWallets();
    const total = f.api.bank.players.alpha.cash;
    f.api.settleWallets();
    assert.equal(f.api.bank.players.alpha.cash, total, 'Result cannot pay twice');
    const stale = JSON.parse(JSON.stringify(f.m));
    stale.roster[0].cashEarned += 99999;
    f.api.load(stale);
    f.api.settleWallets();
    assert.equal(f.api.bank.players.alpha.cash, total, 'Old save cannot duplicate a banked round');
}
{
    const f = fixture(), p = f.m.roster[0], w = f.api.bank.players.alpha;
    f.m.phase = 'ready';
    assert.equal(w.cash, 600);
    assert.equal(f.api.purchase(p, 'magnet'), false, 'Unavailable items cannot take money');
    assert.equal(f.api.purchase(p, 'missing'), false);
    assert.equal(f.api.purchase(p, 'standard'), false);
    assert.equal(f.api.purchase(p, 'heavy', w.revision), true);
    assert.equal(w.cash, 360);
    assert.equal(w.stock.heavy, 3);
    assert.equal(f.api.purchase(p, 'heavy', 0), false, 'Stale double-click cannot purchase twice');
    assert.equal(f.api.purchase(p, 'heavy', w.revision), true);
    assert.equal(w.cash, 120);
    assert.equal(w.stock.heavy, 6);
    assert.equal(f.api.purchase(p, 'heavy'), false);
    assert.equal(w.cash, 120, 'Insufficient funds leave wallet untouched');
    assert.equal(f.api.chooseWeapon(p, 'heavy'), true);
    assert.equal(p.weaponId, 'heavy');
    assert.equal(f.api.chooseWeapon(p, 'ricochet'), false, 'Cannot select empty paid gun');
    assert.equal(f.api.purchase(p, 'battery'), true);
    assert.equal(w.stock.battery, 2);
    f.m.phase = 'turn';
    const tank = f.actors.get(p.entityId);
    assert.equal(f.api.useBattery(p), false);
    assert.equal(w.stock.battery, 2, 'Full-health use does not consume a battery');
    tank.health = 45;
    assert.equal(f.api.useBattery(p), true);
    assert.equal(tank.health, 75);
    assert.equal(w.stock.battery, 1);
    assert.equal(f.m.phase, 'turn');
    assert.equal(p.cashBreakdown.utility, 15);
    f.api.useBattery(p);
    assert.equal(tank.health, 100);
    assert.equal(w.stock.battery, 0);
    assert.equal(f.api.useBattery(p), false);
    assert.equal(f.api.bank.players.bravo.cash, 600, 'Accounts are isolated by player name');
}
{
    const f = fixture();
    f.m.phase = 'finished';
    f.api.cpuShopping();
    const spent = f.api.bank.players.alpha.spent;
    f.api.cpuShopping();
    assert.equal(f.api.bank.players.alpha.spent, spent, 'CPU basket is bought once per visit stage, including reload');
    f.api.load(f.m);
    f.api.cpuShopping();
    assert.equal(f.api.bank.players.alpha.spent, spent);
    const before = f.api.bank.players.alpha.cash;
    f.api.ensureWallets();
    assert.equal(f.api.bank.players.alpha.cash, before, 'Starting grant only applies once');
}
{
    const f = fixture('__proto__\nconstructor');
    f.m.phase = 'ready';
    f.api.cpuShopping();
    for (const p of f.m.roster) {
        const w = f.api.bank.players[p.name];
        assert.ok(Object.hasOwn(f.api.bank.players, p.name));
        assert.ok(w.cash < 600);
    }
    f.m.phase = 'turn';
    f.api.reward(f.m.roster[0], 'shoot');
    f.api.settleWallets();
    assert.equal(f.api.bank.rounds['economic-world'].paid.__proto__, 20);
}
