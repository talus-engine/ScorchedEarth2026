const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./support/game.cjs');

function scene(weaponId) {
    const f = fixture(), ctx = f.game.context, [pilot, target] = f.m.roster;
    const actor = f.actors.get(pilot.entityId), opponent = f.actors.get(target.entityId);
    const item = f.shop.items.find(item => item.id === weaponId), wallet = f.api.wallet(pilot);
    const origin = { ...actor.position };
    const shots = [], pending = [];
    let settles = 0;
    opponent.position = { x: actor.position.x + 250, y: actor.position.y };
    f.talus.world.raycast = () => null;
    f.m.turnNumber = 3;
    pilot.weaponId = weaponId;
    pilot.targetId = target.entityId;
    pilot.fireSolution = { kind: 'special', weapon: weaponId, turn: 3, origin: { ...actor.position },
        target: { ...opponent.position }, angle: -.2, power: .65, wind: 0 };
    wallet.stock[weaponId] = 2;
    wallet.stock.battery = 2;
    actor.blackboard.set('custom.angle', .2 * 180 / Math.PI);
    actor.blackboard.set('custom.power', 65);
    actor.weapon.state.angle = -.2;
    actor.weapon.aim = angle => { actor.weapon.state.angle = angle; return true; };
    ctx.turns.settle = async () => { settles++; f.m.phase = 'settling'; };
    ctx.session.run = fn => pending.push(fn());
    function launch() {
        const snap = { id: shots.length + 1, x: origin.x + 40, y: origin.y, vx: 600, vy: -40, age: 0 };
        const shot = { id: snap.id, exists: true, snapshot: () => shot.exists ? snap : null, snap };
        shots.push(shot);
        f.emit('projectile.launch', { projectileId: shot.id, owner: actor.exists ? actor : null,
            ownerEntityId: pilot.entityId, projectile: shot });
        return shot;
    }
    f.talus.projectiles = { get: id => shots.find(s => s.id === id), launch() { throw Error('Native payloads must not be spawned by game scripts'); } };
    actor.weapon.fire = targetId => {
        assert.equal(targetId, target.entityId);
        for (let n = 0; n < item.projectile.projectilesPerShot; n++) launch();
        return true;
    };
    function hit(shot, at = opponent.position, direct = true) {
        Object.assign(shot.snap, at);
        f.emit('damage', { source: actor, target: opponent, targetStableId: target.entityId, amount: 8, blocked: false });
        f.emit('projectile.hit', { projectileId: shot.id, projectile: shot, targetStableId: target.entityId, amount: 8, direct, killed: false });
    }
    function end(shot, at = { x: opponent.position.x - 50, y: opponent.position.y }, reason = 'expired') {
        Object.assign(shot.snap, at);
        shot.exists = false;
        f.emit('projectile.end', { projectileId: shot.id, projectile: shot, owner: actor, ...at, reason });
    }
    f.api.performAttack(pilot);
    return { ...f, ctx, pilot, target, actor, opponent, item, wallet, shots, pending, launch, hit, end,
        get settles() { return settles; } };
}

