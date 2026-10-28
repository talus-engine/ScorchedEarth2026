const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./support/game.cjs');

for (const id of ['napalm', 'hot-napalm']) {
    test(id + ' ignites actual fuel at the bottom immediately after deposition', async () => {
        const f = fixture(), item = f.shop.items.find(item => item.id === id), requests = [];
        const oilId = 71, at = { x: 6000, y: 660 }, attack = { rootId: 81, item: id, tasks: 0 };
        f.talus.elements.get = name => { assert.equal(name, 'CRUDE_OIL'); return { id: oilId }; };
        let deposited;
        f.talus.world.terrainWork = spec => {
            requests.push(spec);
            return requests.length === 1 ? new Promise(resolve => { deposited = resolve; })
                : Promise.resolve({ status: 'completed', added: 200 });
        };
        const pending = f.api.deposit(attack, at, item.behavior);
        assert.equal(attack.tasks, 1);
        assert.equal(requests.length, 1, 'Fuel must commit before ignition');
        assert.equal(requests[0].holdSeconds, 0, 'No settling delay before lighting the deposited oil');
        deposited({ status: 'completed', added: 2000 });
        await pending;
        assert.equal(attack.tasks, 0);
        assert.equal(requests.length, 2);
        const [oil, fire] = requests;
        assert.equal(fire.recipe.macro.strata[0].element, 'FIRE');
        assert.equal(fire.replacement, 'matching');
        assert.deepEqual(structuredClone(fire.materials), [{ element: oilId, hardness: 1 }]);
        assert.ok(fire.shape.y > oil.shape.y, 'Ignition lies in the lower half of the fuel circle');
        assert.ok(fire.shape.y < at.y && fire.shape.y + fire.shape.h >= at.y,
            'The band intersects pooled oil immediately above a flat impact surface');
        assert.ok(fire.shape.w >= item.behavior.radius && fire.shape.h >= 12, 'Ignition is a broad patch');
        assert.equal(fire.bounds.h, 1024, 'The foundation remains excluded');
        assert.ok(fire.holdSeconds <= .1);
    });
}

test('An ignition refusal releases attack work; nonflammable deposits do not light a fire', async () => {
    const f = fixture(), attack = { rootId: 81, item: 'napalm', tasks: 0 };
    let calls = 0;
    f.talus.elements.get = () => ({ id: 71 });
    f.talus.world.terrainWork = async () => ++calls === 1
        ? { status: 'completed' } : { status: 'refused', reason: 'capacity' };
    await assert.rejects(f.api.deposit(attack, { x: 6000, y: 660 }, { radius: 48, element: 'CRUDE_OIL', ignite: true }), /Ignition: capacity/);
    assert.equal(attack.tasks, 0);
    const requests = [];
    f.talus.world.terrainWork = async spec => { requests.push(spec); return { status: 'completed' }; };
    await f.api.deposit(attack, { x: 6000, y: 660 }, { radius: 48, element: 'SAND' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].holdSeconds, 1);
});
