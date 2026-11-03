const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');

function scene() {
    const f = fixture(), p = f.m.roster[0], tank = f.actors.get(p.entityId);
    const shots = [], menus = [], failures = [];
    f.m.turnNumber = 3;
    f.talus.world.cell = () => null;
    f.talus.world.groundY = () => null;
    f.talus.ui.openMenu = menu => menus.push(menu);
    f.talus.sim.pause = () => { f.talus.sim.paused = true; };
    tank.setVelocity = () => {};
    f.game.context.session.fail = error => failures.push(error);
    f.game.context.presentation.queuePresentation = (player, type) => {
        assert.equal(type, 'shooting');
        shots.push({ player: player.entityId, item: player.weaponId,
            angle: tank.blackboard.get('custom.angle'), power: tank.blackboard.get('custom.power') });
    };
    return { ...f, p, tank, shots, menus, failures };
}

test('blocked CPUs shoot for repeated turns without passing, pausing or asking for help', async () => {
    const f = scene();
    f.p.cpuStalled = { reason: 'No supported clear shot' };
    f.p.fireControls = [{ weapon: 'standard', samples: 5 }];
    const memories = JSON.stringify(f.p.fireControls);
    for (let turn = 0; turn < 12; turn++) {
        f.m.phase = 'turn';
        f.m.remaining = 0;
        f.m.turnNumber++;
        f.p.fireSolution = { kind: 'tank', turn: f.m.turnNumber };
        f.api.cpuFallback(f.p, 'obstructed');
        await Promise.resolve();
        assert.equal(f.m.phase, 'telegraph', 'Ordinary dialogue and native firing sequence begins');
        assert.equal(f.shots.length, turn + 1);
        assert.equal(f.shots.at(-1).item, 'standard');
        assert.equal(f.p.fireSolution, null, 'A blind attempt cannot reuse a stale confirmed solution');
        assert.equal(!!f.talus.sim.paused, false);
    }
    assert.ok(new Set(f.shots.map(s => s.angle)).size >= 4);
    assert.ok(new Set(f.shots.map(s => s.power)).size >= 4);
    assert.equal(JSON.stringify(f.p.fireControls), memories, 'Proven shots are retained for normal planning');
    f.api.updateExitView();
    assert.doesNotMatch(f.ui.exitStatus, /CPU blocked/);
    assert.deepEqual(f.menus, []);
    assert.deepEqual(f.failures, []);
});

test('eligible ground gets a free digging charge immediately, with ordinary shell fallback when exhausted', async () => {
    const f = scene();
    f.talus.world.cell = () => ({ element: { name: 'DIRT' }, body: null, entity: null });
    f.p.guidanceArmed = 'ballistic-guidance';
    f.p.contactArmed = 'contact-trigger';
    f.api.cpuFallback(f.p, 'blocked');
    await Promise.resolve();
    assert.equal(f.shots[0].item, 'escape-charge');
    assert.equal(f.p.guidanceArmed, null);
    assert.equal(f.p.contactArmed, null);
    f.m.phase = 'turn';
    f.m.turnNumber++;
    f.talus.world.cell = () => null;
    f.api.cpuFallback(f.p, 'no eligible terrain');
    await Promise.resolve();
    assert.equal(f.shots[1].item, 'standard');
    assert.deepEqual(f.failures, []);
});

test('planner failure, graph refusal and timeout all start an attack', async () => {
    const f = scene();
    f.p.preparedTurn = f.m.turnNumber;
    f.game.context.aiming.planCpuShot = async () => false;
    await f.api.prepareCpuTurn(f.p, f.m.turnNumber);
    assert.equal(f.shots.length, 1);
    f.m.phase = 'turn';
    f.m.turnNumber++;
    f.emit('indigo:cpu-unreachable', { id: f.p.entityId, turn: f.m.turnNumber - 1 });
    assert.equal(f.shots.length, 1, 'Stale graph callbacks do not fire');
    f.tank.blackboard.set('custom.aimRefusal', 'terrain-corrupt');
    f.emit('indigo:cpu-unreachable', { id: f.p.entityId, turn: f.m.turnNumber });
    await Promise.resolve();
    assert.equal(f.shots.length, 2, 'A survey refusal is not a match failure');
    f.m.phase = 'turn';
    f.m.turnNumber++;
    f.m.remaining = 0;
    for (const [service, method] of [['camera', 'cameraTank'], ['presentation', 'tickPresentation'],
        ['chaos', 'tickChaos'], ['payloads', 'tick']]) f.game.context[service][method] = () => false;
    f.emit('tick.sim.pre', { dt: .02 });
    await Promise.resolve();
    assert.equal(f.shots.length, 3, 'Timeout fires instead of passing or pausing');
    assert.deepEqual(f.failures, []);
});

test('fallback respects human turns, eliminated tanks, pause and duplicate requests', async () => {
    const f = scene();
    f.p.control = 'human';
    f.api.cpuFallback(f.p, 'blocked');
    f.p.control = 'cpu';
    f.p.eliminated = true;
    f.api.cpuFallback(f.p, 'blocked');
    f.p.eliminated = false;
    f.talus.sim.paused = true;
    f.api.cpuFallback(f.p, 'blocked');
    assert.equal(f.shots.length, 0);
    f.talus.sim.paused = false;
    f.api.cpuFallback(f.p, 'blocked');
    f.api.cpuFallback(f.p, 'duplicate');
    await Promise.resolve();
    assert.equal(f.shots.length, 1);
    assert.deepEqual(f.failures, []);
});

test('a firing position that changes during dialogue gets another shot, not a blocked dialog', async () => {
    const f = scene();
    f.m.phase = 'telegraph';
    f.p.targetId = f.m.roster[1].entityId;
    f.p.weaponId = 'standard';
    const previous = { weapon: 'standard', kind: 'tank', angle: -.8, offsetX: 0, turn: f.m.turnNumber };
    f.p.fireSolution = previous;
    f.tank.weapon.plan = async () => ({ status: 'refused', reason: 'obstructed' });
    await f.api.refreshCpuShot(f.p, previous);
    assert.equal(f.shots.length, 1);
    assert.equal(f.shots[0].item, 'standard');
    assert.equal(f.m.phase, 'telegraph');
    assert.equal(f.p.fireSolution, null);
    assert.deepEqual(f.menus, []);
    assert.deepEqual(f.failures, []);
});