test('A later Laser pulse hit is learned once after every root has ended', () => {
    const f = scene('laser'), a = f.m.attack;
    assert.equal(f.shots.length, 8);
    assert.equal(f.wallet.stock.laser, 1);
    assert.equal(f.wallet.stock.battery, 1);
    assert.equal(f.pilot.shots, 1, 'Eight native roots are one purchased firing action');
    f.end(f.shots[0]);
    f.api.tickAttack();
    assert.equal(f.pilot.impacts?.length || 0, 0, 'The first pulse miss cannot overwrite the whole-cast result');
    assert.equal(f.m.attack, a);
    assert.equal(f.settles, 0);
    const measured = { x: f.opponent.position.x, y: f.opponent.position.y - 2 };
    f.hit(f.shots[5], measured);
    f.hit(f.shots[6], { x: measured.x - 10, y: measured.y - 10 }, false);
    for (const shot of f.shots.slice(1, -1)) f.end(shot);
    f.api.tickAttack();
    assert.equal(f.settles, 0, 'The final live root still owns the volley');
    f.end(f.shots.at(-1), { x: measured.x + 200, y: measured.y + 100 });
    f.api.tickAttack();
    assert.equal(f.m.attack, null);
    assert.equal(f.settles, 1);
    assert.equal(f.pilot.impacts.length, 1);
    assert.equal(f.pilot.impacts[0].hit, true);
    assert.equal(f.pilot.impacts[0].direct, true);
    assert.deepEqual(structuredClone(f.pilot.impacts[0].impact), measured, 'A later splash or expiry cannot replace the observed direct hit');
    assert.equal(f.pilot.impacts[0].learning, 'measured-direct-hit');
    const memory = f.api.fireControl(f.pilot, f.target.entityId, 'laser');
    assert.equal(memory.samples, 1);
    assert.equal(memory.hits, 1);
    assert.equal(memory.best.power, a.power / 100);
    assert.equal(memory.best.angle, a.angle);
    f.api.tickAttack();
    assert.equal(f.pilot.impacts.length, 1);
    assert.equal(f.settles, 1);
});

test('Native Sandhog children keep the volley alive without a second ammunition debit', () => {
    const f = scene('baby-sandhog'), a = f.m.attack, root = f.shots[0];
    f.emit('projectile.payload', { projectileId: root.id, projectile: root });
    f.actor.exists = false;
    f.pilot.eliminated = true;
    const children = Array.from({ length: f.item.projectile.triggerChild[0].projectilesPerShot }, f.launch);
    f.end(root, { x: f.pilot.shotFrom.x + 150, y: f.pilot.shotFrom.y }, 'detonated');
    f.api.tickAttack();
    assert.equal(f.m.attack, a);
    assert.equal(f.settles, 0);
    assert.equal(f.wallet.stock['baby-sandhog'], 1);
    assert.equal(f.wallet.stock.battery, 2);
    assert.equal(f.pilot.shots, 1);
    f.hit(children[1]);
    f.end(children[0]);
    f.end(children[1]);
    f.api.tickAttack();
    assert.equal(f.settles, 0);
    f.end(children[2]);
    f.api.tickAttack();
    assert.equal(f.settles, 1);
    assert.equal(f.pilot.impacts.length, 1);
    assert.equal(f.pilot.impacts[0].split, true);
    assert.equal(f.pilot.impacts[0].learning, 'measured-direct-hit');
    assert.equal(a.launched, 4);
    assert.equal(a.ended, 4);
    const earned = f.pilot.cashEarned;
    f.end(children[2]);
    f.api.tickAttack();
    assert.equal(f.wallet.stock['baby-sandhog'], 1);
    assert.equal(f.pilot.cashEarned, earned, 'A repeated end cannot create a second resolution reward');
    assert.equal(f.pilot.impacts.length, 1);
    assert.equal(f.settles, 1);
});

test('Special-weapon misses remain diagnostic and do not invent ballistic range correction', () => {
    const f = scene('laser');
    for (const shot of f.shots) {
        f.emit('projectile.collision', { projectileId: shot.id, projectile: shot, with: 'terrain' });
        f.end(shot, { x: f.opponent.position.x - 25, y: f.opponent.position.y }, 'detonated');
    }
    f.api.tickAttack();
    assert.equal(f.pilot.impacts.length, 1);
    assert.equal(f.pilot.impacts[0].hit, false);
    assert.equal(f.pilot.impacts[0].learning, 'diagnostic-only');
    const memory = f.api.fireControl(f.pilot, f.target.entityId, 'laser');
    assert.equal(memory.samples, 0);
    assert.equal(memory.offsetX, 0);
    assert.equal(memory.best, null);
});
