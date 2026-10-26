const assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
async function main() {
    const f = fixture(), calls = [];
    f.talus.dialogue = { active: true, dismiss() { calls.push('dismiss'); }, async start(story, options) { calls.push({ story, ...options }); return true; } };
    await f.api.announce('turn', { pilot: 'Ada' });
    assert.equal(calls[0], 'dismiss');
    assert.equal(calls[1].story, 'turn');
    assert.equal(calls[1].mode, 'announcer');
    assert.equal(calls[1].vars.pilot, 'Ada');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
