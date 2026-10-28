/** Small material-bearing scenery templates for native maze/zone spawn rules. */
function color(hex) {
    const rgb = parseInt(hex, 16);
    return ((rgb & 255) << 16) | (rgb & 0xff00) | (rgb >>> 16);
}

function shape(id, width, height, sample, health = 100) {
    const pixels = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const value = sample(x, y);
        if (value) pixels.push({ localX: x - Math.floor(width / 2), localY: y - Math.floor(height / 2),
            elementType: value[0], color: color(value[1]) });
    }
    return { id, name: `scorched-earth/scenery/${id}`, patch: {
        description: 'Destructible scenery placed by native procedural maze or zone spawn settings.',
        canvasWidth: width, canvasHeight: height, isPlayer: false, isStatic: false, indestructible: false,
        itemData: null, vendorData: null, shaderId: null, shaderInterest: false,
        tags: ['scenery', id], stats: { maxHealth: health }, pixels: [], joints: [],
        particleAnimationLayers: [], particleAnimationSets: [],
        bodies: [{ bodyIndex: 0, name: id, isStatic: false, indestructible: false,
            gravityScale: 1, friction: 0.7, restitution: 0.04, linearDamping: 0.15,
            angularDamping: 0.3, maxLinearVelocity: 180, maxAngularVelocity: 12, pixels }],
    } };
}

function definitions() {
    return [
        shape('wood-crate', 22, 20, (x, y) => {
            const brace = x < 2 || y < 2 || x > 19 || y > 17 || Math.abs(x - y) < 2 || Math.abs(x + y - 21) < 2;
            return [8, brace ? 'b9894e' : y % 5 === 0 ? '3d2b20' : (x * 7 + y * 13) % 11 < 3 ? '805132' : '69432b'];
        }, 60),
        shape('concrete-barrier', 40, 16, (x, y) => {
            if (y < 4 && (x < 4 - y || x >= 36 + y)) return null;
            return [61, y < 4 ? ((x + y) % 12 < 6 ? 'd6b34f' : '34333b')
                : (x * 13 + y * 7) % 19 < 5 ? '757b84' : '9699a0'];
        }, 240),
        shape('rusted-girder', 36, 8, (x, y) => [23,
            y < 2 || y > 5 ? '8c633f' : (x * 5 + y * 3) % 13 < 4 ? '67422f' : '4e565e'], 160),
        shape('rubble-block', 20, 12, (x, y) => {
            if ((x < 3 || x > 16) && y < 3) return null;
            return [9, (x * 17 + y * 11) % 23 < 7 ? '86807b' : '5f656b'];
        }, 120),
        shape('ruined-outpost', 40, 34, (x, y) => {
            if (y < 5) return [23, y === 0 ? 'b8824d' : '644f41'];
            if (y < 9) return x % 8 < 2 ? [8, '715335'] : null;
            if (x > 14 && x < 25 && y > 16) return null;
            if (((x > 3 && x < 11) || (x > 29 && x < 37)) && y > 11 && y < 19) return null;
            return [61, y % 6 === 0 || (x + (Math.floor(y / 6) % 2) * 5) % 10 === 0 ? '55515a' : '99918a'];
        }, 360),
    ];
}

async function install() {
    const path = require('node:path');
    const { call } = require('../bridge.cjs');
    const { native, editor } = require('../project.cjs');
    const { ROOT, writeJSON } = require('./files.cjs');
    await editor();
    const existing = await native('return await talus.editor.templates.list()');
    const props = [...definitions(), { id: 'lamp', name: 'scorched-earth/scenery/lamp',
        basedOn: 'built-in/items/Lamp', patch: { description: 'A native lamp placed on maze floors.',
            tags: ['scenery', 'lamp'], isPlayer: false, isStatic: false, itemData: null, vendorData: null } }];
    const requests = [];
    for (const p of props) {
        const old = existing.find(row => row.name === p.name);
        const request = { ...(old ? { template: old.id } : {
            basedOn: p.basedOn || 'scorched-earth/creature-crow', name: p.name }), patch: p.patch };
        await call('save_entity_template', { ...request, dryRun: true });
        requests.push({ p, request });
    }
    const entities = [];
    for (const { p, request } of requests) {
        const result = await call('save_entity_template', request);
        const record = await native(`return await talus.editor.templates.get(${JSON.stringify(result.templateId)})`);
        if (!record || record.templateName !== p.name) throw Error(`Entity readback failed: ${p.id}`);
        writeJSON(path.join(ROOT, 'assets/native/entities', record.templateId + '.json'), record);
        entities.push({ id: p.id, templateId: record.templateId, name: record.templateName });
    }
    writeJSON(path.join(ROOT, 'world/Game/Mazes/entities.json'), { version: 1, entities });
    await native('await talus.editor.save();return true');
    return entities;
}

module.exports = { definitions, install };
