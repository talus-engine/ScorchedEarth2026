const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assemble, resourceImages } = require('../tools/mazes.cjs');
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

test('maze strokes use non-neural native brushes and retain noise animation and living bramble', () => {
    const sources = ['element', 'grow', 'noise', 'pattern', 'semantic', 'tile'];
    for (const r of catalog.recipes) {
        assert.deepEqual(r.maze.strokes.map(x => x.sourceKind).sort(), sources);
        assert.equal(new Set(r.maze.strokes.map(x => x.id)).size, r.maze.strokes.length);
        const spin = r.maze.strokes.find(x => x.sourceKind === 'noise');
        assert.ok(spin.brush.rotationStepDeg > 0 && spin.brush.lfoAmplitudePx > 0);
        assert.ok(r.maze.strokes.every(x => !x.content?.neural));
    }
    const bramble = catalog.recipes.find(x => x.id === 'cavern-war').maze.strokes.find(x => x.sourceKind === 'grow');
    assert.equal(bramble.content.growth.id, 'builtin-living-bramble');
});

test('maze resources pin every foreground/background sheet and retain native tileset rules', () => {
    const images = resourceImages(catalog);
    assert.equal(images.length, 8);
    for (const r of catalog.recipes) {
        assert.equal(r.maze.resources.catalog, 'terrain-presets');
        for (const m of r.maze.mappings.filter(m => m.kind === 'tile')) {
            const bound = r.maze.resources.tilesets.find(t => t.id === m.tilesetId);
            const native = tiles.find(t => t.id === m.tilesetId);
            assert.ok(bound, 'Every tile mapping must have immutable metadata');
            assert.equal(bound.imageRef, 'sprite-image:' + native.path.slice('/Assets/Sprites/'.length));
            assert.ok(images.includes(bound.imageRef));
            assert.equal(bound.type, native.ruleMode);
            assert.equal(bound.layout, native.layout);
            assert.equal(bound.tileWidth, native.tileWidth);
            assert.equal(bound.tileHeight, native.tileHeight);
        }
    }
    assert.deepEqual(resourceImages({ recipes: [...catalog.recipes, ...catalog.recipes] }), images,
        'Repeated mappings must not duplicate catalog image roots');
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
