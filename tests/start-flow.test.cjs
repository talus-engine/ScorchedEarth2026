// Exercise actual game shopping/start helpers, with native menu/camera doubles.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
function setup() {
    const f = fixture();
    f.m.phase = 'ready';
    f.m.turnNumber = 0;
    f.m.humans = 0;
    f.m.computers = f.m.roster.length;
    f.api.setPersonas(JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8')));
    const opened = [];
    let closes = 0;
    f.talus.ui.openMenu = file => opened.push(file);
    f.talus.ui.closeMenu = () => closes++;
    return { ...f, opened, get closes() { return closes; } };
}
{
    const f = setup();
    f.emit('menu.hud.shop', {});
    assert.equal(f.m.phase, 'focusing', 'CPU-only opening enters the ordinary battle sequence without a Begin click');
    assert.deepEqual(f.opened, [], 'No spectator-only armory modal opens');
    assert.equal(f.closes, 1, 'Any opening overlay is dismissed');
    const receipts = f.api.bank.cpuShops['economic-world:ready'];
    assert.equal(Object.keys(receipts).length, 2, 'Every CPU bought automatically');
    const balances = JSON.stringify(f.api.bank.players);
    f.emit('menu.hud.shop', {});
    f.emit('menu.custom.shop-begin', {});
    f.emit('menu.hud.begin', {});
    assert.equal(f.closes, 1);
    assert.equal(JSON.stringify(f.api.bank.players), balances, 'Repeated/stale controls cannot re-buy or start twice');
    assert.equal(f.barriers.size, 1, 'Normal intro owns the save barrier');
}
{
    const f = setup();
    f.m.roster[1].control = 'human';
    f.m.humans = 1;
    f.m.computers = 1;
    f.emit('menu.hud.shop', {});
    assert.equal(f.m.phase, 'ready');
    assert.deepEqual(f.opened, ['Menus/shop.html'], 'A human keeps their purchase decision');
    assert.equal(f.ui.shop.name, 'Bravo', 'Armory selects the human pilot, even with a CPU first in roster');
    assert.equal(f.api.bank.cpuShops['economic-world:ready'].alpha, true);
    assert.equal(f.api.bank.cpuShops['economic-world:ready'].bravo, undefined);
    f.emit('menu.custom.shop-begin', {});
    assert.equal(f.m.phase, 'focusing');
}
{
    const f = setup();
    f.talus.sim.paused = true;
    f.emit('menu.hud.shop', {});
    f.emit('tick.frame', { dt: 60 });
    assert.equal(f.m.phase, 'focusing');
    assert.equal(f.m.turnNumber, 0, 'Explicit pause cannot be bypassed by automatic start');
    assert.deepEqual(f.opened, []);
}
console.log('PASS: CPU-only auto-buy/start, single intro, human armory selection, stale-click isolation and explicit-pause preservation');
