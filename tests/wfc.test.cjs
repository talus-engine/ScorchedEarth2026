/** Check actual palette pixels, native gates, domains and connected layout. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { isDeepStrictEqual } = require('node:util');
const { DOMParser } = require('@xmldom/xmldom');
const { PNG } = require('pngjs');
const { ROOT, readJSON } = require('../tools/lib/files.cjs');
const { readElementImage, crop } = require('../tools/lib/wfc-image.cjs');
const { build } = require('../tools/build_wfc_template.cjs');
const DIRECTORY = path.join(ROOT, 'world/WFC');

test('WFC gates match pixels and all compatible material joins', () => {
    const manifest = readJSON(path.join(DIRECTORY, 'template.json'));
    const atlas = readElementImage(path.join(DIRECTORY, 'bootstrap.svg'));
    const tiles = manifest.tiles.map(tile => {
        const pixels = crop(atlas, ...tile.atlasOrigin, 256, 256);
        const edge = (x, y, dx, dy) => Array.from({ length: 256 }, (_, n) => pixels[(y + dy * n) * 256 + x + dx * n]);
        const edges = { north: edge(0, 0, 1, 0), south: edge(0, 255, 1, 0), east: edge(255, 0, 0, 1), west: edge(0, 0, 0, 1) };
        assert.deepEqual(tile.sizeChunks, [4, 4]);
        for (const [side, socket] of Object.entries(tile.sockets)) {
            const gate = tile.gates[side];
            assert(0 <= gate.a && gate.a < gate.b && gate.b <= 1);
            assert.deepEqual(gate, manifest.sockets[socket]);
            assert.deepEqual(edges[side].map(Boolean), Array.from({ length: 256 }, (_, i) => socket !== 'sky' && i >= Math.round(gate.a * 256) && i < Math.round(gate.b * 256)), tile.name + ' ' + side);
        }
        return { ...tile, edges };
    });
    let pairs = 0;
    for (const a of tiles) for (const b of tiles) for (const [side, opposite] of [['east', 'west'], ['south', 'north']]) {
        if (a.sockets[side] !== b.sockets[opposite]) continue;
        assert.deepEqual(a.edges[side], b.edges[opposite], `${a.name}/${b.name} ${side} material seam`);
        assert.deepEqual(a.gates[side], b.gates[opposite]);
        pairs++;
    }
    const placements = new Map(manifest.placements.map(p => [`${p.x},${p.y}`, p]));
    const grid = Array.from({ length: 50 }, (_, x) => Array.from({ length: 5 }, (_, y) => `${x * 4},${y * 4}`)).flat();
    assert.deepEqual([...placements.keys()].sort(), grid.sort());
    assert.equal(new Set(manifest.placements.filter(p => p.origin).map(p => p.source)).size, 24);
    assert.equal(manifest.placements.filter(p => p.origin).length, 24);
    let joins = 0;
    for (const p of placements.values()) {
        const candidates = tiles.filter(tile => isDeepStrictEqual(tile.sockets, p.sockets));
        assert(candidates.length, `${p.x},${p.y}: empty domain`);
        if (p.y === 8) assert.equal(candidates.length, 2);
        if (p.y === 12) assert.equal(candidates.length, 4);
        if (p.y === 16) for (const tile of candidates) assert.deepEqual(tile.materials, { STONE: 65536 });
        for (const [dx, dy, side, opposite] of [[4, 0, 'east', 'west'], [0, 4, 'south', 'north']]) {
            const neighbor = placements.get(`${p.x + dx},${p.y + dy}`);
            if (!neighbor) continue;
            assert.equal(p.sockets[side], neighbor.sockets[opposite]);
            assert.deepEqual(p.gates[side], neighbor.gates[opposite]);
            joins++;
        }
    }
    assert.equal(tiles.length, 24);
    assert.equal(pairs, 222);
    assert.equal(joins, 445);
});

test('builder reproduces scaffold geometry, material pixels and contact-sheet colors', t => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'talus-wfc-'));
    t.after(() => fs.rmSync(output, { recursive: true, force: true }));
    assert.deepEqual(build(output), readJSON(path.join(DIRECTORY, 'template.json')));
    assert.deepEqual(readElementImage(path.join(output, 'bootstrap.svg')), readElementImage(path.join(DIRECTORY, 'bootstrap.svg')));
    assert.deepEqual(fs.readFileSync(path.join(output, 'mixed-earth-swatch.svg')), fs.readFileSync(path.join(DIRECTORY, 'mixed-earth-swatch.svg')));
    function sheetImages(file) {
        const document = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'), 'image/svg+xml');
        return [...document.getElementsByTagName('image')].map(node => {
            const image = PNG.sync.read(Buffer.from(node.getAttribute('href').split(',')[1], 'base64'));
            return { x: node.getAttribute('x'), y: node.getAttribute('y'), width: image.width, height: image.height, data: image.data };
        });
    }
    assert.deepEqual(sheetImages(path.join(output, 'artist-sheet.svg')), sheetImages(path.join(DIRECTORY, 'artist-sheet.svg')));
});
