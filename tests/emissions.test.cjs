const { loadGame } = require('./support/runtime.cjs');
// Native-contract doubles exercise authored scheduling/resource ownership.
// These tests do not claim real offscreen particle or projectile acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const shop = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/shop.json'), 'utf8'));
function scene(saved) {
    const control = { ready: false, empty: false, particles: 'simulated', refusal: null, reject: null, explosion: { carvedCells: 0 }, placed: 8 };
    const anchors = [], launches = [], sprays = [], explosions = [], records = [], pending = [], terrain = [];
    let api, nextId = 1, attempts = 0;
    const actor = { id: 'instance@emitter', residency: 'live', alive: true, position: { x: 5000, y: 600 },
        get exists() { return !['destroyed', 'unresolved'].includes(this.residency); }, get isLive() { return this.residency === 'live'; },
        blackboard: { get: () => 45 }, despawn() { this.residency = 'destroyed'; },
    };
    const shots = new Map([[1, { id: 1, exists: true }]]);
    const specCopy = spec => ({ ...spec, ...(spec.follow ? { follow: typeof spec.follow === 'string' ? spec.follow : spec.follow.id } : {}) });
    const talus = { editor: { available: false }, on() { }, after() { },
        sim: { clock: 0, paused: false, anchor(spec) {
                attempts++;
                if (control.reject)
                    throw Object.assign(Error(control.reject + ': reserve/test refusal'), { code: control.reject });
                const anchor = { spec: specCopy(spec), active: true, updates: 0,
                    get chunks() { return control.empty ? [] : [{ x: 0, y: 0 }]; }, get loaded() { return control.ready ? this.chunks.length : 0; },
                    get particles() { return control.particles; }, get refused() { return control.refusal; },
                    update(next) { if (control.reject)
                        throw Object.assign(Error(control.reject + ': update refusal'), { code: control.reject }); this.spec = specCopy(next); this.updates++; },
                    release() { this.active = false; },
                };
                anchors.push(anchor);
                return anchor;
            } }, entities: { get: () => actor },
        world: { spawnParticles(spec) { sprays.push(spec); return control.placed; },
            explode(spec) { explosions.push(spec); return control.explosion; },
            terrainWork: async (spec) => { terrain.push(spec); return { status: 'completed', added: 123 }; },
        }, projectiles: { get: id => shots.get(id), launch(spec) {
                launches.push(spec);
                const shot = { id: ++nextId, exists: true,
                    detonate() { this.exists = false; for (const job of api.match.chaos.jobs) {
                        job.projectileIds = job.projectileIds.filter(id => id !== this.id);
                        job.ended++;
                    } },
                };
                shots.set(shot.id, shot);
                if (api.match.attack) {
                    api.match.attack.ids[shot.id] = {};
                    api.match.attack.launched++;
                }
                return shot;
            } }, ui: { banner() { } }, game: { setSaveBarrier() { } }, state: { set() { }, setJson() { } },
    };
    const context = { talus, records, pending };
    const ctx = loadGame(context.talus, context).context;
    context.api = { tickAttack: ctx.combat.tickAttack, tickChaos: ctx.chaos.tickChaos, finishEmission: ctx.chaos.finishEmission, emissionRegionReady: ctx.residency.emissionRegionReady, releaseEmissionRegions: ctx.residency.releaseEmissionRegions, fail: ctx.session.fail, load(m, s) {
            ctx.state.match = m;
            ctx.state.market = s;
            ctx.state.chaosCatalog = { effects: [] };
            ctx.session.persist = () => { };
            ctx.menus.publish = () => { };
            ctx.menus.input = () => { };
            ctx.presentation.cancelArcade = () => { };
            ctx.session.run = fn => { context.pending.push(fn()); };
            ctx.turns.settle = async () => { ctx.state.match.phase = 'settling'; };
        }, effect(fx) { ctx.state.chaosCatalog.effects = [fx]; }, get match() { return ctx.state.match; }, get regions() { return ctx.state.emissionRegions.size; }
    };
    api = context.api;
    api.load(saved || { phase: 'flight', roster: [{ entityId: actor.id, name: 'Pilot', eliminated: false }],
        attack: null, presentation: { active: null, queue: [] }, chaos: { jobs: [], rng: 719, quiet: 0 } }, shop);
    function burst() {
        api.match.attack = { owner: actor.id, item: 'machine-gun', rootId: 1, emitted: 1, ids: { 1: {} },
            launchClock: talus.sim.clock, launched: 1, ended: 0, pending: [], tasks: 0 };
        return api.match.attack;
    }
    function death(fx = { id: 'furnace-test', enabled: true, mode: 'spray', duration: .3, interval: .1,
        count: 8, element: 'FIRE', speed: 180, spread: .8, finishBlast: 48 }) {
        actor.alive = false;
        api.effect(fx);
        const job = { id: 1, owner: actor.id, name: 'Pilot', effect: fx.id, x: 5000, y: 600, elapsed: 0, emitted: 0,
            particles: 0, livePulses: 0, projectileIds: [], launched: 0, ended: 0, started: false, emissionDone: false };
        api.match.chaos.jobs = [job];
        return { job, fx };
    }
    return { api, actor, control, talus, anchors, launches, sprays, explosions, records, shots, pending, terrain, burst, death,
        get attempts() { return attempts; }, step(seconds, which = 'attack') { talus.sim.clock += seconds; if (which === 'attack')
            api.tickAttack();
        else
            api.tickChaos(seconds); },
    };
}
async function main() {
    {
        const f = scene(), a = f.burst(), rng = f.api.match.chaos.rng;
        f.actor.residency = 'stored';
        f.step(.1);
        assert.equal(a.emitted, 1);
        assert.equal(f.launches.length, 0);
        assert.equal(f.api.match.chaos.rng, rng);
        assert.equal(f.anchors[0].spec.follow, f.actor.id);
        assert.equal(f.anchors[0].spec.halfWidth, 64);
        f.control.ready = true;
        f.actor.residency = 'frozen';
        f.step(2);
        assert.equal(a.emitted, 1, 'Loaded but frozen does not count as a simulated shooter');
        f.actor.residency = 'live';
        f.step(.081);
        assert.equal(a.emitted, 2, 'Stored burst resumes with all remaining rounds intact');
        for (let n = 0; n < 10; n++)
            f.step(.081);
        assert.equal(a.emitted, 12);
        assert.equal(f.launches.length, 11);
        assert.equal(f.api.regions, 0);
        assert.equal(f.anchors[0].active, false);
        assert.ok(f.api.match.attack, 'Release the firing tank while its native independent shells are still alive');
        assert.ok(f.launches.every(s => s.independent === true));
        f.actor.residency = 'stored';
        f.step(1);
        assert.equal(f.attempts, 1, 'No shooter lease for the remaining flight');
    }
    {
        const f = scene(), a = f.burst();
        f.control.ready = true;
        f.step(.081);
        f.actor.alive = false;
        f.step(.081);
        assert.equal(a.emitted, 12);
        assert.equal(f.launches.length, 1);
        assert.equal(f.api.regions, 0);
    }
    {
        const f = scene(), a = f.burst();
        f.control.reject = 'REFUSED';
        const rng = f.api.match.chaos.rng;
        f.step(0);
        f.step(.1);
        assert.equal(f.attempts, 1, 'Reserve contention retries at a bounded cadence');
        assert.equal(a.emitted, 1);
        assert.equal(f.api.match.chaos.rng, rng);
        f.control.reject = null;
        f.control.ready = true;
        f.step(.2);
        assert.equal(a.emitted, 2);
        assert.equal(f.attempts, 2);
    }
    {
        const f = scene();
        f.burst();
        f.control.ready = true;
        f.control.empty = true;
        f.step(0);
        assert.equal(f.launches.length, 0, 'Empty claims are not ready merely because loaded and chunk count are both zero');
        assert.throws(() => f.step(10.01), /residency timed out/);
        assert.equal(f.api.regions, 0);
        assert.equal(f.anchors[0].active, false);
        const denied = scene();
        denied.burst();
        denied.control.reject = 'REFUSED';
        denied.step(0);
        assert.throws(() => denied.step(10.01), /REFUSED.*reserve\/test refusal/, 'The timeout retains the native refusal reason');
        const invalid = scene();
        invalid.burst();
        invalid.control.reject = 'BAD_ARGUMENT';
        assert.throws(() => invalid.step(0), /BAD_ARGUMENT/);
        invalid.api.fail(Error('invalid native lease'));
        assert.equal(invalid.api.regions, 0, 'Invalid requests fault rather than retrying');
    }
    {
        const f = scene(), { job } = f.death();
        f.actor.residency = 'stored';
        const rng = f.api.match.chaos.rng;
        f.step(1, 'chaos');
        assert.equal(job.elapsed, 0);
        assert.equal(job.started, false);
        assert.equal(job.emitted, 0);
        f.control.ready = true;
        f.actor.residency = 'live';
        f.control.particles = 'held';
        f.step(1, 'chaos');
        f.control.particles = 'partial';
        f.step(1, 'chaos');
        assert.equal(job.elapsed, 0);
        assert.equal(f.sprays.length, 0);
        assert.equal(f.api.match.chaos.rng, rng, 'Unavailable native regions never consume effect RNG');
        f.control.particles = 'simulated';
        f.step(.1, 'chaos');
        assert.equal(job.elapsed, .1);
        assert.equal(job.emitted, 2);
        f.actor.position = { x: 5050, y: 620 };
        f.control.ready = false;
        f.step(.5, 'chaos');
        assert.equal(job.elapsed, .1);
        assert.equal(job.emitted, 2, 'A moving wreck pauses while its new native region loads');
        f.control.ready = true;
        f.step(.1, 'chaos');
        f.step(.1, 'chaos');
        assert.equal(job.emitted, 3);
        assert.equal(f.sprays.at(-1).x, 5050);
        assert.equal(f.sprays.at(-1).y, 594);
        assert.equal(f.explosions.length, 1);
        assert.equal(f.explosions[0].radius, 48);
        assert.equal(f.anchors[0].spec.halfWidth, 64, 'The origin region contains the whole authored finale radius');
        assert.equal(job.particles, 24);
        assert.equal(job.emissionDone, true);
        assert.equal(f.api.regions, 0);
        assert.equal(f.api.match.chaos.jobs.length, 0);
        assert.equal(f.actor.residency, 'destroyed');
    }
    {
        const f = scene(), { job, fx } = f.death();
        f.control.ready = true;
        f.step(.05, 'chaos');
        f.actor.residency = 'destroyed';
        f.actor.position = null;
        f.step(.05, 'chaos');
        assert.ok(f.anchors[0].spec.rect, 'An actually destroyed wreck leaves a native region at its last known physical effect point');
        assert.equal(f.anchors[0].updates, 1);
        f.control.explosion = null;
        assert.throws(() => f.api.finishEmission(job, fx), /Death finale refused/);
        assert.equal(job.emissionDone, false);
        f.api.fail(Error('finale refused'));
        assert.equal(f.anchors[0].active, false);
        assert.equal(f.api.regions, 0);
    }
    {
        const f = scene(), { job } = f.death();
        f.control.ready = true;
        f.control.placed = 0;
        assert.throws(() => f.step(.05, 'chaos'), /placed no particles/);
        assert.equal(job.emitted, 0);
        assert.equal(job.particles, 0, 'An empty native spray is never recorded as a successful pulse');
        f.api.fail(Error('empty spray'));
        assert.equal(f.api.regions, 0);
    }
    {
        const f = scene(), { job } = f.death({ id: 'shells', enabled: true, mode: 'shells', count: 2, interval: .1, duration: .2, pattern: 'rain', speed: 200 });
        f.control.ready = true;
        f.control.particles = 'held';
        f.step(.1, 'chaos');
        assert.equal(job.emitted, 2);
        assert.equal(job.emissionDone, true);
        assert.equal(f.api.regions, 0);
        assert.equal(f.launches.length, 2);
        assert.ok(f.launches.every(s => s.independent === true));
        assert.equal(f.api.match.chaos.jobs.length, 1, 'Native children finish separately from the released origin lease');
        f.step(.1, 'chaos');
        assert.equal(f.attempts, 1);
    }
    {
        const f = scene(), { job } = f.death({ id: 'nuke', enabled: true, mode: 'brush', duration: 0, element: 'FIRE', radiusMin: 96, radiusMax: 96 });
        f.control.reject = 'BAD_ARGUMENT';
        f.step(.01, 'chaos');
        await Promise.all(f.pending);
        assert.equal(f.attempts, 0, 'A brush uses terrainWork residency without a second nuke-sized anchor');
        assert.equal(f.terrain.length, 1);
        assert.equal(job.particles, 123);
        assert.equal(job.emissionDone, true);
    }
    {
        const before = scene(), { job, fx } = before.death();
        before.control.ready = true;
        before.step(.1, 'chaos');
        const saved = structuredClone(before.api.match), after = scene(saved);
        after.api.effect(fx);
        after.actor.alive = false;
        after.actor.residency = 'stored';
        after.step(1, 'chaos');
        const restored = after.api.match.chaos.jobs[0];
        assert.equal(restored.emitted, job.emitted);
        assert.equal(restored.elapsed, job.elapsed);
        assert.equal(after.sprays.length, 0);
        assert.equal(after.attempts, 1, 'Reload recreates only the unfinished emission lease and waits');
        after.control.ready = true;
        after.actor.residency = 'live';
        after.step(.1, 'chaos');
        after.step(.1, 'chaos');
        assert.equal(after.sprays.length, 1, 'Already emitted pulses are not replayed');
        assert.equal(after.explosions.length, 1);
        assert.equal(after.api.regions, 0);
    }
    const flags = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/chaos.json'), 'utf8'));
    assert.ok(flags.effects.filter(fx => fx.mode === 'spray').every(fx => !fx.enabled), 'Existing native API gates remain disabled');
    console.log('PASS: burst restoration without truncation, no whole-flight shooter pin, genuine death cancellation, bounded reserve/loading/particle readiness, immutable waiting RNG/emission counts, moving wrecks, finite finale scope, failure cleanup, independent shell/brush ownership and resumed emission without replay');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
