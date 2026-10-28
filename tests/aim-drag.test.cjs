// Game selection of native feasible candidates only; no copied trajectory or
// claim that a liquid-drag refusal proves the resulting shot will hit.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
const clone = value => structuredClone(value);
function setup() {
    const f = fixture(), p = f.m.roster[0], target = f.m.roster[1], tank = f.actors.get(p.entityId), victim = f.actors.get(target.entityId);
    f.api.setPersonas(clone(personas));
    p.personaId = 'lucky';
    f.m.turnNumber = 9;
    f.talus.factions = { pool: () => ({ status: 'ready', lines: [{ id: 'probe-taunt', text: 'Here goes something.' }] }), holdSpeech() { } };
    f.talus.world.raycast = () => null;
    f.talus.world.groundY = () => null;
    f.api.bank.players.alpha.stock.heavy = 3;
    const state = tank.weapon.state, pose = { angle: 0, vx: 0, vy: 0 }, snap = tank.snapshot.bind(tank), calls = [];
    tank.snapshot = () => { const s = snap(); return s && { ...s, ...pose }; };
    tank.weapon.equip = template => { state.equipped = template; return true; };
    tank.weapon.aim = angle => { state.angle = angle; return true; };
    const obstruction = (distance = 10) => ({ kind: 'unknown', reason: 'material-drag-not-supported',
        element: 17, x: victim.position.x - distance, y: victim.position.y, time: 1.5 });
    const candidate = (distance = 10, angle = -1.1, power = .61) => ({ angle, power, reason: 'material-drag-not-supported', obstruction: obstruction(distance) });
    const refused = (reason = 'material-drag-not-supported', candidates = [candidate()]) => ({ status: 'refused', reason,
        solution: null, candidates, obstruction: candidates[0]?.obstruction || null,
        warnings: ['evolving-air-fields-not-predicted'], work: { candidates: 1, cells: 100, steps: 100, chunks: 2 } });
    const clear = () => ({ status: 'clear', reason: 'clear', solution: { angle: -1.4, power: .4 }, candidates: [],
        obstruction: null, warnings: [], work: { candidates: 1, cells: 100, steps: 100, chunks: 2 } });
    const plan = fn => {
        tank.weapon.plan = async (request) => {
            const item = f.shop.items.find(i => i.template === state.equipped);
            calls.push({ item: item.id, request: clone(request) });
            return fn(item, request, calls.length);
        };
    };
    return { ...f, p, target, tank, victim, pose, state, calls, candidate, refused, clear, plan };
}
async function main() {
    {
        const f = setup();
        f.plan(item => f.refused('material-drag-not-supported', item.id === 'heavy'
            ? [f.candidate(500, -.8, .7), f.candidate(8, -1.123, .617)] : [f.candidate(90, -1.6, .5)]));
        assert.equal(await f.api.planCpuShot(f.p, 9), true);
        assert.equal(f.calls.length, 2, 'Try every normal owned option before falling back');
        assert.equal(f.p.weaponId, 'heavy');
        assert.match(f.p.tactic, /uncertain/);
        assert.equal(f.tank.blackboard.get('custom.aimAngle'), -1.123);
        assert.equal(f.tank.blackboard.get('custom.aimPower'), .617);
        assert.equal(f.tank.blackboard.get('custom.aimRefusal'), 'material-drag-not-supported');
        assert.equal(f.tank.blackboard.get('custom.aimPlan').status, 'refused', 'Never relabel uncertainty as a clear plan');
        assert.equal(f.tank.blackboard.get('custom.aiDecision').status, 'uncertain');
        assert.equal(f.api.bank.players.alpha.stock.heavy, 3);
        assert.equal(f.m.attack, null);
        f.talus.ui.worldText = () => { };
        f.tank.setVelocity = () => { };
        let fired = 0;
        const rocket = { id: 81, exists: true, snapshot: () => ({ x: 6030, y: 630, vx: 400, vy: -200 }) };
        f.tank.weapon.fire = () => { fired++; f.emit('projectile.launch', { projectileId: 81, projectile: rocket, owner: f.tank }); return true; };
        f.api.cpuAimed({ id: f.p.entityId, turn: 9 });
        await f.api.fire();
        f.api.tickPresentation();
        const started = f.talus.sim.clock;
        f.talus.sim.clock = started + 1.499;
        f.api.tickPresentation();
        assert.equal(fired, 0);
        assert.equal(f.api.bank.players.alpha.stock.heavy, 3);
        f.talus.sim.clock = started + 1.5;
        f.api.tickPresentation();
        assert.equal(fired, 1);
        assert.equal(f.api.bank.players.alpha.stock.heavy, 2, 'Only the ordinary actual launch debits ammunition');
    }
    {
        const f = setup();
        f.plan(item => item.id === 'heavy' ? f.refused() : f.clear());
        assert.equal(await f.api.planCpuShot(f.p, 9), true);
        assert.equal(f.p.weaponId, 'standard');
        assert.equal(f.tank.blackboard.get('custom.aimPlan').status, 'clear');
    }
    {
        const f = setup(), at = { x: f.tank.position.x + 200, y: 620, kind: 'terrain', time: .3, element: 9 };
        f.talus.world.raycast = () => at;
        f.plan((item, request) => !request.targetEntityId ? f.clear() : item.id === 'heavy' ? f.refused()
            : { ...f.refused('obstructed', []), obstruction: at });
        assert.equal(await f.api.planCpuShot(f.p, 9), true);
        assert.equal(f.p.tactic, 'Open an observed firing lane');
        assert.equal(f.calls.at(-1).request.targetEntityId, undefined);
    }
    for (const reason of ['cell-budget', 'step-budget', 'candidate-budget', 'cancelled-or-owner-moved', 'cancelled',
        'saved-collision-unavailable', 'unloaded-bodies', 'target-unavailable']) {
        const f = setup();
        f.plan((item, request, n) => n === 1 ? f.refused() : f.refused(reason));
        assert.equal(await f.api.planCpuShot(f.p, 9), false, reason + ' cannot authorize a fallback or reuse a prior uncertain result');
        assert.equal(f.api.bank.players.alpha.stock.heavy, 3);
    }
    const corruptions = [c => { c.angle = NaN; }, c => { c.power = Infinity; }, c => { c.power = -1; }, c => { c.power = 1.01; },
        c => { c.angle = 99; }, c => { c.obstruction.x = '6400'; }, c => { c.obstruction.time = -1; },
        c => { c.obstruction.time = 31; }, c => { c.reason = 'obstructed'; }, c => { c.obstruction.kind = 'body'; },
        c => { c.obstruction.reason = 'saved-collision-unavailable'; }];
    for (const corrupt of corruptions) {
        const f = setup(), candidate = f.candidate();
        corrupt(candidate);
        f.plan(() => f.refused('material-drag-not-supported', [candidate]));
        assert.equal(await f.api.planCpuShot(f.p, 9), false, 'Malformed or differently refused candidate is not a usable native arc');
    }
    for (const change of [f => { f.tank.position.x += 5; }, f => { f.pose.angle += .1; }, f => { f.pose.vy = 5; },
        f => { f.tank.liveId = 901; }, f => { f.tank.residency = 'stored'; }, f => { f.victim.position.x += 5; },
        f => { f.victim.residency = 'unresolved'; }, f => { f.target.eliminated = true; }, f => { f.m.turnNumber++; }]) {
        const f = setup();
        f.plan((item, request, n) => {
            if (n === 1)
                return f.refused();
            change(f);
            return f.refused('obstructed', []);
        });
        assert.equal(await f.api.planCpuShot(f.p, 9), false, 'Recheck owner pose/root, durable target and turn after asynchronous surveys');
        assert.equal(f.api.bank.players.alpha.stock.heavy, 3);
    }
    {
        const f = setup();
        f.plan((item, request, n) => n === 1 ? f.refused() : f.refused('obstructed', []));
        const equip = f.tank.weapon.equip;
        f.tank.weapon.equip = template => f.calls.length >= 2 && template === f.shop.items.find(i => i.id === 'heavy').template ? false : equip(template);
        assert.equal(await f.api.planCpuShot(f.p, 9), false, 'Refused final weapon selection cannot use the saved candidate');
    }
    {
        const f = setup();
        f.plan(() => f.refused('deflection-fields', []));
        assert.equal(await f.api.planCpuShot(f.p, 9), true);
        assert.equal(f.p.tactic, 'Exploratory high arc through magnetic field');
        assert.equal(f.tank.blackboard.get('custom.aimRefusal'), 'deflection-fields');
    }
    console.log('PASS: native drag-only feasible candidates stay explicitly uncertain; normal and demolition clear plans win; stale pose/target/root/weapon/turn and hard/corrupt refusals cannot fallback; magnetic probes preserved; 1.5s speech and launch-only stock debit unchanged');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
