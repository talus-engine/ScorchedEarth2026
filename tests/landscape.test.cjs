const { loadGame } = require('./support/runtime.cjs');
// Native request/topology policy regression, not a substitute for physical
// simulation or the required before/after terrain screenshots.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const stories = read('world/Game/landscape-stories.json'), arena = read('world/Game/arena.json'), recipes = read('world/Game/generation.json');
const elements = read('world/Game/Presets/element-catalog.json').elements;
function scene(id, seed = 20261025, refuse = -1, mode = 'brush') {
    const calls = [], records = [], stages = [], barriers = new Map();
    const talus = {
        editor: { available: false }, on() { }, after() { }, elements: { list: () => elements },
        game: { setSaveBarrier: (id, why) => barriers.set(id, why) }, ui: { set() { } }, state: { setJson() { } },
        world: { terrainWork: async (spec) => {
                calls.push(structuredClone(spec));
                return calls.length === refuse ? { id: calls.length, status: 'refused', reason: 'capacity' }
                    : { id: calls.length, status: 'completed', accepted: 1, pixels: 0 };
            } },
    };
    const context = { talus, records, stages };
    const ctx = loadGame(context.talus, context).context;
    context.api = {
        storyMacroPlan: ctx.landscape.storyMacroPlan,
        storyMacroJobs: ctx.landscape.storyMacroJobs,
        generateStoryMacro: ctx.landscape.generateStoryMacro,
        configure(a, r, id, seed, mode) {
            ctx.state.arena = a;
            ctx.state.generationRecipes = r;
            ctx.generation.configureGeneration(mode);
            ctx.state.match = { seed, phase: 'deploying', generated: 0, roster: [], presentation: { active: null, queue: [] }, chaos: { jobs: [], rng: 987654321 },
                procedural: { version: 1, catalog: 'terrain-presets', hash: 'pinned-fixture', sites: [], completed: {}, receipts: [], story: { id, seed } } };
            ctx.menus.publish = () => { };
        },
        async arenaStages() {
            ctx.brushes.prepareClearance = async () => {
                if (ctx.state.match.procedural.completed.macro !== ctx.state.match.procedural.macro.jobs)
                    throw Error('Surface survey preceded macro geometry');
                stages.push('survey');
            };
            ctx.brushes.generateBrushDetails = async () => { stages.push('details'); };
            ctx.brushes.generateStructures = async () => { stages.push('structures'); };
            ctx.brushes.generateLivingArena = async () => { stages.push('growth'); };
            ctx.brushes.clearCombatSpace = async () => { stages.push('clearance'); };
            ctx.landscape.generateStoryMechanisms = async () => { stages.push('mechanisms'); };
            await ctx.brushes.generateBrushArena();
        },
        get match() { return ctx.state.match; }, get arena() { return ctx.state.arena; }, restore(m) { ctx.state.match = m; }
    };
    context.api.configure(structuredClone(arena), structuredClone(recipes), id, seed, mode);
    return { api: context.api, calls, records, stages, barriers };
}
function bbox(shape) {
    if (!shape.points)
        return { ...shape };
    const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y), pad = shape.width ? Math.ceil(shape.width / 2) + 1 : 1;
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}
async function main() {
    const signatures = new Set(), forms = new Set();
    for (const story of stories.themes) {
        const s = scene(story.id);
        await s.api.generateStoryMacro();
        const plan = s.api.match.procedural, macro = plan.macro;
        assert.equal(macro.storyId, story.id);
        assert.equal(plan.completed.macro, s.calls.length);
        assert.equal(macro.jobs, s.calls.length);
        assert.ok(s.calls.length < 250, 'Macro generation is a finite bounded job list');
        assert.ok(macro.nodes.length > 40 && macro.nodes.length < 90);
        const widths = macro.nodes.slice(1).map((p, i) => p.x - macro.nodes[i].x);
        assert.ok(widths.every(w => w > 0 && w <= 352));
        assert.ok(new Set(widths).size > 10, 'Profiles do not repeat equal-size tile mountains');
        const ys = macro.nodes.map(p => p.y);
        assert.ok(Math.max(...ys) - Math.min(...ys) > 140, 'Each story has meaningful unequal elevation');
        const central = macro.nodes.filter(p => p.x >= s.api.arena.combat.x && p.x <= s.api.arena.combat.x + s.api.arena.combat.w);
        assert.ok(central.length >= 5);
        assert.ok(central.every(p => p.y >= 704), 'Connected central air extends at least 704px above the ground profile');
        assert.ok(Math.max(...central.map(p => p.y)) - Math.min(...central.map(p => p.y)) > 12, 'Playable ground remains irregular');
        const jobs = s.api.storyMacroJobs();
        for (let n = 0; n < s.calls.length; n++) {
            const spec = s.calls[n], job = jobs[n], box = bbox(spec.shape);
            assert.equal(spec.kind, 'recipe');
            assert.equal(spec.layerPolicy, 'active-only');
            assert.equal(spec.targetLayer, 'world');
            assert.equal(spec.bounds.h, 1024);
            assert.equal(spec.bounds.x, s.api.arena.bounds.x);
            assert.ok(box.w <= 512 && box.h <= 512, job.form + ' exceeds native bounds');
            assert.ok(spec.budget.cells >= box.w * box.h);
            assert.ok(spec.budget.cells <= 262144);
            const ys = spec.shape.points?.map(p => p.y) || [spec.shape.y, spec.shape.y + spec.shape.h];
            assert.ok(Math.max(...ys) <= 1024, 'Every macro operation stays above the protected bottom tile');
            assert.ok(elements.some(e => e.name === job.element), 'Use actual native material names');
            if (job.element === 'EMPTY')
                assert.equal(spec.replacement, 'matching', 'Carving never paints empty sky');
            if (job.mixed) {
                const bands = spec.recipe.micro.noise.bands;
                assert.ok(bands.some(b => ['DIRT', 'SAND', 'GRAVEL', 'ASH', 'SNOW'].includes(b.element)), 'Macro core includes real loose material');
                assert.ok(bands[0].endPos < 1, 'Only the bottom foundation is pure solid stone');
            }
            if (!['substrate', 'upper-sky', 'profile-fill', 'profile-air'].includes(job.form)) {
                forms.add(job.form);
                assert.ok(box.x + box.w < s.api.arena.combat.x || box.x > s.api.arena.combat.x + s.api.arena.combat.w, 'Authored outer forms do not replace the central tank space');
            }
        }
        signatures.add(JSON.stringify({ nodes: macro.nodes.map(p => ({ x: p.x - s.api.arena.bounds.x, y: p.y })), forms: macro.forms, material: macro.material }));
        assert.equal(s.api.match.chaos.rng, 987654321, 'Macro geometry does not consume combat RNG');
        const same = scene(story.id);
        await same.api.generateStoryMacro();
        assert.deepEqual(same.calls, s.calls);
        const restored = scene(story.id);
        restored.api.restore(structuredClone(s.api.match));
        await restored.api.generateStoryMacro();
        assert.equal(restored.calls.length, 0, 'Completed macro terrain is not rebuilt on resume');
    }
    assert.equal(signatures.size, 10, 'All ten stories have distinct macro geometry');
    for (const form of ['buried-void', 'masonry-vault', 'reservoir-bowl', 'ruin-opening', 'quarry-bench', 'ice-rock-fissure', 'trench', 'basin'])
        assert.ok(forms.has(form), form);
    const other = scene('hanging-quarry', 73), base = scene('hanging-quarry', 74);
    assert.notDeepEqual(structuredClone(other.api.storyMacroPlan()), structuredClone(base.api.storyMacroPlan()), 'Different seeds change profile widths, elevations and forms');
    const failure = scene('last-pumping-station', 991, 4);
    await assert.rejects(() => failure.api.generateStoryMacro(), /macro 3: capacity/);
    assert.equal(failure.api.match.procedural.completed.macro, 3);
    assert.ok(failure.barriers.get('match-sequence'));
    const retry = scene('last-pumping-station', 991);
    retry.api.restore(structuredClone(failure.api.match));
    await retry.api.generateStoryMacro();
    const whole = scene('last-pumping-station', 991);
    await whole.api.generateStoryMacro();
    assert.deepEqual(retry.calls, whole.calls.slice(3), 'Retry keeps exact persisted geometry and committed prefix');
    const changed = scene('last-pumping-station', 991);
    changed.api.restore(structuredClone(failure.api.match));
    changed.api.match.procedural.macro.nodes[0].y++;
    await assert.rejects(() => changed.api.generateStoryMacro(), /no longer matches/);
    assert.equal(changed.calls.length, 0);
    const old = scene('last-pumping-station');
    old.api.match.procedural.sites = [{ x: 6400, ground: 640 }];
    await assert.rejects(() => old.api.generateStoryMacro(), /before decoration/);
    assert.equal(old.calls.length, 0);
    const zone = scene('drowned-cathedral', 101, -1, 'verdant-reach');
    await zone.api.generateStoryMacro();
    assert.equal(zone.api.arena.bounds.x, 0);
    assert.ok(zone.calls.every(s => s.bounds.x === 0 && s.bounds.h === 1024));
    const shallow = scene('drowned-cathedral'), shallowPlan = shallow.api.storyMacroPlan();
    shallowPlan.forms = ['vault', 'ruin'].map((kind, n) => ({ kind, x: 17000 + n * 384, ground: 416, width: 192, depth: 80, seed: 0 }));
    const shallowJobs = shallow.api.storyMacroJobs(), vault = shallowJobs.find(j => j.form === 'masonry-vault').shape.points;
    assert.ok(vault[2].y < vault[1].y && vault[1].y < vault[0].y, 'A high shelf keeps its shallow arch opening upright');
    const window = shallowJobs.find(j => j.form === 'ruin-opening').shape.points;
    assert.ok(Math.max(window[0].y, window[1].y) < Math.min(window[2].y, window[3].y), 'A shallow ruin opening does not cross its own polygon');
    console.log('PASS: ten distinct native macro profiles/forms, uneven central ground with connected air, foreground/foundation bounds, mixed materials, <=512 jobs, finite ordering, persisted retry and unchanged completed terrain');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
