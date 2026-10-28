// Exercise actual game dialogue/elimination helpers against durable parked
// and gone handles. Camera-arrival timing remains separate native acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
function scene(residency) {
    const f = fixture(), p = f.m.roster[1], tank = f.actors.get(p.entityId);
    const texts = [], factionHolds = [], controllerWrites = [], boardWrites = [];
    f.api.setPersonas(personas);
    p.personaId = personas.personas[0].id;
    f.talus.factions = { holdSpeech: (owner, held) => factionHolds.push({ owner, held }),
        pool: () => ({ status: 'ready', lines: [{ id: 'test-death', text: 'The rest is silence.' }] }) };
    f.talus.ui.worldText = (id, spec) => texts.push({ id, spec });
    f.talus.ui.nameplate = () => { };
    f.api.checkRoster(); // Capture the actual known live pose before residency changes.
    const cached = structuredClone(p.lastKnownPosition);
    tank.residency = residency;
    tank.alive = false;
    const nativeSet = tank.blackboard.set;
    tank.blackboard.set = (key, value) => { assert.ok(tank.can('blackboard.set'), 'No blackboard write without native data access'); boardWrites.push(key); nativeSet(key, value); };
    Object.defineProperty(tank, 'controller', { get() {
            assert.ok(tank.isLive || tank.isFrozen, 'No loaded-only controller access on a parked/gone tank');
            return { state: null, holdPose(seconds) { controllerWrites.push(seconds); return { accepted: true, seconds }; } };
        } });
    return { ...f, p, tank, cached, texts, factionHolds, controllerWrites, boardWrites };
}
function wordsAndChaos(f) {
    f.api.tickPresentation();
    assert.equal(f.texts.at(-1).spec.text, 'The rest is silence.');
    assert.equal(f.factionHolds[0].owner, f.p.entityId, 'Faction speech is keyed by durable identity, including after native destruction');
    f.talus.sim.clock += 3;
    f.api.tickPresentation();
    assert.equal(f.texts.at(-1).spec, null);
    assert.equal(f.factionHolds.at(-1).owner, f.p.entityId);
    assert.equal(f.factionHolds.at(-1).held, false);
    assert.equal(f.m.chaos.jobs.length, 1);
}
{
    const f = scene('stored');
    assert.equal(f.tank.can('blackboard.set'), true);
    assert.equal(f.tank.can('controller'), false);
    f.api.checkRoster();
    assert.equal(f.p.eliminated, true);
    assert.equal(f.controllerWrites.length, 0);
    f.api.tickPresentation();
    assert.equal(f.m.presentation.active.stage, 'centering');
    assert.equal(f.texts.length, 0, 'Stored death waits for the actual body to restore before speech');
    assert.equal(f.boardWrites.length, 0);
    assert.equal(f.controllerWrites.length, 0);
    f.tank.residency = 'frozen';
    f.api.tickPresentation();
    const text = f.texts.at(-1).spec;
    assert.equal(text.entity, f.tank, 'The restored durable handle retains its authoritative position');
    assert.deepEqual(structuredClone(text.at), f.cached);
    f.talus.sim.clock += 3;
    f.api.tickPresentation();
    const fx = f.game.context.state.chaosCatalog.effects.find(fx => fx.id === f.m.chaos.jobs[0].effect);
    assert.deepEqual(f.controllerWrites, [120, fx.duration + 20], 'Speech transfers its finite pose hold to the physical death effect without an unheld gap');
    assert.deepEqual(f.boardWrites, ['custom.lastQuip', 'custom.deathChaos'], 'Available native blackboards retain the narration and effect receipts');
    assert.equal(f.m.chaos.jobs[0].x, f.cached.x);
    assert.equal(f.m.chaos.jobs[0].y, f.cached.y);
}
{
    const f = scene('destroyed');
    assert.equal(f.tank.position, null);
    assert.equal(f.tank.snapshot(), null);
    assert.equal(f.tank.can('blackboard.set'), false);
    f.api.checkRoster();
    assert.equal(f.p.eliminated, true);
    const cue = f.m.presentation.queue[0];
    assert.equal(cue.x, f.cached.x);
    assert.equal(cue.y, f.cached.y, 'Destroyed tank keeps the previously observed physical location');
    wordsAndChaos(f);
    const text = f.texts.find(row => row.spec)?.spec;
    assert.equal(text.entity, null);
    assert.deepEqual(structuredClone(text.at), f.cached, 'Independent text falls back to a world point when the native body is gone');
    assert.equal(f.boardWrites.length, 0);
    assert.equal(f.controllerWrites.length, 0);
    assert.equal(f.m.chaos.jobs[0].x, f.cached.x);
    assert.equal(f.m.chaos.jobs[0].y, f.cached.y);
    f.api.eliminate(f.p, 'duplicate');
    assert.equal(f.m.chaos.jobs.length, 1);
    assert.equal(f.p.cashBreakdown.death, 100);
}
{
    const f = scene('unresolved'), at = { x: 8765, y: 444 };
    f.api.checkRoster();
    assert.equal(f.p.eliminated, false, 'Unresolved alone cannot invent a death');
    f.api.eliminate(f.p, 'native-death-event', null, at);
    wordsAndChaos(f);
    const text = f.texts.find(row => row.spec)?.spec;
    assert.equal(text.entity, null);
    assert.deepEqual(structuredClone(text.at), at, 'An explicit native death event point wins over the older cached position');
    assert.equal(f.boardWrites.length, 0);
    assert.equal(f.controllerWrites.length, 0);
    assert.equal(f.m.chaos.jobs[0].x, at.x);
    assert.equal(f.m.chaos.jobs[0].y, at.y);
}
{
    const f = scene('frozen');
    assert.equal(f.tank.isFrozen, true);
    assert.equal(f.tank.can('controller'), false);
    assert.equal(f.tank.can('weapon'), true);
    f.api.checkRoster();
    wordsAndChaos(f);
    const fx = f.game.context.state.chaosCatalog.effects.find(fx => fx.id === f.m.chaos.jobs[0].effect);
    assert.deepEqual(f.controllerWrites, [120, fx.duration + 20], 'The specific native holdPose contract allows a loaded frozen hull to transfer its finite pose hold to the effect');
}
console.log('PASS: parked death waits for restoration, destroyed/unresolved point fallback without unavailable blackboard/controller calls, durable faction speech keys, cached/native-event location precedence, finite frozen pose holds and duplicate-death safety');
