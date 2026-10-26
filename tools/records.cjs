/** Capture or install the project's native entity and animation records. */
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
    return [...new Set([arena.tankTemplate, ...arena.tankPalettes.map(p => p.templateId),
        ...shop.items.flatMap(item => [item.template, item.modTemplate].filter(Boolean))])].sort();
}

function saveRecords(folder, rows, key) {
    fs.mkdirSync(folder, { recursive: true });
    for (const file of recordsIn(folder)) fs.unlinkSync(file);
    for (const row of rows) writeJSON(path.join(folder, row[key] + '.json'), row);
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
    console.log(`Captured ${rows.length} entity records and their animation libraries.`);
}

async function install() {
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
    for (const kind of KINDS) for (const file of recordsIn(path.join(DIRECTORY, kind))) {
        await native(`return await talus.editor.records.save(${JSON.stringify(kind)},${JSON.stringify(readJSON(file))})`);
    }
    for (const { id, patch } of proposals) {
        await call('save_entity_template', { template: id, patch });
        const actual = await native(`return await talus.editor.templates.get(${JSON.stringify(id)})`);
        if (Object.entries(patch).some(([key, value]) => !isDeepStrictEqual(actual[key], value))) throw Error('Native record readback mismatch: ' + id);
    }
    await native('await talus.editor.save();return true');
    console.log(`Installed ${proposals.length} changed entity records.`);
}

if (require.main === module) run(async () => {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean' } } });
    const usage = 'Usage: node tools/records.cjs <capture|install>';
    if (values.help) return console.log(usage);
    if (positionals.length !== 1 || !['capture', 'install'].includes(positionals[0])) throw Error(usage);
    await editor();
    await (positionals[0] === 'capture' ? capture() : install());
});
