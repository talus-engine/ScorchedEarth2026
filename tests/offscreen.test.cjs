// Game-side durable target/bounds policy. This does not simulate native saved
// collision geometry or claim native camera/flight behavior.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
function setup() {
    const f = fixture();
    f.api.setPersonas(structuredClone(personas));
    f.m.cpuSkill = 'persona';
    f.m.turnNumber = 9;
    f.talus.world.raycast = () => null;
    f.talus.world.groundY = () => null;
    for (const [id, e] of f.actors) {
        e.liveId = Number(id.slice(-1)) + 1;
        e.residency = 'live';
        e.y = 650;
        e.snapshot = () => e.residency === 'unresolved' || e.residency === 'destroyed' ? null
            : { id, liveId: e.liveId, residency: e.residency, x: e.x, y: e.y, health: e.health, alive: e.alive };
    }
    return f;
}
async function main() {
    {
        const f = setup(), [a, b] = f.m.roster, tank = f.actors.get(a.entityId), target = f.actors.get(b.entityId);
        target.isLive = false;
        target.residency = 'stored';
        target.liveId = null;
        target.x = 11000;
        assert.equal(f.api.selectTarget(a, b.entityId), true, 'A stored opponent is selectable');
        let ref = tank.blackboard.get('custom.indigoTarget');
        assert.equal(ref.entityId, b.entityId);
        assert.equal(ref.x, 11000);
        assert.equal(ref.bodyId, null);
        target.liveId = 731;
        target.isLive = true;
        target.residency = 'live';
        f.api.selectTarget(a, b.entityId);
        ref = tank.blackboard.get('custom.indigoTarget');
        assert.equal(ref.bodyId, null);
        assert.equal(ref.entityId, b.entityId, 'Restoration preserves durable targeting without caching a numeric root ID');
        target.residency = 'unresolved';
        assert.equal(f.api.selectTarget(a, b.entityId), false);
        assert.equal(a.targetId, b.entityId, 'A temporary absence does not silently choose a different enemy');
        target.residency = 'stored';
        target.alive = false;
        assert.equal(f.api.selectTarget(a, b.entityId), false, 'A known dead stored body is not a living target');
    }
    {
        const f = setup(), [a, b] = f.m.roster, tank = f.actors.get(a.entityId), target = f.actors.get(b.entityId);
        a.personaId = 'lucky';
        target.isLive = false;
        target.residency = 'stored';
        target.liveId = null;
        target.x = 11000;
        const requests = [], before = structuredClone(f.api.bank.players.alpha);
        tank.weapon.plan = async (r) => {
            requests.push(r);
            return { status: 'refused', reason: 'unloaded-bodies', warnings: [], solution: null,
                obstruction: { kind: 'unknown', reason: 'unloaded-bodies', x: 10000, y: 650, time: 3 },
                work: { candidates: r.maxCandidates, steps: 1, cells: 1, chunks: 1 } };
        };
        assert.equal(await f.api.planCpuShot(a, 9), false);
        assert.ok(requests.length > 0, 'Stored targets reach native planning instead of disappearing from CPU candidates');
        assert.ok(requests.every(r => r.target.x === 11000 && r.targetEntityId === b.entityId && r.targetBodyId === undefined && r.terrain === 'materialize'));
        assert.deepEqual(structuredClone(f.api.bank.players.alpha), before, 'Unknown saved geometry does not spend stock or fake a successful shot');
        const decision = tank.blackboard.get('custom.aiDecision');
        assert.ok(decision.trials.every(t => t.reason === 'unloaded-bodies'));
    }
    {
        const f = setup(), [a, b] = f.m.roster, tank = f.actors.get(a.entityId), target = f.actors.get(b.entityId);
        a.personaId = 'lucky';
        tank.weapon.plan = async () => {
            target.residency = 'unresolved';
            return { status: 'clear', reason: 'clear', warnings: [], solution: { angle: -1.4, power: .4 },
                work: { candidates: 1, steps: 1, cells: 1, chunks: 1 } };
        };
        assert.equal(await f.api.planCpuShot(a, 9), false, 'A target lost during an asynchronous survey invalidates the game decision');
        assert.equal(a.plannedTurn, undefined);
    }
    console.log('PASS: stored selection, restore identity, unresolved/dead exclusion, truthful native refusal, async target loss, full-map bounds, unchanged spawn/poses, full-map bounds');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
