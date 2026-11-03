// Game fallback/accounting and native-request contracts. Real cast/carving acceptance
// must still run in the installed engine; this fixture does not prove physics.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { fixture } = require('./support/game.cjs');
const personas = JSON.parse(fs.readFileSync('world/Game/personas.json', 'utf8'));
function setup() { const f = fixture(); f.api.setPersonas(personas);  f.m.turnNumber = 3; f.talus.world.raycast = () => null; f.talus.world.groundY = () => null; f.talus.world.cell = () => null; f.talus.sim.pause = () => f.talus.sim.paused = true; f.talus.sim.resume = () => f.talus.sim.paused = false; for (const e of f.actors.values()) {
    e.liveId = Number(e.id.slice(-1)) + 1;
    e.y = 650;
    e.snapshot = () => ({ x: e.x, y: e.y, alive: true, vy: 0 });
} return f; }
async function main() {
    {
        const f = setup(), p = f.m.roster[0], w = f.api.bank.players.alpha, item = f.shop.items.find(i => i.id === 'escape-charge');
        item.template = 'test-escape';
        assert.equal(f.api.owned(p, item.id), Infinity);
        assert.equal(f.api.owned(p, 'standard'), Infinity);
        assert.equal(f.api.owned(p, 'riot-charge'), 0);
        assert.equal(f.api.owned(p, 'riot-blast'), 0);
        f.m.phase = 'ready';
        assert.equal(f.api.purchase(p, item.id), false);
        assert.equal(w.cash, 600);
        f.m.phase = 'turn';
        assert.equal(f.api.chooseWeapon(p, item.id), true);
        assert.equal(f.ui.weaponAmmo, '∞');
        assert.equal(f.actors.get(p.entityId).weapon.state.ammo[item.template], null);
        assert.equal(f.ui.loadout.find(v => v.id === item.id)?.stock ?? f.ui.loadout.find(v => v.action === 'equip-' + item.id).stock, '∞');
        assert.equal(p.cashEarned, 0, 'Selecting free escape grants no equip award');
    }
    {
        const f = setup(), p = f.m.roster[0], item = f.shop.items.find(i => i.id === 'escape-charge');
        item.template = 'test-escape';
        let samples = 0;
        f.talus.world.cell = () => { samples++; return null; };
        assert.equal(f.api.prepareCpuEscape(p, 3), false);
        assert.ok(samples <= 81);
        f.talus.world.cell = () => ({ element: { name: 'DIRT' }, body: { id: 'live-hull' }, entity: null });
        assert.equal(f.api.prepareCpuEscape(p, 3), false, 'A live hull is never an eligible escape target');
        f.talus.world.cell = () => ({ element: { name: 'DIRT' }, body: null, entity: null });
        assert.equal(f.api.prepareCpuEscape(p, 3), true);
        assert.equal(p.weaponId, item.id);
        assert.equal(f.actors.get(p.entityId).blackboard.get('custom.aimPlan'), null, 'Local terrain use is not called a ballistic forecast');
    }
    {
        const f = setup(), p = f.m.roster[0], e = f.actors.get(p.entityId), w = f.api.bank.players.alpha, item = f.shop.items.find(i => i.id === 'escape-charge');
        item.template = 'test-escape';
        p.weaponId = item.id;
        f.m.attack = { owner: p.entityId, item: item.id, ids: {}, rootId: null, launched: 0, ended: 0, tasks: 0, angle: -.5, spent: false, origin: { x: e.x + 20, y: 650 } };
        const shot = { snapshot: () => ({ x: e.x + 20, y: 650, vx: 0, vy: 0 }), id: 44 };
        f.emit('projectile.launch', { owner: e, projectileId: 44, projectile: shot });
        assert.equal(w.stock[item.id], undefined, 'Unlimited charge does not create/debit paid stock');
        assert.equal(p.cashEarned, 0);
        for (const action of ['landing', 'end', 'bounce'])
            f.api.shotReward({ owner: e, projectileId: 44 }, action);
        assert.equal(p.cashEarned, 0, 'Free escape emits no shoot/landing/resolution/bounce awards');
        const calls = [];
        let accepted = 0;
        f.talus.world.terrainWork = async (s) => (calls.push(s), { status: 'completed', accepted, work: accepted });
        await f.api.terrainPayload(f.m.attack, { x: e.x + 20, y: 650 }, item.behavior);
        accepted = 14;
        await f.api.terrainPayload(f.m.attack, { x: e.x + 20, y: 650 }, item.behavior);
        assert.equal(calls[0].replacement, 'matching');
        assert.equal(calls[0].bounds.h, 1024);
        assert.equal(calls[0].recipe.macro.strata[0].element, 'SMOKE');
        assert.ok(calls[0].budget.cells < 2200, 'Escape wedge is much smaller than paid Riot Charge');
        assert.equal(p.damage, 0);
        assert.equal(p.cashEarned, 0);
    }
    console.log('PASS: native-cell escape eligibility, generalized unlimited inventory/UI, unchanged paid riot stock, native tiny smoke wedge, no fabricated progress or combat cash');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
