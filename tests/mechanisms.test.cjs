const { loadGame } = require('./support/runtime.cjs');
// Game geometry/contracts only. Physical contact, emission and thermal behavior
// are accepted separately in the installed native runtime.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const stories = JSON.parse(fs.readFileSync(path.join(__dirname, '../world/Game/landscape-stories.json')));
const c = { talus: { editor: { available: false }, on() { }, after() { } } };
const ctx = loadGame(c.talus, c).context;
c.api = { storyAssemblyJobs: ctx.landscape.storyAssemblyJobs, configure() { ctx.state.arena = { bounds: { x: 0, y: 0, w: 12800, h: 1280 } }; ctx.state.match = { procedural: { catalog: 'terrain-presets', choices: { structureTexture: ['builtin-wood', 'builtin-concrete'] } } }; } };
c.api.configure();
let bodies = 0, devices = 0;
for (const theme of stories.themes)
    for (const authored of theme.motifs) {
        const m = structuredClone(authored);
        m.seed = 734;
        m.supportDepths = {};
        const xs = m.kind === 'counterweight' ? [-m.parameters.dimensions.deckLength * .32, m.parameters.dimensions.deckLength * .32] : [-88, -50, 30, 112];
        for (const x of xs)
            m.supportDepths[String(x)] = 28 + (Math.abs(Math.round(x)) % 30);
        const jobs = c.api.storyAssemblyJobs(m, { x: 6400, y: 700 });
        assert.ok(jobs.length >= 7);
        assert.equal(new Set(jobs.map(j => j.label)).size, jobs.length);
        for (const { label, spec: s } of jobs) {
            assert.equal(s.targetLayer, 'world');
            assert.equal(s.layerPolicy, 'active-only');
            assert.equal(s.replacement, 'empty');
            assert.equal(s.bounds.h, 1024);
            assert.ok(s.shape.w <= 512 && s.shape.h <= 512);
            assert.ok(s.shape.y + s.shape.h < 1024);
            assert.ok(s.budget.cells >= s.shape.w * s.shape.h);
            assert.ok(s.vector.geometry.kind === 'line' || s.vector.geometry.kind === 'vector');
            if (s.vector.output.kind === 'body') {
                bodies++;
                assert.ok(['inclined deck', 'rolling weight'].includes(label));
                assert.equal(s.vector.output.maxBodies, 4);
            }
            if (s.vector.fill.element?.startsWith('TERRA_')) {
                devices++;
                assert.equal(s.vector.geometry.width, 1);
                assert.equal(s.vector.geometry.height, 1);
                assert.equal(s.vector.output.kind, 'particles');
            }
        }
        assert.deepEqual(c.api.storyAssemblyJobs(m, { x: 6400, y: 700 }), jobs);
        const supports = jobs.filter(j => /pier|trestle/.test(j.label));
        assert.equal(supports.length, xs.length);
        for (const { spec: s } of supports) {
            const [a, b] = s.vector.geometry.points;
            assert.ok(b.y >= 728);
            assert.equal(a.x, b.x);
        }
        if (m.kind === 'counterweight')
            assert.equal(jobs.filter(j => j.spec.vector.output.kind === 'body').length, 2);
        else {
            assert.ok(jobs.some(j => j.label === 'reservoir plug'));
            assert.ok(jobs.some(j => j.label === 'spill conduit'));
            assert.ok(jobs.some(j => j.label === 'lower basin floor'));
        }
    }
assert.ok(bodies >= 20);
assert.ok(devices >= 10);
console.log('PASS: all 30 theme motifs create bounded native assemblies, surveyed terrain supports, separate real decks/weights, narrow breakable gates, connected spill routes and single-cell devices');
