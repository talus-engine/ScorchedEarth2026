// Game policy regression, not a claim of native trajectory/utility acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
function setup() { const f = fixture(); f.api.setPersonas(structuredClone(personas)); f.m.cpuSkill = 'persona'; f.m.turnNumber = 9; f.talus.world.raycast = () => null; f.talus.world.groundY = () => null; for (const e of f.actors.values()) {
    e.liveId = Number(e.id.slice(-1)) + 1;
    e.y = 650;
} return f; }
const clear = { status: 'clear', reason: 'clear', warnings: ['evolving-air-fields-not-predicted'], solution: { angle: -1.4, power: .43 }, work: { candidates: 1, steps: 200, cells: 1000, chunks: 2 } };
async function main() {
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), w = f.api.bank.players.alpha;
        p.personaId = 'lucky';
        f.m.phase = 'ready';
        f.api.cpuShopping();
        assert.equal(w.stock['machine-gun'], 4);
        assert.equal(w.cash, 350); // fuel disabled in fixture; battery purchased
        f.m.phase = 'turn';
        let template;
        e.weapon.equip = t => (template = t, true);
        e.weapon.plan = async () => clear;
        assert.equal(await f.api.planCpuShot(p, 9), true);
        assert.equal(p.weaponId, 'machine-gun', 'Purchased fixed-speed gun wins a suitable surveyed corridor even beyond400px');
        assert.equal(w.stock['machine-gun'], 4, 'Selection/planning cannot debit ammunition');
        assert.equal(template, f.shop.items.find(i => i.id === 'machine-gun').template);
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), w = f.api.bank.players.alpha, profiles = structuredClone(personas);
        p.personaId = 'lucky';
        profiles.personas[0].strategy.weaponPreferences = ['shotgun', 'flamethrower', 'homing-rocket', 'heavy', 'standard'];
        f.api.setPersonas(profiles);
        for (const id of ['shotgun', 'flamethrower', 'homing-rocket', 'heavy'])
            w.stock[id] = 2;
        const eq = [];
        e.weapon.equip = t => (eq.push(t), true);
        e.weapon.plan = async () => clear;
        assert.equal(await f.api.planCpuShot(p, 9), true);
        assert.equal(p.weaponId, 'heavy', 'Unsupported top preferences cannot hide a supported fourth option');
        const decision = e.blackboard.get('custom.aiDecision');
        assert.equal(decision.skipped.filter(s => s.reason.startsWith('native-forecast-')).length, 3);
        assert.equal(w.stock.shotgun, 2);
        assert.equal(w.stock.flamethrower, 2);
        assert.equal(w.stock['homing-rocket'], 2);
    }
    {
        const f = setup(), p = f.m.roster[0], w = f.api.bank.players.alpha, profiles = structuredClone(personas);
        p.personaId = 'lucky';
        f.m.phase = 'ready';
        profiles.personas[0].strategy.weaponPreferences = ['flamethrower', 'shotgun', 'heavy', 'standard'];
        profiles.personas[0].strategy.utilityPreferences = [];
        f.api.setPersonas(profiles);
        f.api.cpuShopping();
        assert.equal(w.stock.heavy, 3);
        assert.equal(w.stock.flamethrower, undefined);
        assert.equal(w.stock.shotgun, undefined);
        const spent = w.spent;
        f.api.cpuShopping();
        assert.equal(w.spent, spent, 'Shopping receipt remains idempotent');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), w = f.api.bank.players.alpha;
        p.personaId = 'lucky';
        w.stock['machine-gun'] = 2;
        p.impacts = [{ turn: 8, weapon: 'machine-gun', targetId: 'unrelated', origin: e.position, target: { x: 1, y: 1 }, damageBefore: 0, dx: 0, dy: 0 }];
        e.weapon.plan = async () => clear;
        assert.equal(await f.api.planCpuShot(p, 9), true);
        assert.equal(p.weaponId, 'machine-gun', 'A miss against another opponent cannot mothball a paid gun');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), w = f.api.bank.players.alpha;
        p.personaId = 'mole';
        w.stock.riot = 2;
        f.talus.world.raycast = () => ({ x: e.x + 200, y: 620 });
        const requests = [];
        e.weapon.plan = async (r) => {
            requests.push(r);
            return r.targetEntityId !== undefined
                ? { status: 'refused', reason: 'obstructed', obstruction: { kind: 'terrain', x: e.x + 200, y: 620, time: .2, element: 9 }, work: { candidates: r.maxCandidates } }
                : clear;
        };
        assert.equal(await f.api.planCpuShot(p, 9), true);
        assert.equal(p.tactic, 'Open an observed firing lane');
        assert.equal(p.weaponId, 'riot');
        assert.equal(requests.at(-1).target.x, e.x + 200);
        assert.equal(requests.at(-1).targetEntityId, undefined);
        assert.equal(requests.at(-1).targetBodyId, undefined);
        assert.equal(requests.at(-1).goal, 'impact');
        assert.ok(requests.reduce((n, r) => n + r.maxCandidates, 0) <= personas.personas[1].strategy.candidateBudget);
        assert.equal(w.stock.riot, 2, 'Native demolition proposal also preserves ammo until accepted launch');
        assert.equal(e.blackboard.get('custom.indigoTarget').bodyId, null);
    }
    for (const kind of ['unknown', 'body']) {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        p.personaId = 'mole';
        f.talus.world.raycast = () => ({ x: e.x + 200, y: 620 });
        const requests = [];
        e.weapon.plan = async (r) => { requests.push(r); return { status: 'refused', reason: kind === 'unknown' ? 'material-drag-not-supported' : 'obstructed', obstruction: { kind, x: e.x + 200, y: 620, time: .2 }, work: { candidates: r.maxCandidates } }; };
        assert.equal(await f.api.planCpuShot(p, 9), false);
        assert.ok(requests.every(r => r.targetEntityId !== undefined && r.targetBodyId === undefined), 'Unknown physics/body contact is not relabelled terrain demolition');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), w = f.api.bank.players.alpha;
        p.personaId = 'lucky';
        f.shop.items.find(i => i.id === 'fuel-tank').enabled = true;
        const drives = [];
        for (const actor of f.actors.values()) {
            actor.snapshot = () => ({ x: actor.x, y: 650, vy: 0, angle: 0, alive: true });
            actor.controller.configureGroundDrive = config => { actor.controller.groundDrive = { config, fuel: 0, spent: 0 }; return { accepted: true }; };
            actor.controller.addGroundFuel = n => { actor.controller.groundDrive.fuel += n; return { accepted: true }; };
            actor.controller.removeGroundFuel = n => { actor.controller.groundDrive.fuel -= n; return { accepted: true }; };
            actor.controller.drive = n => { drives.push({ id: actor.id, request: n }); return { accepted: true }; };
            actor.runGraph = () => { };
        }
        f.m.phase = 'ready';
        f.api.cpuShopping();
        assert.equal(w.stock['fuel-tank'], 6);
        f.m.phase = 'turn';
        f.talus.world.raycast = () => ({ x: e.x + 50, y: 650 });
        f.talus.sleepTicks = async () => { f.talus.sim.clock += .1; };
        e.weapon.plan = async () => clear;
        await f.api.prepareCpuTurn(p, 9);
        assert.ok(drives.some(d => d.id === e.id && d.request < 0), 'Risk-taking Lucky uses purchased drive fuel to back out of an obstructed corridor');
        assert.equal(drives.at(-1).request, 0, 'Propulsion stops before planning/aiming');
        assert.equal(w.stock['fuel-tank'], 6, 'A requested drive without native work telemetry does not invent a fuel debit');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        p.personaId = 'faultline';
        f.talus.world.raycast = () => ({ x: e.x + 20, y: 650 });
        const requests = [];
        e.weapon.plan = async (r) => { requests.push(r); return { status: 'refused', reason: 'obstructed', obstruction: { kind: 'terrain', x: e.x + 20, y: 650, time: .01 }, work: { candidates: r.maxCandidates } }; };
        assert.equal(await f.api.planCpuShot(p, 9), false);
        assert.ok(requests.every(r => r.targetEntityId !== undefined && r.targetBodyId === undefined), 'No reckless close blast just to force consumption');
    }
    console.log('PASS: automatic purchase→owned selection, capability filtering before ranking/shopping, truthful skipped inventory, recent target-local feedback, native re-surveyed demolition, bounded total candidates, and refusal/stock safety');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
