const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { assemble } = require('../tools/mazes.cjs');
const catalog = require('../world/Game/Mazes/catalog.json');
const base = require('../world/Game/terrain-recipes.json');
const tiles = require('../assets/mazes/tiles.json').presets;
const props = require('../world/Game/Mazes/entities.json').entities;

test('maze recipes keep native chunk sources and distinct foreground/background tile art', () => {
    assert.deepEqual(assemble({ tiles, props, catalog: base }), catalog);
    for (const r of catalog.recipes) {
        assert.equal(r.family, 'maze');
        const original = base.recipes.find(x => x.id === r.id);
        assert.deepEqual(r.bounds, original.bounds);
        assert.deepEqual(r.foundation, original.foundation);
        assert.deepEqual(r.clearances, original.clearances);
        const fg = r.maze.mappings.find(x => x.layerId === 'world' && x.mazeKind === 'wall');
        const bg = r.maze.mappings.filter(x => x.layerId === 'background');
        assert.equal(fg.kind, 'tile');
        assert.ok(!/background/i.test(tiles.find(t => t.id === fg.tilesetId).name));
        assert.ok(bg.length > 0);
        for (const m of bg) {
            const tile = tiles.find(t => t.id === m.tilesetId);
            assert.match(tile.name, /background/i);
            assert.equal(m.tilesetSourcePath, tile.path);
            assert.ok(tile.layers.some(l => l.id === m.tilesetLayerId));
        }
        assert.equal(r.maze.mappings.find(x => x.layerId === 'world' && x.mazeKind === 'floor').kind, 'none');
    }
    const reversed = structuredClone(tiles);
    reversed.find(t => t.id === catalog.recipes[0].maze.mappings[0].tilesetId).name = 'Background';
    assert.throws(() => assemble({ tiles: reversed, props, catalog: base }), /roles are reversed/);
});

test('maze strokes retain all native source types and exact trained neural weights', () => {
    const models = require('../world/Game/Presets/neural.json').models;
    const sources = ['element', 'grow', 'neural', 'noise', 'pattern', 'semantic', 'tile'];
    for (const r of catalog.recipes) {
        assert.deepEqual(r.maze.strokes.map(x => x.sourceKind).sort(), sources);
        assert.equal(new Set(r.maze.strokes.map(x => x.id)).size, r.maze.strokes.length);
        const spin = r.maze.strokes.find(x => x.sourceKind === 'noise');
        assert.ok(spin.brush.rotationStepDeg > 0 && spin.brush.lfoAmplitudePx > 0);
        const n = r.maze.strokes.find(x => x.sourceKind === 'neural').content;
        const model = models.find(x => x.id === n.neural.modelId);
        assert.deepEqual(n.neural.arch, model.architecture);
        const bytes = Buffer.from(n.neural.weights);
        assert.ok(bytes.equals(Buffer.from(model.weightsBase64, 'base64')));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), model.weightsSha256);
        assert.ok(n.semantic.weights.every(w => model.architecture.anchors.some(a => a.id === w.anchorId)));
        assert.ok(n.neural.steps > 0 && n.neural.steps <= model.architecture.steps);
    }
    const bramble = catalog.recipes.find(x => x.id === 'cavern-war').maze.strokes.find(x => x.sourceKind === 'grow');
    assert.equal(bramble.content.growth.id, 'builtin-living-bramble');
});

test('maze scenery uses captured native entity bodies within the spawn footprint', () => {
    for (const p of props) {
        const row = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/native/entities', p.templateId + '.json')));
        assert.equal(row.templateName, p.name);
        assert.ok(row.bodies.length > 0);
        assert.ok(row.bodies.some(b => b.pixels.length > 0));
        if (p.id === 'lamp') continue;
        assert.equal(row.isStatic, false);
        assert.equal(row.indestructible, false);
        assert.equal(row.particleAnimationLayers.length, 0);
        const pixels = row.bodies.flatMap(b => b.pixels);
        const w = Math.max(...pixels.map(p => p.localX)) - Math.min(...pixels.map(p => p.localX)) + 1;
        const h = Math.max(...pixels.map(p => p.localY)) - Math.min(...pixels.map(p => p.localY)) + 1;
        assert.ok(w <= 44 && h <= 36, p.id + ' must fit its native collision probe');
    }
    for (const r of catalog.recipes) {
        assert.ok(r.maze.spawners.maxSpawns <= 48);
        assert.ok(r.maze.torches.maxTorches <= 24);
        for (const rule of [...r.maze.spawners.rules, ...r.maze.torches.types])
            assert.ok(props.some(p => p.templateId === rule.templateId));
    }
});
