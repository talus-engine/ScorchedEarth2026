/** Landed carriers, persistence barriers and cleanup use the actual routing service. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture(mode = 'creature') {
    const calls = [], item = { behavior: { mode, kind: 'test' } };
    const service = name => ({ configure() {}, impact(...args) { calls.push([name, ...args]); }, tick() {},
        busy: () => false, settling: () => false, stop() { calls.push(name + ':stop'); },
        finish() { calls.push(name + ':finish'); }, bind() {} });
    const ctx = { creatures: service('creature'), ordnance: service('ordnance'), tricksters: service('trickster'),
        economy: { itemById: () => item }, session: { persist() { calls.push('persist'); } } };
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync('world/Scripts/lib/payloads.ts', 'utf8'),
        { compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports, talus: { log: m => calls.push(m) } });
    return { ctx, api: module.exports(ctx), calls, item };
}
test('only a real root impact activates a carrier, once', () => {
    const f = fixture(), attack = { item: 'worm', owner: 'dead-shooter', rootId: 4, pending: [] };
    for (const [id, collision, reason] of [[3, 'terrain', 'detonated'], [4, null, 'expired'],
        [4, 'terrain', 'removed'], [4, null, 'detonated']])
        f.api.queue(attack, { collision }, { projectileId: id, x: 100, y: 200, reason });
    assert.equal(attack.pending.length, 0);
    for (let n = 0; n < 2; n++)
        f.api.queue(attack, { collision: 'terrain' }, { projectileId: 4, x: 100, y: 200, reason: 'detonated' });
    assert.equal(attack.pending.length, 1);
    assert.equal(attack.pending[0].at.x, 100);
    const powder = { ...attack, payloadQueued: false, pending: [] };
    f.api.queue(powder, { collision: 'particle' }, { projectileId: 4, x: 90, y: 210, reason: 'detonated' });
    assert.equal(powder.pending.length, 1, 'Native loose-powder contact is a genuine landing');
});
test('asynchronous payload admission keeps the attack open and preserves original owner', async () => {
    const f = fixture('ordnance'), attack = { item: 'mine', owner: 'durable-dead-shooter', tasks: 0 };
    let resolve;
    f.ctx.ordnance.impact = (kind, owner) => {
        assert.equal(kind, 'test'); assert.equal(owner, attack.owner);
        return new Promise(r => { resolve = r; });
    };
    const pending = f.api.impact(attack, { x: 2, y: 3 });
    assert.equal(attack.tasks, 1);
    resolve(); await pending;
    assert.equal(attack.tasks, 0);
    f.ctx.ordnance.impact = async () => { throw Error('native admission refused'); };
    await assert.rejects(f.api.impact(attack, { x: 2, y: 3 }), /native admission refused/);
    assert.equal(attack.tasks, 0);
});
test('finite hazards delay results, dormant hazards allow saves, and cleanup reaches every service', () => {
    const f = fixture();
    assert.equal(f.api.busy(), false);
    assert.equal(f.api.settling(), false);
    f.ctx.creatures.settling = () => true;
    assert.equal(f.api.busy(), false, 'A saved native creature needs no indefinite script barrier');
    assert.equal(f.api.settling(), true, 'An attacking crow can still change the winner');
    f.ctx.creatures.stop = () => { throw Error('owned cleanup failed'); };
    f.api.stop();
    assert.ok(f.calls.includes('ordnance:stop'));
    assert.ok(f.calls.includes('trickster:stop'));
});
