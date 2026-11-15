const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { elements } = require('../tools/records.cjs');

test('a refused later element prevents all earlier element writes', async t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'talus-element-preflight-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const token = path.join(folder, 'token');
    fs.writeFileSync(token, 'test-token');
    const prior = process.env.TALUS_TOKEN_FILE;
    process.env.TALUS_TOKEN_FILE = token;
    t.after(() => { if (prior === undefined) delete process.env.TALUS_TOKEN_FILE; else process.env.TALUS_TOKEN_FILE = prior; });
    let validated = 0, writes = 0;
    const talus = {
        elements: {
            get: () => ({
                validate: async () => {
                    validated++;
                    return validated === 2 ? { ok: false, problems: [{ field: 'synth', rule: 'refused fixture' }] } : { ok: true };
                },
                update: async () => { writes++; },
            }),
            create: async () => { writes++; },
        },
        editor: { save: async () => { writes++; } },
    };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        try {
            const { source } = JSON.parse(options.body);
            return Response.json({ ok: true, value: await new AsyncFunction('talus', source)(talus) });
        } catch (error) {
            return Response.json({ ok: false, error: error.message });
        }
    });
    await assert.rejects(elements(), /refused fixture/);
    assert(validated > 2, 'the batch reports problems before applying records');
    assert.equal(writes, 0, 'no update, create or save is allowed after a failed preflight');
});
