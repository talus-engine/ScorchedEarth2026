/** Build the square artist scaffold from Talus-authored material pixels.
 * This writes bootstrap/reference assets only; it does not install or repaint native art.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');
const { ROOT, writeJSON, run } = require('./lib/files.cjs');
const { readElementImage, crop, pngData } = require('./lib/wfc-image.cjs');
const AREA = 'terra-reach-v2', SIZE = 256;
const SIDES = ['north', 'south', 'east', 'west'];

// Rasterize midpoint ties to the nearest even pixel for symmetric collars.
function rounded(value) {
    const lower = Math.floor(value);
    return value - lower === 0.5 ? lower + lower % 2 : Math.round(value);
}

function build(output = path.join(ROOT, 'world/WFC')) {
    fs.mkdirSync(output, { recursive: true });
    const swatch = path.join(ROOT, 'assets/art/terrain-swatch.svg');
    fs.copyFileSync(swatch, path.join(output, 'mixed-earth-swatch.svg'));
    const source = readElementImage(swatch), palette = source.palette;
    const stone = [...palette].find(([, entry]) => entry.name === 'STONE')[0];
    const patches = [3, 256].flatMap(y => [0, 256].map(x => crop(source, x, y, SIZE, SIZE)));
    assert(patches.every(patch => !patch.includes(0)));
    const gates = Object.fromEntries(['sky', 'earth', 'stone'].map(name => [name, { a: 0, b: 1 }]));
    for (const h of [64, 128, 192]) gates['h' + h] = { a: h / SIZE, b: 1 };
    const rows = [], pictures = [];

    function add(name, socketText, pixels, role, weight = 1) {
        const i = rows.length, sockets = Object.fromEntries(SIDES.map((side, index) => [side, socketText.split(' ')[index]]));
        const materials = {};
        for (const value of pixels) {
            const name = value ? palette.get(value).name : 'EMPTY';
            materials[name] = (materials[name] || 0) + 1;
        }
        rows.push({ name: 'terra-v2-' + name, role, sizeChunks: [4, 4], atlasOrigin: [(i % 6) * SIZE, Math.floor(i / 6) * SIZE],
            sockets, weight, gates: Object.fromEntries(SIDES.map(side => [side, gates[sockets[side]]])), materials });
        pictures.push(pixels);
    }

    // Shared two-pixel rims copy the native swatch so adjacent materials agree.
    const horizontal = Array.from({ length: SIZE }, (_, x) => patches[0][128 * SIZE + x]);
    const vertical = Array.from({ length: SIZE }, (_, y) => patches[0][y * SIZE + 128]);
    for (const i of [0, 1, 254, 255]) horizontal[i] = vertical[i] = stone;
    function material(index, interior = false) {
        const pixels = Buffer.from(patches[index % 4]);
        for (let t = 0; t < SIZE; t++) for (const border of [0, 1, 254, 255]) {
            pixels[border * SIZE + t] = horizontal[t];
            pixels[t * SIZE + border] = vertical[t];
        }
        if (interior) pixels.fill(stone, 240 * SIZE);
        return pixels;
    }

    add('sky', 'sky sky sky sky', Buffer.alloc(SIZE * SIZE), 'sky');
    add('bedrock', 'stone stone stone stone', Buffer.alloc(SIZE * SIZE, stone), 'bedrock');
    for (let i = 0; i < 4; i++) add(`earth-${i + 1}`, 'earth stone earth earth', material(i, true), 'interior');
    for (const west of [64, 128, 192]) for (const east of [64, 128, 192]) for (const [variant, offset] of [['ridge', -48], ['bowl', 48]]) {
        const pixels = material(rows.length), center = Math.max(24, Math.min(232, Math.floor((west + east) / 2) + offset));
        for (let x = 0; x < SIZE; x++) {
            let height;
            // Eight-pixel flat collars are the artist's seam contract.
            if (x < 8) height = west;
            else if (x >= 248) height = east;
            else if (x < 104) height = west + (center - west) * (1 - Math.cos((x - 8) / 96 * Math.PI)) / 2;
            else if (x < 152) height = center;
            else height = center + (east - center) * (1 - Math.cos((x - 152) / 96 * Math.PI)) / 2;
            for (let y = 0; y < rounded(height); y++) pixels[y * SIZE + x] = 0;
        }
        add(`${west}-${east}-${variant}`, `sky earth h${east} h${west}`, pixels, 'surface');
    }

    // An Euler circuit visits each height pair twice, once per silhouette.
    const graph = new Map([64, 128, 192].map(v => [v, [64, 128, 192].flatMap(e => ['ridge', 'bowl'].map(variant => [e, variant]))]));
    const route = [];
    function visit(v) {
        while (graph.get(v).length) {
            const [e, variant] = graph.get(v).shift();
            visit(e);
            route.push([v, e, variant]);
        }
    }
    visit(128);
    route.reverse();
    assert(route.length === 18 && route[0][0] === 128 && route.at(-1)[1] === 128);
    assert(route.slice(1).every((row, i) => route[i][1] === row[0]));
    const heights = [128, 128, 192, 128, 64, 64, 128, 192, 192, 128, 64, 128,
        128, 192, 128, 64, 128, 192, 128, 128, 64, 64, 128, 192,
        128, 64, 128, 192, 192, 128, 64, 128, 128];
    for (let i = 0; i < 32; i++) route.push([heights[i], heights[i + 1], i % 2 ? 'ridge' : 'bowl']);
    const byName = new Map(rows.map(tile => [tile.name, tile])), placements = [], origins = new Set();
    for (let y = 0; y < 5; y++) for (let x = 0; x < 50; x++) {
        let name;
        if (y < 2) name = 'terra-v2-sky';
        else if (y === 2) name = 'terra-v2-' + route[x].join('-');
        else if (y === 3) name = `terra-v2-earth-${x % 4 + 1}`;
        else name = 'terra-v2-bedrock';
        const tile = byName.get(name), origin = !origins.has(name);
        origins.add(name);
        const row = { x: x * 4, y: y * 4, source: name, origin, sockets: tile.sockets, gates: tile.gates };
        if (origin) tile.originAnchor = { x: row.x, y: row.y };
        placements.push(row);
    }
    assert.equal(origins.size, 24);
    const manifest = { version: 2, areaId: AREA, tileSizePixels: SIZE, tileSizeChunks: 4,
        grid: { x: 0, y: 0, columns: 50, rows: 5 }, sourceSwatch: 'WFC/mixed-earth-swatch.svg',
        sourceSwatchNote: 'Palette-builder input; painted tile origins are stored as native WFC art.',
        gateMeaning: 'Filled bridge span. Sky is a full EMPTY edge. Fractions run left-to-right on N/S and top-to-bottom on E/W.',
        collarPixels: 8, seedPolicy: 'Fixed connecting heights; seeded ridge/bowl silhouettes and four mixed-earth textures. Source tiles are WYSIWYG in the editor and join the same palette in games.',
        sockets: gates, tiles: rows, placements };
    writeJSON(path.join(output, 'template.json'), manifest);
    const atlas = Buffer.alloc(1536 * 1024), groups = [];
    rows.forEach((tile, i) => {
        const [ox, oy] = tile.atlasOrigin;
        for (let y = 0; y < SIZE; y++) pictures[i].copy(atlas, (oy + y) * 1536 + ox, y * SIZE, (y + 1) * SIZE);
        groups.push(`<g class="wfc-tile" talus:tile="${tile.name}" talus:area="${AREA}" talus:size="4x4" talus:origin="${ox} ${oy}" talus:sockets="${SIDES.map(s => tile.sockets[s]).join(' ')}" talus:weight="${tile.weight}"/>`);
    });
    const metadata = '<metadata><talus:elements>' + [...palette].map(([i, { name, color }]) => `<talus:element index="${i}" name="${name}" color="${color}"/>`).join('') + '</talus:elements></metadata>';
    fs.writeFileSync(path.join(output, 'bootstrap.svg'), '<svg xmlns="http://www.w3.org/2000/svg" xmlns:talus="https://talus.dev/ns/world" viewBox="0 0 1536 1024">' + metadata + `<image width="1536" height="1024" talus:channel="element" talus:palette="metadata" href="data:image/png;base64,${pngData(1536, 1024, atlas)}"/>` + groups.join('') + '</svg>\n');
    const sheet = ['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1160" viewBox="0 0 1440 1160"><rect width="1440" height="1160" fill="#111322"/><g font-family="monospace" fill="#eeeeee"><text x="20" y="26" font-size="20">SCORCHED EARTH 2026 / WFC ARTIST SCAFFOLD / 256 x 256 PER TILE</text>'];
    rows.forEach((tile, i) => {
        const x = 20 + i % 6 * 238, y = 64 + Math.floor(i / 6) * 274;
        sheet.push(`<text x="${x}" y="${y - 12}" font-size="11">${tile.name.replace('terra-v2-', '')}  @${tile.originAnchor.x},${tile.originAnchor.y}</text><image x="${x}" y="${y}" width="208" height="208" href="data:image/png;base64,${pngData(SIZE, SIZE, pictures[i], palette)}"/><rect x="${x}" y="${y}" width="208" height="208" fill="none" stroke="#707b98"/>`);
        for (const [side, gate] of Object.entries(tile.gates)) for (const value of [gate.a, gate.b]) {
            let a, b, c, d;
            if (['north', 'south'].includes(side)) {
                a = x + value * 208; b = y + (side === 'south' ? 208 : 0);
                c = a; d = b + (side === 'south' ? -11 : 11);
            } else {
                a = x + (side === 'east' ? 208 : 0); b = y + value * 208;
                c = a + (side === 'east' ? -11 : 11); d = b;
            }
            sheet.push(`<path d="M${a},${b}L${c},${d}" stroke="#5ff2c2" stroke-width="2"/>`);
        }
        sheet.push(`<text x="${x}" y="${y + 228}" font-size="10">N:${tile.sockets.north} S:${tile.sockets.south} E:${tile.sockets.east} W:${tile.sockets.west}</text>`);
    });
    sheet.push('</g></svg>\n');
    fs.writeFileSync(path.join(output, 'artist-sheet.svg'), sheet.join(''));
    return manifest;
}

module.exports = { build };
if (require.main === module) run(() => {
    const { values } = parseArgs({ options: { output: { type: 'string' }, help: { type: 'boolean' } } });
    if (values.help) return console.log('Usage: node tools/build_wfc_template.cjs [--output directory]\nWrites bootstrap/reference files; does not install native art.');
    const result = build(values.output);
    console.log(`Built ${result.tiles.length} tiles / ${result.placements.length} anchors / ${result.tiles.filter(tile => tile.originAnchor).length} editable origins`);
});
