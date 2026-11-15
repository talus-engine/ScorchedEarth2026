const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { saveTrace } = require('../tools/packaged-smoke.cjs');

function fixture(t, chunks) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'talus-trace-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const session = new EventEmitter(), calls = [];
    session.send = async (method, args) => {
        calls.push(method);
        if (method === 'Tracing.end') session.emit('Tracing.tracingComplete', { stream: 'trace' });
        if (method === 'IO.read') {
            assert.equal(args.handle, 'trace');
            const chunk = chunks.shift();
            if (chunk instanceof Error) throw chunk;
            return chunk;
        }
    };
    session.detach = async () => { calls.push('detach'); };
    return { session, calls, destination: path.join(directory, 'trace.json') };
}

test('runtime trace preserves text and binary CDP stream chunks', async t => {
    const f = fixture(t, [
        { data: '{"traceEvents":[', eof: false },
        { data: Buffer.from('{"name":"tick"}]}').toString('base64'), base64Encoded: true, eof: true },
    ]);
    await saveTrace(f.session, f.destination);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.destination, 'utf8')), { traceEvents: [{ name: 'tick' }] });
    assert.deepEqual(f.calls, ['Tracing.end', 'IO.read', 'IO.read', 'IO.close', 'detach']);
});

test('runtime trace releases the browser stream and session when reading fails', async t => {
    const f = fixture(t, [new Error('stream disconnected')]);
    await assert.rejects(saveTrace(f.session, f.destination), /stream disconnected/);
    assert.deepEqual(f.calls, ['Tracing.end', 'IO.read', 'IO.close', 'detach']);
});
