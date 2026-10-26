const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { sync, inventory } = require('../tools/talus_sync.cjs');
const { WORLD_ID } = require('../tools/lib/files.cjs');

function setup(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talus-sync-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, 'repo'), live = path.join(root, 'live'), state = path.join(root, 'baseline.json');
    for (const directory of [repo, live]) {
        fs.mkdirSync(path.join(directory, 'Scripts'), { recursive: true });
        fs.writeFileSync(path.join(directory, 'Scripts/game.ts'), 'same');
    }
    return { repo, live, state, run: (action, options) => sync(action, repo, live, state, options) };
}

test('capture then conflict preserves both edits', async t => {
    const { repo, live, run } = setup(t);
    await run('capture');
    fs.writeFileSync(path.join(live, 'Scripts/game.ts'), 'from Talus');
    await run('capture');
    assert.equal(fs.readFileSync(path.join(repo, 'Scripts/game.ts'), 'utf8'), 'from Talus');
    fs.writeFileSync(path.join(live, 'Scripts/game.ts'), 'engine edit');
    fs.writeFileSync(path.join(repo, 'Scripts/game.ts'), 'repo edit');
    await assert.rejects(run('capture'), /Resolve/);
    assert.equal(fs.readFileSync(path.join(repo, 'Scripts/game.ts'), 'utf8'), 'repo edit');
    assert.equal(fs.readFileSync(path.join(live, 'Scripts/game.ts'), 'utf8'), 'engine edit');
});

test('bootstrap conflict does not prefer a side', async t => {
    const { live, state, run } = setup(t);
    fs.writeFileSync(path.join(live, 'Scripts/game.ts'), 'different');
    await assert.rejects(run('capture'), /Resolve/);
    assert(!fs.existsSync(state));
});

test('missing file never deletes the other side; preflight precedes writes', async t => {
    const { repo, live, run } = setup(t);
    await run('capture');
    fs.unlinkSync(path.join(live, 'Scripts/game.ts'));
    fs.writeFileSync(path.join(live, 'Scripts/other.ts'), 'still mounted');
    await assert.rejects(run('capture'), /Resolve/);
    assert(fs.existsSync(path.join(repo, 'Scripts/game.ts')));
    assert(!fs.existsSync(path.join(repo, 'Scripts/other.ts')));
});

test('capture preserves binary bytes and excludes generated and child-world files', async t => {
    const { repo, live, run } = setup(t);
    fs.mkdirSync(path.join(live, 'Art'));
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    fs.writeFileSync(path.join(live, 'Art/title.png'), bytes);
    for (const file of ['Scripts/game.js', 'Scripts/talus.d.ts', 'Scripts/tsconfig.json', 'Scripts/example-game.ts', 'Worlds/Title/Game/title.json', 'AI/world-raster/samples/frame.json', 'Thumbnail/title.png']) {
        fs.mkdirSync(path.dirname(path.join(live, file)), { recursive: true });
        fs.writeFileSync(path.join(live, file), 'generated');
    }
    await run('capture');
    assert.deepEqual(fs.readFileSync(path.join(repo, 'Art/title.png')), bytes);
    assert.deepEqual(Object.keys(inventory(repo)).sort(), ['Art/title.png', 'Scripts/game.ts']);
});

test('install awaits public writer and applies only repo changes', async t => {
    const { repo, live, state, run } = setup(t);
    await run('capture');
    fs.writeFileSync(path.join(repo, 'Scripts/game.ts'), 'reviewed edit');
    const writes = [];
    await run('install', { writer: async (name, text) => {
        await new Promise(resolve => setImmediate(resolve));
        writes.push(name);
        fs.writeFileSync(path.join(live, name), text);
    } });
    assert.deepEqual(writes, ['Scripts/game.ts']);
    assert((await run('status')).every(row => row.state === 'same'));
    assert.equal(JSON.parse(fs.readFileSync(state, 'utf8')).template, WORLD_ID);
});

test('offline directory, empty mount and symlinks refuse', async t => {
    const { repo, live, run } = setup(t);
    assert.throws(() => inventory(path.join(live, 'absent')), /unavailable/);
    const empty = path.join(live, 'empty');
    fs.mkdirSync(empty);
    assert.throws(() => inventory(empty), /empty snapshot/);
    fs.symlinkSync(path.join(repo, 'Scripts/game.ts'), path.join(live, 'Scripts/link.ts'));
    await assert.rejects(run('capture'), /symlink/);
});

test('selected paths isolate changes; failed installs do not advance baseline', async t => {
    const { repo, live, state, run } = setup(t);
    await run('capture');
    const baseline = fs.readFileSync(state);
    fs.writeFileSync(path.join(repo, 'Scripts/game.ts'), 'reviewed edit');
    fs.writeFileSync(path.join(live, 'Scripts/new.ts'), 'mount addition');
    await assert.rejects(run('install', { writer: async () => { throw Error('Readback failed'); } }), /Readback failed/);
    assert.deepEqual(fs.readFileSync(state), baseline);
    await run('capture', { paths: ['Scripts/new.ts'] });
    assert.equal(fs.readFileSync(path.join(repo, 'Scripts/game.ts'), 'utf8'), 'reviewed edit');
    assert.equal(fs.readFileSync(path.join(repo, 'Scripts/new.ts'), 'utf8'), 'mount addition');
    await assert.rejects(run('capture', { paths: ['missing.ts'] }), /Unknown paths/);
});

test('binary and oversized installs refuse before calling the writer', async t => {
    const { repo, run } = setup(t);
    await run('capture');
    fs.writeFileSync(path.join(repo, 'Scripts/large.ts'), Buffer.alloc(1024 * 1024 + 1));
    fs.writeFileSync(path.join(repo, 'Scripts/data.bin'), Buffer.from([0, 255]));
    await assert.rejects(run('install', { writer: () => assert.fail('Must preflight first') }), /binary\/large/);
});
