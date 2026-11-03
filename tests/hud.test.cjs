const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture } = require('./support/game.cjs');

test('targeting controls appear only during an available player turn', () => {
    const f = fixture(), ctx = f.game.context;
    for (const control of ['cpu', 'human']) {
        f.m.roster[0].control = control;
        for (const phase of ['ready', 'deploying', 'focusing', 'positioning', 'turn', 'telegraph', 'firing', 'flight', 'settling', 'aftermath', 'finished', 'fault']) {
            f.m.phase = phase;
            ctx.menus.publish();
            assert.equal(f.ui.targeting, phase === 'turn', `${control} ${phase}`);
        }
    }
    f.m.phase = 'turn';
    for (const [object, key] of [[ctx.state, 'arcadeCard'], [ctx.state, 'shopOpen'], [f.m.presentation, 'active'], [ctx.state, 'exitDrain']]) {
        object[key] = {};
        ctx.menus.publish();
        assert.equal(f.ui.targeting, false, key);
        object[key] = null;
    }
});

test('shot readout survives impact, lost shooter and loadout changes until the next turn', () => {
    const f = fixture(), ctx = f.game.context, p = f.m.roster[0];
    f.m.turnNumber = 3;
    p.lastShot = { turn: 3, weapon: 'nuke', angle: 137, power: 81 };
    const name = ctx.economy.itemById('nuke').name;
    p.weaponId = 'standard';
    f.actors.delete(p.entityId);
    for (const phase of ['flight', 'settling', 'aftermath', 'focusing']) {
        f.m.phase = phase;
        ctx.menus.publish();
        assert.equal(f.ui.action.weapon, name);
        assert.equal(f.ui.action.angle, 137);
        assert.equal(f.ui.action.power, 81);
    }
    f.m.turnNumber++;
    f.m.phase = 'turn';
    ctx.menus.publish();
    assert.equal(f.ui.action.weapon, ctx.economy.itemById('standard').name);
    assert.equal(f.ui.action.angle, 45);
});

test('action strip shows CPU intentions and never conceals a game error', () => {
    const f = fixture(), p = f.m.roster[0], ctx = f.game.context;
    p.tactic = 'Digging a route to Bravo';
    ctx.menus.publish();
    assert.equal(f.ui.action.thought, p.tactic);
    f.m.message = 'Error: unavailable terrain';
    ctx.menus.publish();
    assert.equal(f.ui.action.thought, f.m.message);
    p.control = 'human';
    f.m.message = 'Position, aim and fire';
    ctx.menus.publish();
    assert.equal(f.ui.action.thought, f.m.message);
});

test('the roster strip retains every player and wallet, including eliminated tanks', () => {
    const f = fixture(undefined, false, 10), ctx = f.game.context;
    f.m.roster[1].eliminated = true;
    ctx.economy.wallet(f.m.roster[1]).cash = 123.45;
    ctx.menus.publish();
    assert.equal(f.ui.roster.length, 10);
    assert.equal(f.ui.roster[1].health, 0);
    assert.equal(f.ui.roster[1].cash, 123.45);
});
