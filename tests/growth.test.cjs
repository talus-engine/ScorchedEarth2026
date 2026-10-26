/** Verify bounded planting and saved progress against actual authored presets. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { scene } = require('./generation.test.cjs');
const read = file => JSON.parse(fs.readFileSync('world/Game/' + file, 'utf8'));
const presets = read('Presets/living.json').presets;
const elements = read('Presets/element-catalog.json').elements;
const plain = value => JSON.parse(JSON.stringify(value));
function setup() {
    const f = scene(256337, -1, true);
    f.talus.elements.get = name => elements.find(e => e.name === name) || null;
    return f;
}
async function main() {
    const f = setup();
    await f.api.prepareProcedural();
    f.api.m.procedural.sites = Array.from({ length: 50 }, (_, n) => ({ x: 16512 + n * 256, ground: 640, size: 96 }));
    const saved = plain(f.api.m), choices = saved.procedural.choices;
    await f.api.generateCatalogLife();
    assert.equal(f.calls.length, 50);
    for (const [n, spec] of f.calls.entries()) {
        const preset = presets.find(p => p.id === choices.growth[n]);
        assert.equal(spec.growth.presetId, preset.id);
        assert.equal(spec.layerPolicy, 'authored');
        assert.equal(spec.bounds.h, 1024);
        assert.equal(spec.growth.jobs, 64);
        assert.ok(spec.growth.radius >= 1 && spec.growth.radius <= 64);
        if (preset.stroke.sizeMode === 'scale') {
            const length = preset.sheet.lengthMax * spec.growth.radius / preset.stroke.sizeReference;
            assert.ok(length <= 128 + 1e-8, preset.id + ' stays within nominal size');
        }
        assert.equal(spec.growth.liveSeconds, preset.sheet.timeClip ? Math.min(60, preset.sheet.endTime + 1 / 60)
            : preset.sheet.flowSpeed > 0 ? 2 : undefined);
    }
    const partial = setup();
    saved.procedural.completed.growth = 7;
    partial.api.restore(plain(saved));
    await partial.api.prepareProcedural();
    await partial.api.generateCatalogLife();
    assert.deepEqual(partial.calls, f.calls.slice(7));
    const detail = setup();
    detail.api.restore(plain(saved));
    detail.api.m.procedural.macro = { material: 'LIMESTONE', loose: 'SAND' };
    await detail.api.generateCatalogDetails();
    assert.equal(detail.calls.length, 117);
    for (const spec of detail.calls) {
        assert.deepEqual(spec.materials.map(m => m.element), ['DIRT', 'SAND', 'STONE', 'LIMESTONE'].map(name => elements.find(e => e.name === name).id));
        assert.equal(spec.replacement, 'eligible');
        assert.equal(spec.bounds.h, 1024);
    }
    const missing = setup();
    missing.api.restore(plain(saved));
    missing.api.m.procedural.macro = { material: 'UNKNOWN', loose: 'SAND' };
    await assert.rejects(missing.api.generateCatalogDetails(), /Unknown detail material/);
    assert.equal(missing.calls.length, 0);
    const invalid = setup();
    invalid.api.restore(plain(saved));
    for (const policy of Object.values(invalid.api.m.procedural.growthPolicies))
        policy.lengthMax = 'invalid';
    await assert.rejects(invalid.api.generateCatalogLife(), /Invalid saved growth length/);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
