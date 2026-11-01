const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { matchingBuild, artifactPaths, validateEntry, verifyHosted } = require('../tools/template.cjs');
const { PROJECT } = require('../tools/lib/files.cjs');

test('template export refuses unmatched or permission-incompatible builds', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-build-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const options = { engine: dir, publisher: dir };
    const set = (engine, desktop) => {
        fs.writeFileSync(path.join(dir, 'build_number.txt'), engine + '\n');
        fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ engineBuild: desktop }));
    };
    set('2766', '2766');
    assert.equal(matchingBuild(options), '2766');
    for (const pair of [['2767', '2766'], ['2765', '2765'], ['invalid', 'invalid']]) {
        set(...pair);
        assert.throws(() => matchingBuild(options), /Matching Talus build required/);
    }
});

test('published revisions require native identity and thumbnail and have bounded paths', () => {
    const entry = { id: PROJECT.registry.id, templateId: PROJECT.worldId, name: PROJECT.name, thumbnail: 'cover.png', sha256: 'a'.repeat(64) };
    validateEntry(entry);
    assert.deepEqual(artifactPaths(entry), [`${entry.id}/${entry.sha256}`, `${entry.id}/latest.json`, `${entry.id}/registry.json`]);
    for (const patch of [{ name: 'Wrong title' }, { templateId: 'wrong' }, { thumbnail: null }, { id: '../escape' }, { sha256: '../escape' }]) {
        assert.throws(() => validateEntry({ ...entry, ...patch }));
    }
});

test('hosted verification tolerates propagation delay and stops on success or exhausted attempts', async () => {
    let calls = 0, waits = 0;
    await verifyHosted(() => { if (++calls < 3) throw Error('HTTP 404'); }, { attempts: 5, wait: async () => waits++, log() {} });
    assert.equal(calls, 3);
    assert.equal(waits, 2);
    calls = 0;
    await assert.rejects(verifyHosted(() => { calls++; throw Error('Hash mismatch'); }, { attempts: 2, wait: async () => {}, log() {} }), /Hash mismatch/);
    assert.equal(calls, 2);
});

test('publishing defaults require no permission prompts', () => {
    assert.deepEqual(require('../world/Game/publishing.json').permissions, {
        gamepad: true, fullscreen: true, midi: false, microphone: false,
        camera: false, localNetwork: false, clipboardRead: false,
    });
});
