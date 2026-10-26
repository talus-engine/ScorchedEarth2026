const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { call, script } = require('../tools/bridge.cjs');
const { ROOT, WORLD_ID } = require('../tools/lib/files.cjs');
const { build } = require('../tools/menus.cjs');

function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'talus-authoring-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}

test('bridge authenticates, encodes JSON, and propagates HTTP/native errors', async t => {
    const directory = temporary(t), token = path.join(directory, 'token');
    fs.writeFileSync(token, 'local-test-token\n');
    const env = { ...process.env };
    t.after(() => { process.env = env; });
    process.env.TALUS_TOKEN_FILE = token;
    process.env.TALUS_BRIDGE_URL = 'http://localhost:3702/';
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        requests.push({ url, ...options });
        return Response.json({ ok: true, value: 'result' });
    });
    assert.equal((await script('return "hello"', 3)).value, 'result');
    const request = requests[0];
    assert.equal(request.url, 'http://localhost:3702/v1/tools/engine_run_script');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, 'Bearer local-test-token');
    assert.deepEqual(JSON.parse(request.body), { source: 'return "hello"', timeoutMs: 3000 });
    assert(request.signal instanceof AbortSignal);
    globalThis.fetch.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    await assert.rejects(call('engine_describe_context'), /HTTP 503: unavailable/);
    globalThis.fetch.mock.mockImplementation(async () => Response.json({ ok: false, error: 'native refusal' }));
    await assert.rejects(call('engine_describe_context'), /native refusal/);
    globalThis.fetch.mock.mockImplementation(async () => Response.json({ isError: true, error: 'tool refusal' }));
    await assert.rejects(call('engine_describe_context'), /tool refusal/);
});

test('theme embedding preserves literal CSS and surrounding menu content', t => {
    const directory = temporary(t);
    fs.writeFileSync(path.join(directory, 'arcade.css'), 'a::before { content: "$& $1"; }\n');
    fs.writeFileSync(path.join(directory, 'menu.html'), 'before<style data-game-theme>old</style>after');
    fs.writeFileSync(path.join(directory, 'plain.html'), 'unchanged');
    assert.throws(() => build(true, directory), /menu.html/);
    assert.deepEqual(build(false, directory), ['menu.html']);
    assert.equal(fs.readFileSync(path.join(directory, 'menu.html'), 'utf8'), 'before<style data-game-theme>\na::before { content: "$& $1"; }\n</style>after');
    assert.equal(fs.readFileSync(path.join(directory, 'plain.html'), 'utf8'), 'unchanged');
    assert.deepEqual(build(true, directory), []);
});

test('export forwards literal paths and flags, and preserves publisher exit codes', t => {
    const directory = temporary(t), publisher = path.join(directory, 'publisher with spaces');
    const scriptFile = path.join(publisher, 'tools/publish/cli.mjs');
    const receipt = path.join(directory, 'receipt.json'), output = path.join(directory, 'out', 'game.talus');
    fs.mkdirSync(path.dirname(scriptFile), { recursive: true });
    fs.writeFileSync(scriptFile, `import fs from 'node:fs';fs.writeFileSync(process.env.TEST_RECEIPT,JSON.stringify({args:process.argv.slice(2),electron:process.env.ELECTRON_RUN_AS_NODE}));process.exit(7);`);
    const profile = path.join(directory, 'profile with spaces');
    const result = spawnSync(process.execPath, [path.join(ROOT, 'tools/project.cjs'), 'export', '--binary', process.execPath, '--publisher', publisher, '--profile', profile, '--output', output, '--publish-snapshot', '--overwrite'], { env: { ...process.env, TEST_RECEIPT: receipt }, encoding: 'utf8' });
    assert.equal(result.status, 7, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(receipt, 'utf8')), { args: ['--profile', profile, '--project', WORLD_ID, '--out', output, '--publish-snapshot', '--overwrite'], electron: '1' });
});
