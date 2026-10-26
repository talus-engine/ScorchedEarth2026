// Exercise the actual engine's solver against the game's authored scaffold.
// Does not reimplement WFC. Complements pixel/seam and installed-app checks.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), engine = process.env.TALUS_ENGINE_ROOT || root;
const ts = require(require.resolve('typescript', { paths: [engine] })), cache = new Map();
function load(file) {
    file = path.resolve(file);
    if (cache.has(file))
        return cache.get(file);
    const exports = {}, mod = { exports };
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, module: mod, require: p => load(path.resolve(path.dirname(file), p + '.ts')) }, { filename: file });
    return mod.exports;
}
const { solveWfcCopy } = load(path.join(engine, 'src/world/wfc/WfcCopySolver.ts'));
const m = JSON.parse(fs.readFileSync(path.join(root, 'world/WFC/template.json'), 'utf8'));
const tiles = m.tiles.map(t => ({ tileId: t.name, weight: t.weight, faces: t.sockets }));
const anchors = m.placements.map(p => ({ x: p.x, y: p.y, sockets: p.sockets }));
const signatures = new Set(), used = new Set();
for (let seed = 0; seed < 100; seed++) {
    const input = { tiles, anchors, footprint: 4, seed }, a = solveWfcCopy(input), b = solveWfcCopy(input);
    assert.equal(a.ok, true);
    assert.equal(a.picks.size, 250);
    assert.equal(a.backtracks, 0);
    assert.equal(JSON.stringify([...a.picks]), JSON.stringify([...b.picks]));
    for (const [k, v] of a.picks) {
        used.add(v);
        const [x, y] = k.split(',').map(Number), f = tiles[v].faces;
        const east = a.picks.get(`${x + 4},${y}`), south = a.picks.get(`${x},${y + 4}`);
        if (east !== undefined)
            assert.equal(f.east, tiles[east].faces.west);
        if (south !== undefined)
            assert.equal(f.south, tiles[south].faces.north);
    }
    signatures.add(JSON.stringify([...a.picks]));
}
assert.equal(signatures.size, 100);
assert.equal(used.size, 24);
console.log(JSON.stringify({ engineSolver: true, seeds: 100, uniqueMaps: 100, tilesUsed: 24, anchorsPerMap: 250, repeatable: true, backtracks: 0 }));
