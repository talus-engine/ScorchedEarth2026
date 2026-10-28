const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function scene() {
    const f = fixture(), p = f.m.roster[0], e = f.actors.get(p.entityId);
    p.control = 'human'; p.targetId = f.m.roster[1].entityId; p.weaponId = 'standard';
    e.blackboard.set('custom.angle', 60); e.blackboard.set('custom.power', 20);
    Object.assign(f.shop.items.find(i => i.id === 'heat-guidance'), { enabled: true, attachment: 'guidance' });
    for (const id of ['horz-guidance', 'vert-guidance', 'heat-guidance', 'ballistic-guidance', 'contact-trigger']) f.api.wallet(p).stock[id] = 2;
    const native = { version: 1, entries: [], armed: [], reservations: [], nextId: 1 }, grants = [], arms = [];
    Object.defineProperty(e.weapon, 'accessories', { get: () => structuredClone(native) });
    e.weapon.grantAccessory = (spec, count) => {
        grants.push({ spec: plain(spec), count });
        let entry = native.entries.find(row => row.spec.id === spec.id);
        if (!entry) native.entries.push(entry = { spec: plain(spec), charges: 0 });
        entry.charges += count; return true;
    };
    e.weapon.armAccessories = ids => { if (native.reservations.length) throw Error('Cast reserved'); native.armed = [...ids]; arms.push([...ids]); return true; };
    const reserve = () => native.reservations.push({ id: native.nextId++, accessories: [...native.armed] });
    const settle = accepted => {
        const reservation = native.reservations.shift();
        if (accepted) {
            for (const id of reservation.accessories) native.entries.find(row => row.spec.id === id).charges--;
            native.armed = native.armed.filter(id => !reservation.accessories.includes(id));
        }
    };
    const attack = () => ({ item: p.weaponId, targetId: p.targetId, targetAtLaunch: { ...f.actors.get(p.targetId).position } });
    return { ...f, p, e, native, grants, arms, reserve, settle, attack, attachment: f.game.context.attachments };
}
test('native cast staging reserves one purchased charge; accepted roots and children pay once', () => {
    const f = scene(), wallet = f.api.wallet(f.p), attack = f.attack();
    assert.equal(f.attachment.arm(f.p, 'horz-guidance'), true);
    assert.equal(f.attachment.arm(f.p, 'contact-trigger'), true);
    assert.equal(wallet.stock['horz-guidance'], 2);
    assert.equal(f.attachment.stage(f.p, attack), true);
    assert.deepEqual(f.grants.map(row => row.count), [1, 1]);
    assert.deepEqual(f.native.armed, ['scorched-earth:horz-guidance', 'scorched-earth:contact-trigger']);
    assert.equal(f.grants[0].spec.ops[0].value.axis, 'horizontal');
    assert.deepEqual(f.grants[1].spec.ops, [
        { field: 'detonate.onBody', op: 'set', value: true }, { field: 'detonate.onTerrain', op: 'set', value: true }
    ]);
    f.reserve();
    assert.equal(wallet.stock['horz-guidance'], 2, 'A queued cast has not consumed the purchased charge');
    f.attachment.attach(f.p, attack);
    assert.equal(f.native.entries[0].charges, 1, 'Rigid launch delivery may precede native settlement');
    f.settle(true);
    f.attachment.attach(f.p, attack); f.attachment.attach(f.p, attack);
    assert.equal(wallet.stock['horz-guidance'], 1); assert.equal(wallet.stock['contact-trigger'], 1);
    assert.equal(attack.guidanceArmed, 'horz-guidance'); assert.equal(f.p.guidanceArmed, null);
    assert.equal(f.native.entries[0].charges, 0);
});
test('native cancellation preserves stock and retry reuses the reservation without another grant', () => {
    const f = scene(); f.attachment.arm(f.p, 'vert-guidance');
    assert.equal(f.attachment.stage(f.p, f.attack()), true); f.reserve();
    assert.equal(f.attachment.stage(f.p, f.attack()), false, 'A queued cast cannot be replaced');
    f.settle(false);
    assert.equal(f.attachment.stage(f.p, f.attack()), true);
    assert.equal(f.grants.length, 1); assert.equal(f.api.wallet(f.p).stock['vert-guidance'], 2);
    assert.equal(f.grants[0].spec.ops[0].value.direction, 'positive');
    f.e.isLive = false; f.e.isLive = true;
    assert.equal(f.attachment.stage(f.p, f.attack()), true);
    assert.equal(f.grants.length, 1, 'A parked/restored native ledger is reused');
});
test('accepted launch remains payable after source death without a second native grant', () => {
    const f = scene(), attack = f.attack(); f.attachment.arm(f.p, 'heat-guidance');
    assert.equal(f.attachment.stage(f.p, attack), true); f.reserve(); f.settle(true);
    f.e.exists = false;
    f.attachment.attach(f.p, attack); f.attachment.attach(f.p, attack);
    assert.equal(f.api.wallet(f.p).stock['heat-guidance'], 1); assert.equal(f.grants.length, 1);
    assert.deepEqual(f.grants[0].spec.ops, [{ field: 'homing', op: 'set', value: 2.5 }]);
    assert.equal(f.installed['indigo.economy'].players.alpha.stock['heat-guidance'], undefined,
        'The combat launch transaction owns the single combined bank write');
    f.api.saveBank();
    assert.equal(f.installed['indigo.economy'].players.alpha.stock['heat-guidance'], 1);
});
test('stale native charges cannot authorize unpurchased casts or replace unknown selections', () => {
    const f = scene(); f.attachment.arm(f.p, 'heat-guidance');
    assert.equal(f.attachment.stage(f.p, f.attack()), true);
    f.api.wallet(f.p).stock['heat-guidance'] = 0;
    assert.equal(f.attachment.stage(f.p, f.attack()), false); assert.equal(f.grants.length, 1);
    f.api.wallet(f.p).stock['heat-guidance'] = 2;
    f.native.armed = ['external:authored-kit'];
    assert.equal(f.attachment.stage(f.p, f.attack()), false);
    assert.deepEqual(f.native.armed, ['external:authored-kit']);
    f.native.armed = []; f.native.entries[0].charges = 2;
    assert.equal(f.attachment.stage(f.p, f.attack()), false);
    assert.equal(f.native.entries[0].charges, 2, 'Unexpected stock is neither destroyed nor silently adopted');
});
test('compatibility keeps real particle guidance but refuses ineffective contact and script bursts', () => {
    const f = scene();
    const particle = { enabled: true, projectile: { kind: 'particle', speed: 600 }, behavior: { mode: 'battery' } };
    assert.equal(f.attachment.compatible(particle, 'heat-guidance'), true);
    assert.equal(f.attachment.compatible(particle, 'horz-guidance'), true);
    assert.equal(f.attachment.compatible(particle, 'contact-trigger'), false);
    assert.equal(f.attachment.compatible(particle, 'ballistic-guidance'), false);
    assert.equal(f.attachment.compatible({ ...particle, behavior: { mode: 'burst' } }, 'heat-guidance'), false);
    assert.equal(f.attachment.compatible({ enabled: true, projectile: { kind: 'rigid-body', speed: 80, excavation: {} } }, 'contact-trigger'), false);
    f.p.guidanceArmed = 'vert-guidance'; f.p.weaponId = 'flamethrower'; f.api.publish();
    assert.equal(f.ui.attachments.find(i => i.action === 'arm-vert-guidance').disabled, false);
    assert.equal(f.attachment.arm(f.p, 'vert-guidance'), true); assert.equal(f.p.guidanceArmed, null);
});
test('ballistic aid accepts an unchanged fixed-angle solution and charges only on launch', async () => {
    const f = scene(); f.attachment.arm(f.p, 'ballistic-guidance'); let request;
    f.e.weapon.plan = async r => { request = r; return { status: 'clear', solution: { power: .62, angle: r.fixedAngle } }; };
    assert.equal(await f.attachment.prepare(f.p), true); assert.equal(request.maxCandidates, 1);
    assert.equal(f.e.blackboard.get('custom.power'), 62); assert.equal(f.api.wallet(f.p).stock['ballistic-guidance'], 2);
    assert.equal(f.attachment.ready(f.p), true); f.e.position.x += 5;
    assert.equal(f.attachment.ready(f.p), false); assert.equal(f.m.phase, 'turn');
    f.e.weapon.plan = async () => ({ status: 'refused', reason: 'obstructed' });
    assert.equal(await f.attachment.prepare(f.p), false); assert.equal(f.api.wallet(f.p).stock['ballistic-guidance'], 2);
    f.e.weapon.plan = async r => ({ status: 'clear', solution: { power: .62, angle: r.fixedAngle } });
    assert.equal(await f.attachment.prepare(f.p), true);
    const attack = f.attack(); assert.equal(f.attachment.stage(f.p, attack), true);
    assert.equal(f.grants.length, 0, 'Fixed-angle power is game policy, not a projectile modifier');
    f.attachment.attach(f.p, attack); f.attachment.attach(f.p, attack);
    assert.equal(f.api.wallet(f.p).stock['ballistic-guidance'], 1);
});
test('CPUs preserve proven fire control and use purchased heat guidance only for uncertain arcs', () => {
    const f = scene(); f.p.control = 'cpu'; f.p.fireSolution = { kind: 'tank' };
    f.attachment.armCpu(f.p); assert.equal(f.p.guidanceArmed, null);
    f.p.fireSolution.kind = 'uncertain-tank'; f.attachment.armCpu(f.p);
    assert.equal(f.p.guidanceArmed, 'heat-guidance');
    f.p.guidanceArmed = null;
    f.game.context.aiming.provenShot = () => ({ best: {} });
    f.attachment.armCpu(f.p); assert.equal(f.p.guidanceArmed, null);
});
test('restored modifier object order does not duplicate the native reservation', () => {
    const f = scene(); f.attachment.arm(f.p, 'heat-guidance');
    assert.equal(f.attachment.stage(f.p, f.attack()), true);
    f.native.entries[0].spec.ops = [{ value: 2.5, op: 'set', field: 'homing' }];
    assert.equal(f.attachment.stage(f.p, f.attack()), true); assert.equal(f.grants.length, 1);
});
test('combat stages before its native trigger and supplies the durable guidance target', () => {
    const f = scene(); f.attachment.arm(f.p, 'heat-guidance');
    f.game.context.presentation.playCue = () => {};
    let fired = 0;
    f.e.weapon.fire = target => {
        fired++; assert.equal(target, f.p.targetId);
        assert.deepEqual(f.native.armed, ['scorched-earth:heat-guidance']);
        assert.equal(f.api.wallet(f.p).stock['heat-guidance'], 2);
        f.reserve(); return true;
    };
    f.api.performAttack(f.p);
    assert.equal(fired, 1); assert.equal(f.m.phase, 'firing');
    f.settle(false); f.m.attack = null; f.m.phase = 'turn'; f.api.wallet(f.p).stock['heat-guidance'] = 0;
    f.api.performAttack(f.p);
    assert.equal(fired, 1); assert.equal(f.m.attack, null); assert.equal(f.m.phase, 'turn');
});

