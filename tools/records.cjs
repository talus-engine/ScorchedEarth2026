/** Capture or install native entities, animations, lighting, backgrounds and custom elements. */
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, isDeepStrictEqual } = require('node:util');
const { ROOT, readJSON, writeJSON, run } = require('./lib/files.cjs');
const { call } = require('./bridge.cjs');
const { editor, native } = require('./project.cjs');
const DIRECTORY = path.join(ROOT, 'assets/native');
const KINDS = ['animationClip', 'animationController'];
const recordsIn = folder => fs.readdirSync(folder).filter(name => name.endsWith('.json')).sort().map(name => path.join(folder, name));

function entityIds() {
    const arena = readJSON(path.join(ROOT, 'world/Game/arena.json'));
    const shop = readJSON(path.join(ROOT, 'world/Game/shop.json'));
    const payloads = ['creatures', 'ordnance', 'tricksters'].flatMap(name => {
        const file = path.join(ROOT, 'world/Game', name + '.json');
        return fs.existsSync(file) ? readJSON(file).nativeEntities || [] : [];
    });
    const sceneryFile = path.join(ROOT, 'world/Game/Mazes/entities.json');
    const scenery = fs.existsSync(sceneryFile) ? readJSON(sceneryFile).entities.map(row => row.templateId) : [];
    return [...new Set([arena.tankTemplate, ...arena.tankPalettes.map(p => p.templateId),
        ...shop.items.flatMap(item => [item.template, item.modTemplate].filter(Boolean)), ...payloads, ...scenery])].sort();
}

function saveRecords(folder, rows, key) {
    fs.mkdirSync(folder, { recursive: true });
    for (const file of recordsIn(folder)) fs.unlinkSync(file);
    for (const row of rows) writeJSON(path.join(folder, row[key] + '.json'), row);
}

function lightingIds() {
    const folder = path.join(ROOT, 'world/Biomes');
    return fs.existsSync(folder)
        ? [...new Set(recordsIn(folder).map(file => readJSON(file).lightingId).filter(Boolean))].sort()
        : [];
}

async function capture() {
    const ids = entityIds(), rows = [];
    for (const id of ids) {
        rows.push((await call('read_asset', { kind: 'entity', id })).record);
        if (rows.length % 20 === 0) console.log(`Read ${rows.length} entity records`);
    }
    saveRecords(path.join(DIRECTORY, 'entities'), rows, 'templateId');
    for (const kind of KINDS) {
        const records = await native(`const kind=${JSON.stringify(kind)},ids=${JSON.stringify(ids)};const out=[];for(const row of await talus.editor.records.list(kind)){const record=await talus.editor.records.get(kind,row.id);if(ids.includes(record.entityTemplateId))out.push(record)}return out`);
        saveRecords(path.join(DIRECTORY, kind), records, kind === 'animationClip' ? 'clipId' : 'controllerId');
    }
    const lighting = [];
    for (const id of lightingIds()) {
        const record = await native(`return await talus.editor.records.get('lighting',${JSON.stringify(id)})`);
        if (!record) throw Error('Missing biome lighting: ' + id);
        lighting.push(record);
    }
    saveRecords(path.join(DIRECTORY, 'lighting'), lighting, 'id');
    const backgrounds = [];
    const backgroundIds = [...new Set(recordsIn(path.join(ROOT, 'world/Biomes')).map(file => readJSON(file).backgroundId).filter(Boolean))];
    for (const id of backgroundIds) {
        const record = await native(`return await talus.editor.records.get('background',${JSON.stringify(id)})`);
        if (!record) throw Error('Missing biome background: ' + id);
        backgrounds.push(record);
    }
    saveRecords(path.join(DIRECTORY, 'backgrounds'), backgrounds, 'id');
    console.log(`Captured ${rows.length} entity records, their animation libraries and ${lighting.length} lighting presets.`);
}

async function install() {
    await elements();
    const proposals = [];
    for (const file of recordsIn(path.join(DIRECTORY, 'entities'))) {
        const record = readJSON(file), id = record.templateId;
        const current = await native(`return await talus.editor.templates.get(${JSON.stringify(id)})`);
        if (current == null) throw Error('Import the complete project before installing native records: ' + id);
        const patch = Object.fromEntries(Object.entries(record).filter(([key, value]) => key !== 'templateId' && !isDeepStrictEqual(current[key], value)));
        if (Object.keys(patch).length) {
            await call('save_entity_template', { template: id, patch, dryRun: true });
            proposals.push({ id, patch });
        }
    }
    for (const kind of [...KINDS, 'lighting']) for (const file of recordsIn(path.join(DIRECTORY, kind))) {
        await native(`return await talus.editor.records.save(${JSON.stringify(kind)},${JSON.stringify(readJSON(file))})`);
    }
    for (const file of recordsIn(path.join(DIRECTORY, 'backgrounds')))
        await native(`return await talus.editor.records.save('background',${JSON.stringify(readJSON(file))})`);
    for (const { id, patch } of proposals) {
        await call('save_entity_template', { template: id, patch });
        const actual = await native(`return await talus.editor.templates.get(${JSON.stringify(id)})`);
        if (Object.entries(patch).some(([key, value]) => !isDeepStrictEqual(actual[key], value))) throw Error('Native record readback mismatch: ' + id);
    }
    await native('await talus.editor.save();return true');
    console.log(`Installed ${proposals.length} changed entity records.`);
}

async function elements() {
    const folder = path.join(DIRECTORY, 'elements');
    if (!fs.existsSync(folder)) return;
    for (const file of recordsIn(folder)) {
        const spec = readJSON(file);
        const actual = await native(`const spec=${JSON.stringify(spec)};
            let element=talus.elements.get(spec.name);
            const base=element||talus.elements.get(spec.basedOn);
            if(!base)throw Error('Missing base element: '+spec.basedOn);
            const check=await base.validate(spec.fields);
            if(!check.ok)throw Error(JSON.stringify(check.problems));
            if(element)await element.update(spec.fields);
            else element=await talus.elements.create({name:spec.name,basedOn:spec.basedOn,fields:spec.fields});
            return {actual:JSON.parse(await element.exportJson()),fields:spec.fields};`);
        const mismatches = Object.entries(actual.fields).filter(([key, value]) => value === null
            ? actual.actual[key] != null : !isDeepStrictEqual(actual.actual[key], value));
        if (actual.actual.name !== spec.name || mismatches.length)
            throw Error('Element readback differs: ' + spec.name + ' ' + mismatches.map(([key]) => key).join(', '));
        console.log('Installed element: ' + spec.name);
    }
    await native('await talus.editor.save();return true');
}

if (require.main === module) run(async () => {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean' } } });
    const usage = 'Usage: node tools/records.cjs <capture|install|elements>';
    if (values.help) return console.log(usage);
    if (positionals.length !== 1 || !['capture', 'install', 'elements'].includes(positionals[0])) throw Error(usage);
    await editor();
    await ({ capture, install, elements })[positionals[0]]();
});
