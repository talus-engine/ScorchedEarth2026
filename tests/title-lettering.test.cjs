const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { pattern } = require('../tools/title_logo_pattern.cjs');
const { PNG } = require('pngjs');
test('startup flame brushes hit opaque lettering and leave most of the logo to burn', () => {
    const scene = JSON.parse(fs.readFileSync('world/Menus/Scenes/title.json'));
    const image = scene.particleImages[0], png = PNG.sync.read(fs.readFileSync('world/' + image.file));
    const input = { ...image.materialScript.args, width: image.width, height: image.height, seed: 1986 };
    const a = pattern(input), b = pattern({ ...input, seed: 2026 });
    assert.equal(JSON.stringify(a.ignition), JSON.stringify(pattern(input).ignition));
    assert.notEqual(JSON.stringify(a.ignition), JSON.stringify(b.ignition));
    assert.ok(a.ignition.length >= 5 && a.ignition.length <= 7);
    for (const { x, y } of a.ignition) assert.equal(png.data[(y * png.width + x) * 4 + 3], 255);
    let lit = 0, opaque = 0;
    for (let i = 0; i < a.indices.length; i++) if (png.data[i * 4 + 3]) {
        opaque++;
        if (a.materials[a.indices[i]] === 'FIRE') lit++;
    }
    assert.ok(lit > 100 && lit < opaque * .08, `${lit}/${opaque} cells lit`);
});
test('title materials reroll without changing source colors or the lettering mask', () => {
    const input = { width: 640, height: 128, seed: 1986 }, a = pattern(input), b = pattern(input);
    assert.deepEqual(Buffer.from(a.indices), Buffer.from(b.indices));
    assert.notDeepEqual(Buffer.from(a.indices), Buffer.from(pattern({ ...input, seed: 2026 }).indices));
    assert.deepEqual(input, { width: 640, height: 128, seed: 1986 });
    for (const name of ['WOOD', 'DYNAMITE', 'TNT', 'C4', 'COAL', 'GUNPOWDER', 'THERMITE'])
        assert.ok(a.materials.includes(name));
    assert.equal(a.indices.length, 640 * 128);
    for (const index of a.indices) assert.ok(index < a.materials.length);
    assert.throws(() => pattern({ width: 0, height: 128 }), /Invalid logo/);
});
test('title lettering has portable outlined SVGs and uses the compiled native stamp image', () => {
    const scene = JSON.parse(fs.readFileSync('world/Menus/Scenes/title.json', 'utf8'));
    const model = JSON.parse(fs.readFileSync('world/Game/title-lettering.json', 'utf8'));
    const vectors = JSON.parse(fs.readFileSync('world/Game/title-vectors.json', 'utf8'));
    assert.equal(model.parts.length, 3);
    assert.equal(model.colors.length, 5);
    for (const part of model.parts) {
        assert.ok(vectors.shapes.some(shape => shape.id === part.id && shape.svgPath.startsWith('M')));
        const svg = fs.readFileSync(`world/Art/Title/${part.id}.svg`, 'utf8');
        assert.match(svg, /<path /);
        assert.doesNotMatch(svg, /<text\b|<image\b|data:image/);
    }
    const image = scene.particleImages[0], png = PNG.sync.read(fs.readFileSync('world/' + image.file));
    assert.equal(png.width, image.width);
    assert.equal(png.height, image.height);
    let covered = 0;
    const colors = new Set();
    for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3]) {
        covered++;
        colors.add('#' + png.data.subarray(i, i + 3).toString('hex'));
    }
    assert.ok(covered > 15000 && covered < 30000, 'the native stamp must contain lettering on a transparent canvas');
    assert.deepEqual([...colors].sort(), [...model.colors].sort());
    assert.equal(scene.particleImages.length, 1);
    assert.equal(image.materialScript.seed, 'entry');
    assert.equal(scene.backgrounds[0].file, 'Menus/Assets/title-stars.png');
    const publishing = JSON.parse(fs.readFileSync('world/Game/publishing.json', 'utf8'));
    assert.equal(PNG.sync.read(fs.readFileSync('world/' + publishing.icon)).width, 512);
});
