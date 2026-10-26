const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
function setup() { const f = fixture(); f.api.setPersonas(personas); f.m.cpuSkill = 'persona'; f.m.turnNumber = 1; f.talus.world.raycast = () => null; f.talus.world.groundY = () => null; for (const e of f.actors.values()) {
    e.liveId = Number(e.id.slice(-1)) + 1;
    e.y = 650;
} return f; }
const clear = { status: 'clear', reason: 'clear', warnings: ['evolving-air-fields-not-predicted'], solution: { angle: -1.4, power: .43 }, work: { candidates: 1, steps: 200, cells: 1000, chunks: 2 } };
async function main() {
    for (const persona of personas.personas) {
        const f = setup(), p = f.m.roster[0], w = f.api.bank.players.alpha;
        p.personaId = persona.id;
        f.m.phase = 'ready';
        f.api.cpuShopping();
        assert.ok(w.cash >= Math.floor(600 * persona.strategy.saveFraction), 'Persona respects savings reserve');
        assert.ok(w.spent > 0);
        const total = w.spent;
        f.api.cpuShopping();
        assert.equal(w.spent, total);
    }
    for (const remaining of [1, 2]) {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), profiles = structuredClone(personas);
        profiles.personas[0].strategy.candidateBudget = 8 + remaining;
        f.api.setPersonas(profiles);
        p.personaId = 'lucky';
        f.api.bank.players.alpha.stock['machine-gun'] = 2;
        const requests = [];
        e.weapon.plan = async (r) => {
            assert.ok(r.angleStep >= .25 && r.angleStep <= 30, 'Every request obeys the native angle-step contract');
            requests.push(r);
            return { status: 'refused', reason: 'obstructed', work: { candidates: r.maxCandidates } };
        };
        assert.equal(await f.api.planCpuShot(p, 1), false);
        assert.equal(requests.length, 2, 'Both paid weapon and fallback cannon receive a survey');
        assert.equal(requests.reduce((sum, r) => sum + r.maxCandidates, 0), 8 + remaining, 'Candidate allocation preserves the total budget');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        p.personaId = 'faultline';
        const w = f.api.bank.players.alpha;
        w.stock.crumble = 2;
        let req;
        f.talus.world.groundY = () => 675;
        e.weapon.plan = async (r) => (req = r, clear);
        assert.equal(await f.api.planCpuShot(p, 1), true);
        assert.equal(req.target.y, 673);
        assert.equal(req.targetEntityId, undefined);
        assert.equal(req.targetBodyId, undefined);
        assert.equal(p.tactic, 'Remove observed support');
        assert.equal(w.stock.crumble, 2, 'Read-only survey does not spend ammunition');
        assert.equal(e.blackboard.get('custom.decisionTurn'), 1);
        assert.ok(req.maxCandidates <= personas.personas[3].strategy.candidateBudget);
    }
    {
        const f = setup(), p = f.m.roster[0], t = f.m.roster[1], e = f.actors.get(p.entityId);
        p.personaId = 'lucky';
        p.impacts = [{ targetId: t.entityId, weapon: 'standard', origin: e.position, target: f.actors.get(t.entityId).position, dx: -40, dy: 10 }];
        let req;
        e.weapon.plan = async (r) => (req = r, clear);
        assert.equal(await f.api.planCpuShot(p, 1), true);
        assert.equal(req.target.x, f.actors.get(t.entityId).x, 'Unqualified observations do not bias the target');
        assert.equal(req.angleOffset || 0, 0);
        assert.equal(req.powerOffset, undefined);
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), t = f.actors.get(f.m.roster[1].entityId);
        p.personaId = 'lucky';
        f.api.bank.players.alpha.stock['machine-gun'] = 4;
        t.x = e.x + 120;
        t.y = 700;
        t.position = { x: t.x, y: t.y };
        let req;
        e.weapon.plan = async (r) => (req = r, clear);
        assert.equal(await f.api.planCpuShot(p, 1), true);
        assert.equal(p.weaponId, 'machine-gun');
        assert.equal(req.minElevation, 0);
        assert.equal(req.angleStep, .25);
        assert.ok(req.maxElevation >= 1);
        assert.equal(req.tolerance, 8);
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        p.personaId = 'domino';
        let resolve;
        e.weapon.plan = () => new Promise(r => resolve = r);
        const pending = f.api.planCpuShot(p, 1);
        f.m.turnNumber = 2;
        resolve(clear);
        assert.equal(await pending, false);
        assert.equal(e.blackboard.get('custom.decisionTurn'), undefined, 'Stale solve cannot own the next turn');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        let wake, resolve;
        e.weapon.plan = () => new Promise(r => resolve = r);
        f.talus.sleepTicks = () => new Promise(r => wake = r);
        const pending = f.api.planCpuShot(p, 1);
        f.talus.sim.paused = true;
        resolve(clear);
        await new Promise(r => setImmediate(r));
        assert.equal(e.blackboard.get('custom.decisionTurn'), undefined, 'Paused planning cannot advance the game or invalidate a save');
        f.talus.sim.paused = false;
        wake();
        assert.equal(await pending, true);
        assert.equal(e.blackboard.get('custom.decisionTurn'), 1);
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        p.personaId = 'kiloton';
        f.api.bank.players.alpha.stock.mirv = 2;
        const requests = [];
        e.weapon.plan = async (r) => { requests.push(r); return requests.length === 1 ? { status: 'refused', reason: 'obstructed', work: { candidates: 3 } } : clear; };
        assert.equal(await f.api.planCpuShot(p, 1), true);
        assert.equal(requests[0].goal, 'apex');
        assert.equal(p.weaponId, 'standard', 'Blocked MIRV falls back to owned cannon');
        assert.equal(f.api.bank.players.alpha.stock.mirv, 2);
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId);
        e.weapon.plan = async () => ({ status: 'refused', reason: 'deflection-fields', work: { candidates: 0 } });
        assert.equal(await f.api.planCpuShot(p, 1), true);
        assert.match(p.tactic, /Exploratory/);
        assert.equal(e.blackboard.get('custom.aimPlan'), null, 'Unsupported physics is never labelled a clear forecast');
    }
    {
        const f = setup();
        f.m.seriesId = 'series';
        f.m.seriesLength = 3;
        f.m.winner = 'Alpha';
        f.m.roster[0].damage = 75;
        f.m.roster[0].shots = 2;
        f.m.roster[0].hits = 1;
        const scores = {};
        f.api.scoreSeries(scores);
        f.api.scoreSeries(scores);
        assert.equal(scores.series.series.players.alpha.wins, 1);
        assert.equal(f.m.series.complete, false);
        f.talus.world.id = 'round-2';
        f.api.scoreSeries(scores);
        assert.equal(f.m.series.champion, 'Alpha');
        assert.equal(f.m.series.standings[0].shots, 4);
        f.m.biomeCycle = true;
        f.m.biomeRounds = 2;
        f.m.series.complete = false;
        f.m.round = 2;
        f.m.baseGeneration = { recipe: 'wfc', parameters: { density: 1 }, recipeParameters: { brush: { frequency: 2 } } };
        assert.equal(f.api.nextGeneration().recipe, 'brush');
        assert.equal(f.api.nextGeneration().parameters, undefined);
        assert.equal(f.api.nextGeneration().recipeParameters.brush.frequency, 2);
    }
    {
        const f = setup();
        const args = { humans: 0, computers: 16, turnSeconds: 30, namesText: '', personaSeed: 'same' };
        const a = f.api.validate(args), b = f.api.validate(args);
        assert.deepEqual(a.roster.map(p => p.templateId), b.roster.map(p => p.templateId));
        assert.equal(new Set(a.roster.map(p => p.templateId)).size, 16);
        assert.equal(new Set(a.roster.map(p => p.personaId)).size, 5);
    }
    console.log('PASS completion: persona budgets, swept-plan requests, support targeting, bounded impact feedback, stale-plan cancellation, MIRV fallback, honest magnetic guesses, idempotent series, biome groups, seeded unique palettes');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
