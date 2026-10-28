// Policy tests use the actual game script; native physics is tested separately
// by aim-benchmark.test.ts. No app or profile is opened.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
function setup() {
    const f = fixture();
    f.m.turnNumber = 8;
    f.api.setPersonas(personas);
    f.m.cpuSkill = 'expert';
    f.talus.world.wind = 0;
    f.talus.world.raycast = () => null;
    f.talus.world.groundY = () => null;
    const p = f.m.roster[0], target = f.m.roster[1], tank = f.actors.get(p.entityId), enemy = f.actors.get(target.entityId);
    const requests = [];
    tank.weapon.plan = async (r) => { requests.push(structuredClone(r)); return { status: 'clear', reason: 'clear', warnings: [], work: { candidates: 1 }, solution: { angle: r.fixedAngle ?? -.8, power: .5, end: r.target } }; };
    function observation(overrides = {}) {
        return { turn: 8, targetId: target.entityId, weapon: 'standard', origin: { ...tank.position }, target: { ...enemy.position }, targetAtLaunch: { ...enemy.position },
            impact: { x: enemy.position.x - 80, y: enemy.position.y }, reason: 'detonated', collision: 'terrain', dx: -80, dy: 0, angle: -.8, power: .5, hit: false, direct: false,
            solution: { kind: 'tank', offsetX: 0 }, wind: 0, ...overrides };
    }
    return { ...f, p, target, tank, enemy, requests, observation };
}
async function main() {
    {
        const f = setup();
        f.api.observeCpuShot(f.p, f.observation());
        const m = f.api.fireControl(f.p, f.target.entityId, 'standard');
        assert.ok(m.offsetX > 0, 'An actual short impact increases requested range');
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.requests[0].fixedAngle, -.8);
        assert.ok(f.requests[0].target.x > f.enemy.position.x);
        assert.equal(f.requests[0].angleOffset, 0);
        assert.equal(f.requests[0].powerOffset, undefined);
        const learned = m.offsetX;
        f.tank.position.x += 55;
        await f.api.planCpuShot(f.p, 8);
        assert.equal(f.p.fireSolution.offsetX, learned, 'Normal repositioning preserves measured range bias');
        f.tank.position.y += 100;
        f.requests.length = 0;
        await f.api.planCpuShot(f.p, 8);
        assert.equal(f.p.fireSolution.offsetX, 0, 'A large changed elevation invalidates that geometric correction');
        assert.equal(m.offsetX, learned, 'Invalidation does not destroy the stored evidence');
    }
    {
        const f = setup();
        f.api.observeCpuShot(f.p, f.observation({ dx: 1, dy: 0, hit: true, direct: true, power: .37, angle: -1.1 }));
        const m = f.api.fireControl(f.p, f.target.entityId, 'standard'), saved = JSON.stringify(m.best);
        f.p.fireControls = JSON.parse(JSON.stringify(f.p.fireControls));
        for (let n = 0; n < 5; n++)
            await f.api.planCpuShot(f.p, 8);
        assert.ok(f.requests.every(r => r.fixedAngle === -1.1 && r.angleOffset === 0 && !r.powerOffset));
        assert.equal(f.p.aiRng, undefined, 'Aiming never rolls artificial skill noise');
        f.api.observeCpuShot(f.p, f.observation({ turn: 9, dx: 55, hit: false, solution: { kind: 'tank', offsetX: -12 } }));
        const after = f.api.fireControl(f.p, f.target.entityId, 'standard');
        assert.equal(JSON.stringify(after.best), saved, 'A subsequent worse shot cannot erase the successful angle/power');
        assert.equal(after.offsetX, after.best.offsetX);
        assert.equal(after.gain, .5, 'Correction gain shrinks after regression');
        f.api.observeCpuShot(f.p, f.observation({ turn: 10, dx: 0, dy: 0, hit: true, direct: false }));
        assert.equal(JSON.stringify(after.best), saved, 'A numerically closer splash cannot replace a direct hit');
        const requests = f.requests.length;
        f.api.bank.players.alpha.stock['fuel-tank'] = 5;
        f.m.remaining = 30;
        await f.api.exploreCpu(f.p, 8, () => true);
        assert.equal(f.requests.length, requests);
        assert.equal(f.p.aiRng, undefined, 'A successful emplacement does not randomly wander away');
    }
    for (const overrides of [
        { reason: 'lifetime' }, { reason: 'removed' }, { split: true }, { solution: { kind: 'apex' } }, { solution: { kind: 'terrain' } },
        { collision: 'body' }, { dy: 200 }, { dx: -1000 }, { target: { x: 9999, y: 650 } },
    ]) {
        const f = setup();
        f.api.observeCpuShot(f.p, f.observation(overrides));
        const m = f.api.fireControl(f.p, f.target.entityId, 'standard');
        assert.equal(m.samples, 0, JSON.stringify(overrides));
        assert.equal(m.offsetX, 0);
    }
    {
        const f = setup();
        f.api.observeCpuShot(f.p, f.observation());
        f.api.observeCpuShot(f.p, f.observation({ weapon: 'heavy', dx: 50 }));
        assert.ok(f.api.fireControl(f.p, f.target.entityId, 'standard').offsetX > 0);
        assert.ok(f.api.fireControl(f.p, f.target.entityId, 'heavy').offsetX < 0, 'Weapons retain separate corrections');
        for (let n = 0; n < 100; n++)
            f.api.observeCpuShot(f.p, f.observation({ weapon: 'weapon-' + n, reason: 'removed' }));
        assert.equal(f.p.fireControls.length, 64);
        assert.equal(f.p.impacts.length, 64);
    }
    {
        const f = setup();
        f.api.observeCpuShot(f.p, f.observation({ dx: 0, dy: 0, hit: true, direct: true, power: .37, angle: -1.1, solution: { kind: 'field', offsetX: 0 } }));
        f.tank.weapon.plan = async () => ({ status: 'refused', reason: 'deflection-fields', work: { candidates: 0 } });
        await f.api.planCpuShot(f.p, 8);
        assert.equal(f.tank.blackboard.get('custom.aimAngle'), -1.1);
        assert.equal(f.tank.blackboard.get('custom.aimPower'), .37);
        assert.equal(f.tank.blackboard.get('custom.aimPlan'), null, 'Observed field hit is never misrepresented as a clear native forecast');
    }
    {
        const f = setup();
        f.p.shotFrom = { ...f.tank.position };
        f.m.attack = { owner: f.p.entityId, item: 'standard', targetId: f.target.entityId, targetAtLaunch: { ...f.enemy.position },
            ids: { 123: { depth: 0, split: false, launch: { x: 6000, y: 640, vx: 500, vy: -500 }, launchClock: 0 } }, rootId: 123, ended: 0, pending: [], angle: -.8, power: 50,
            solution: { kind: 'tank', offsetX: 0 }, wind: 0 };
        f.emit('projectile.hit', { projectileId: 123, targetStableId: f.target.entityId, amount: 80, direct: true,
            projectile: { snapshot: () => ({ ...f.enemy.position }) } });
        f.emit('projectile.end', { projectileId: 123, x: f.enemy.position.x, y: f.enemy.position.y, reason: 'detonated' });
        const m = f.api.fireControl(f.p, f.target.entityId, 'standard');
        assert.equal(m.hits, 1);
        assert.equal(m.best.power, .5);
        assert.equal(m.best.angle, -.8);
        f.emit('projectile.end', { projectileId: 123, x: f.enemy.position.x, y: f.enemy.position.y, reason: 'detonated' });
        assert.equal(m.hits, 1, 'Duplicate end cannot learn twice');
        assert.equal(f.p.impacts[0].launch.vx, 500, 'Observed velocity is retained for actual-versus-planned diagnosis');
    }
    {
        const f = setup();
        await f.api.planCpuShot(f.p, 8);
        f.m.phase = 'telegraph';
        f.tank.position.x += 30;
        let fired = 0;
        f.tank.weapon.fire = () => { fired++; return true; };
        f.tank.weapon.state.angle = -.8;
        f.api.performAttack(f.p);
        assert.equal(fired, 0, 'No immediate trigger with a stale firing position');
        for (let n = 0; n < 5; n++)
            await new Promise(resolve => setImmediate(resolve));
        assert.equal(fired, 1);
        assert.equal(f.requests.at(-1).maxCandidates, 1, 'One bounded native recheck after settling during speech');
        assert.equal(f.p.fireSolution.origin.x, f.tank.position.x);
        assert.equal(f.m.phase, 'firing');
    }
    {
        const f = setup(), profiles = structuredClone(personas);
        profiles.personas[0].strategy.weaponPreferences = ['digger-shell', 'standard'];
        f.api.setPersonas(profiles);
        f.p.personaId = profiles.personas[0].id;
        f.enemy.position.x = f.tank.position.x + 400;
        f.api.wallet(f.p).stock['digger-shell'] = 3;
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.weaponId, 'digger-shell');
        assert.equal(f.p.fireSolution.kind, 'special');
        assert.equal(f.requests.length, 0, 'Native ballistic forecasting is not invoked for an excavating shot');
        assert.equal(f.tank.blackboard.get('custom.aimPlan'), null);
        assert.equal(f.tank.blackboard.get('custom.aiDecision').status, 'uncertain');
        f.api.observeCpuShot(f.p, f.observation({ weapon: 'digger-shell', hit: true, direct: true,
            angle: -.09, power: .8, reason: 'expired', solution: { kind: 'special' } }));
        const memory = f.api.fireControl(f.p, f.target.entityId, 'digger-shell');
        assert.equal(memory.best.angle, -.09);
        assert.equal(memory.offsetX, 0);
        f.api.observeCpuShot(f.p, f.observation({ weapon: 'digger-shell', hit: false, direct: false,
            dx: -70, dy: 0, solution: { kind: 'special' } }));
        assert.equal(memory.best.angle, -.09, 'A subsequent cutter miss cannot discard the proven direct hit');
        assert.equal(memory.offsetX, 0, 'Cutter misses do not get ballistic range corrections');
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.fireSolution.angle, -.09);
        assert.equal(f.p.fireSolution.power, .8);
        f.enemy.position.y -= 40;
        assert.equal(f.api.refreshSpecialShot(f.p), true);
        assert.equal(f.p.fireSolution.angle, Math.atan2(-40, 400), 'Changed target pose refreshes the explicit estimate');
        assert.equal(f.tank.blackboard.get('custom.angle'), -Math.atan2(-40, 400) * 180 / Math.PI);
        f.talus.world.raycast = () => ({ body: {}, element: { id: 23 } });
        assert.equal(f.api.refreshSpecialShot(f.p), false, 'A new protected body refuses before firing');
        assert.equal(f.api.owned(f.p, 'digger-shell'), 3, 'Planning and refusal consume no ammunition');
    }
    {
        const f = setup(), profiles = structuredClone(personas);
        profiles.personas[0].strategy.weaponPreferences = ['laser', 'standard'];
        f.api.setPersonas(profiles);
        f.p.personaId = profiles.personas[0].id;
        f.enemy.position.x = f.tank.position.x + 400;
        f.api.wallet(f.p).stock.laser = 3;
        f.api.wallet(f.p).stock.battery = 0;
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.weaponId, 'standard', 'CPU does not arm a cutting pulse without its Battery');
        f.api.wallet(f.p).stock.battery = 1;
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.weaponId, 'laser');
        assert.equal(f.tank.blackboard.get('custom.aimPlan'), null);
    }
    {
        const f = setup(), profiles = structuredClone(personas);
        profiles.personas[0].strategy.weaponPreferences = ['baby-digger', 'standard'];
        f.api.setPersonas(profiles);
        f.p.personaId = profiles.personas[0].id;
        f.enemy.position.x = f.tank.position.x + 600;
        f.api.wallet(f.p).stock['baby-digger'] = 2;
        f.tank.weapon.plan = async () => ({ status: 'refused', reason: 'obstructed', work: { candidates: 1 } });
        assert.equal(await f.api.planCpuShot(f.p, 8), false);
        const decision = f.tank.blackboard.get('custom.aiDecision');
        assert.ok(decision.skipped.some(s => s.item === 'baby-digger' && s.reason === 'special-shot-unavailable'));
        assert.ok(decision.trials.length && decision.trials.every(t => t.reason === 'obstructed'),
            'Out-of-reach equipment must not masquerade as a hard native refusal and prevent paid repositioning');
    }
    {
        const f = setup();
        f.p.shotFrom = { ...f.tank.position };
        f.m.attack = { owner: f.p.entityId, item: 'laser', targetId: f.target.entityId,
            targetAtLaunch: { ...f.enemy.position }, ids: {
                321: { depth: 0, split: false, launchClock: 0 },
                322: { depth: 0, split: false, launchClock: 0 },
            }, rootId: 321, ended: 0, pending: [], tasks: 0, emitted: 1, angle: -.12, power: 100,
            solution: { kind: 'special' }, wind: 0 };
        f.emit('projectile.end', { projectileId: 321, x: f.enemy.position.x + 100, y: f.enemy.position.y, reason: 'expired' });
        assert.equal(f.p.impacts?.length || 0, 0, 'The first missed pulse cannot finish whole-cast learning');
        f.emit('projectile.hit', { projectileId: 322, targetStableId: f.target.entityId, amount: 8, direct: true,
            projectile: { snapshot: () => ({ ...f.enemy.position }) } });
        f.emit('projectile.end', { projectileId: 322, x: f.enemy.position.x + 200, y: f.enemy.position.y, reason: 'expired' });
        f.game.context.turns.settle = async () => {};
        f.api.tickAttack();
        const memory = f.api.fireControl(f.p, f.target.entityId, 'laser');
        assert.equal(memory.hits, 1);
        assert.equal(memory.best.angle, -.12);
        assert.equal(f.p.impacts[0].learning, 'measured-direct-hit');
        assert.equal(f.p.impacts[0].impact.x, f.enemy.position.x, 'Use actual hit position, not a later pulse expiry');
        f.api.tickAttack();
        assert.equal(memory.hits, 1, 'Finishing a cast twice cannot learn twice');
    }
    {
        const f = setup(), profiles = structuredClone(personas);
        profiles.personas[0].strategy.weaponPreferences = ['laser', 'standard'];
        f.api.setPersonas(profiles);
        f.p.personaId = profiles.personas[0].id;
        f.enemy.position.x = f.tank.position.x + 400;
        Object.assign(f.api.wallet(f.p).stock, { laser: 3, battery: 1, 'heat-guidance': 1 });
        f.api.observeCpuShot(f.p, f.observation({ weapon: 'laser', hit: true, direct: true, angle: -.23,
            power: 1, reason: 'expired', solution: { kind: 'special', guidance: 'heat-guidance' } }));
        const memory = f.api.fireControl(f.p, f.target.entityId, 'laser');
        assert.equal(memory.best.guidance, 'heat-guidance');
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.fireSolution.angle, -.23);
        assert.equal(f.p.fireSolution.guidance, 'heat-guidance');
        f.api.armCpu(f.p);
        assert.equal(f.p.guidanceArmed, 'heat-guidance');
        f.api.wallet(f.p).stock['heat-guidance'] = 0;
        assert.equal(f.api.provenShot(f.p, f.target.entityId, 'laser', f.tank.position, f.enemy.position, true), null);
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.fireSolution.angle, 0, 'A spent Heat charge cannot turn its guided angle into an unguided proof');
        assert.equal(Object.hasOwn(f.p.fireSolution, 'guidance'), false, 'Fresh direct estimate is distinct from measured unguided hit');
        assert.equal(memory.best.angle, -.23, 'Unavailable equipment does not erase the observation');
        f.api.wallet(f.p).stock['heat-guidance'] = 1;
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.p.fireSolution.angle, -.23, 'Restocking restores the original measured configuration');
        assert.equal(f.p.fireSolution.guidance, 'heat-guidance');
        f.api.observeCpuShot(f.p, f.observation({ weapon: 'laser', hit: false, direct: false, dx: -90,
            solution: { kind: 'special', guidance: 'heat-guidance' } }));
        assert.equal(memory.offsetX, 0);
        assert.equal(memory.best.angle, -.23);
    }
    {
        const f = setup();
        f.api.wallet(f.p).stock['heat-guidance'] = 1;
        f.api.observeCpuShot(f.p, f.observation({ hit: true, direct: true, angle: -.4, power: .42,
            solution: { kind: 'uncertain-tank', guidance: 'heat-guidance' } }));
        assert.equal(await f.api.planCpuShot(f.p, 8), true);
        assert.equal(f.requests.length, 0, 'Measured guided hits never become clear unguided ballistic forecasts');
        assert.equal(f.p.fireSolution.kind, 'uncertain-tank');
        assert.equal(f.p.fireSolution.guidance, 'heat-guidance');
        assert.equal(f.p.fireSolution.angle, -.4);
        f.api.observeCpuShot(f.p, f.observation({ hit: false, direct: false, dx: 80,
            solution: { kind: 'tank', guidance: 'heat-guidance' } }));
        assert.equal(f.api.fireControl(f.p, f.target.entityId, 'standard').offsetX, 0,
            'A guided miss does not contaminate unguided range correction');
    }
    console.log('PASS: per-target/weapon feedback, directional correction, pose validity, persistent successful solutions, no rerolled skill noise, regression rollback, held emplacement, diagnostic exclusions, bounded records, magnetic hit reuse, real event integration and duplicate-end isolation');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
