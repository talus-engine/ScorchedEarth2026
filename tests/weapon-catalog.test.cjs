/** Keep menu ammunition, native casts, art and tank inventories in agreement. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { PNG } = require('pngjs');
const shop = require('../world/Game/shop.json');
const arena = require('../world/Game/arena.json');
const elementRows = require('../world/Game/Presets/element-catalog.json').elements;
const names = new Map(elementRows.map(e => [e.name, e.id]));
names.set('TERRA_LASER', require('../assets/native/materials/laser.json').id);
const ids = ['laser', 'baby-digger', 'digger-shell', 'heavy-digger', 'baby-sandhog', 'sandhog', 'heavy-sandhog'];
const items = ids.map(id => shop.items.find(i => i.id === id));
const record = id => JSON.parse(fs.readFileSync('assets/native/entities/' + id + '.json', 'utf8'));
// Wendell Hicken's Scorched Earth 1.5 manual, pages 23 and 28.
// https://www.whicken.com/scorch/scorch15.zip (SCORCH.DOC)
const originalWeapons = [
    'Baby Missile', 'Missile', 'Baby Nuke', 'Nuke', 'Leap Frog', 'Funky Bomb', 'MIRV', 'Death’s Head',
    'Napalm', 'Hot Napalm', 'Tracer', 'Smoke Tracer', 'Baby Roller', 'Roller', 'Heavy Roller',
    'Riot Charge', 'Riot Blast', 'Riot Bomb', 'Heavy Riot Bomb', 'Baby Digger', 'Digger', 'Heavy Digger',
    'Baby Sandhog', 'Sandhog', 'Heavy Sandhog', 'Dirt Clod', 'Dirt Ball', 'Ton of Dirt', 'Liquid Dirt',
    'Dirt Charge', 'Earth Disrupter', 'Plasma Blast', 'Laser',
];
const originalAccessories = ['Heat Guidance', 'Ballistic Guidance', 'Horz Guidance', 'Vert Guidance',
    'Lazy Boy', 'Parachute', 'Battery', 'Mag Deflector', 'Shield', 'Force Shield', 'Heavy Shield',
    'Super Mag', 'Auto Defense', 'Fuel Tank', 'Contact Trigger'];

test('every original weapon and accessory is uniquely enabled with its native loadout wired', () => {
    const tanks = [arena.tankTemplate, ...arena.tankPalettes.map(p => p.templateId)].map(record);
    for (const [kind, names] of [['weapon', originalWeapons], ['utility', originalAccessories]]) {
        const originals = shop.items.filter(i => i.kind === kind && i.original);
        assert.deepEqual(originals.map(i => i.original).sort(), [...names].sort());
        for (const original of names) {
            const item = originals.find(i => i.original === original);
            assert.equal(item.enabled, true, original);
            if (kind !== 'weapon') continue;
            const gun = record(item.template), mod = record(item.modTemplate);
            assert.equal(gun.itemData.isWeapon, true, original);
            assert.ok(gun.itemData.startingMods.some(id => [mod.templateId, mod.templateName].includes(id)), original);
            for (const [field, value] of Object.entries(item.projectile))
                if (field !== 'material') assert.deepEqual(mod.itemData.modSpec.projectile[field], value, original + ': ' + field);
            for (const tank of tanks) assert.ok(tank.startingItems.includes(item.template), tank.templateName + ': ' + original);
        }
    }
});

test('enabled cutting weapons use native casts and are present in every tank inventory', () => {
    const tanks = [arena.tankTemplate, ...arena.tankPalettes.map(p => p.templateId)].map(record);
    for (const item of items) {
        assert.ok(item.enabled, item.id);
        const gun = record(item.template), mod = record(item.modTemplate), cast = mod.itemData.modSpec.projectile;
        assert.equal(gun.itemData.isWeapon, true);
        assert.ok(gun.itemData.startingMods.includes(mod.templateName) || gun.itemData.startingMods.includes(mod.templateId));
        for (const [key, value] of Object.entries(item.projectile))
            if (key !== 'material') assert.deepEqual(cast[key], value, item.id + ' native/catalog ' + key);
        assert.equal(cast.elementType, names.get(item.projectile.material));
        for (const tank of tanks) assert.ok(tank.startingItems.includes(item.template), tank.templateName + ' missing ' + item.id);
    }
});

test('all native drill roots and payloads remain bounded and protect the complete foundation', () => {
    const floor = arena.bounds.y + arena.terrain.solidBottomTileRow * arena.tiles.chunksPerTile * 64;
    const right = arena.bounds.x + arena.bounds.w;
    const inspect = (spec, label) => {
        const x = spec.excavation;
        assert.equal(spec.kind, 'rigid-body', label);
        assert.equal(spec.carveRadius, 0, 'An unbounded explosion must not bypass cutter exclusions');
        assert.equal(spec.carveMode, 'none');
        assert.ok(x.work > 0 && x.work <= 1e7 && x.distance > 0 && x.distance <= 16384);
        assert.ok(spec.lifetime > 0 && spec.lifetime <= 8);
        assert.ok(x.radius >= spec.bodySizePx * Math.SQRT2 / 2 + 1);
        assert.equal(x.output, names.get('SMOKE'));
        assert.equal(x.clearance, 'solid');
        assert.ok(x.cutAhead >= spec.speed / 4, 'Cut a usable corridor, not two physics steps at a time');
        assert.ok(x.lookahead >= x.cutAhead && x.lookahead <= 128);
        assert.equal(x.onBlocked, 'detonate', 'A protected hull ends cutting and receives the native warhead blast');
        assert.ok(x.bounds.x <= arena.bounds.x && x.bounds.x + x.bounds.w >= right);
        assert.ok(x.bounds.y + x.bounds.h <= floor);
        assert.ok(x.exclusions.some(r => r.x <= arena.bounds.x && r.x + r.w >= right
            && r.y <= floor && r.y + r.h >= arena.bounds.y + arena.bounds.h));
        assert.ok(x.materials.some(m => m.element === names.get('ROOTS_STEM')));
        assert.ok(x.materials.every(m => m.hardness > 0));
        for (const child of spec.triggerChild || []) inspect(child, label + ' payload');
    };
    for (const item of items.filter(i => i.id !== 'laser')) inspect(item.projectile, item.id);
    for (const item of items.filter(i => i.id.includes('sandhog'))) {
        assert.ok(item.projectile.detonate.fuse > 0);
        assert.equal(item.projectile.triggerChild.length, 1);
        assert.ok([3, 5, 7].includes(item.projectile.triggerChild[0].projectilesPerShot));
        assert.equal(item.projectile.triggerChild[0].spreadPattern, 'uniform');
        assert.ok(!item.behavior, 'The native carrier owns its split; no second script payload');
    }
});

test('tiny cutting weapon sprites match the native painted pixels exactly', () => {
    const pictures = new Set();
    for (const item of items) {
        const png = PNG.sync.read(fs.readFileSync('assets/sprites/' + item.id + '.png'));
        const gun = record(item.template), expected = [];
        assert.ok(png.width <= 32 && png.height <= 16);
        assert.equal(png.width, gun.canvasWidth);
        assert.equal(png.height, gun.canvasHeight);
        for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
            const i = (y * png.width + x) * 4, [r, g, b, a] = png.data.subarray(i, i + 4);
            if (a) expected.push({ localX: x - Math.floor(png.width / 2), localY: y - Math.floor(png.height / 2),
                elementType: names.get('IRON'), color: (r | g << 8 | b << 16 | a << 24) >>> 0 });
        }
        assert.deepEqual(gun.bodies[0].pixels, expected, item.id);
        pictures.add(png.width + ':' + png.height + ':' + png.data.toString('hex'));
    }
    assert.equal(pictures.size, ids.length, 'Every gun has distinct pixel art');
});