test('CPU learned guidance repeats exactly, including measured unguided hits and unavailable charges', () => {
    const f = scene(); f.p.control = 'cpu';
    for (const guidance of ['horz-guidance', 'vert-guidance', 'heat-guidance', null]) {
        f.p.guidanceArmed = 'heat-guidance';
        f.p.fireSolution = { kind: 'special', guidance };
        f.attachment.armCpu(f.p);
        assert.equal(f.p.guidanceArmed, guidance);
    }
    f.p.fireSolution = { kind: 'special', guidance: 'vert-guidance' };
    f.api.wallet(f.p).stock['vert-guidance'] = 0;
    f.p.guidanceArmed = 'horz-guidance';
    f.attachment.armCpu(f.p);
    assert.equal(f.p.guidanceArmed, null, 'A spent learned charge never substitutes a different owned guidance');
    f.api.wallet(f.p).stock['vert-guidance'] = 2; f.p.weaponId = 'flamethrower';
    f.attachment.armCpu(f.p);
    assert.equal(f.p.guidanceArmed, null, 'A weapon change clears guidance that cannot apply');
    f.p.weaponId = 'standard'; f.p.fireSolution = { kind: 'special' };
    f.attachment.armCpu(f.p);
    assert.equal(f.p.guidanceArmed, 'heat-guidance', 'A fresh special estimate may use a purchased heat charge');
    assert.equal(f.api.wallet(f.p).stock['heat-guidance'], 2, 'Selecting the repeated or estimated setup spends nothing');
});
