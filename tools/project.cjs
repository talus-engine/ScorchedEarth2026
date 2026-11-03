/** Native declarations, UI policy, preset capture, editor guide and project export. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseArgs, isDeepStrictEqual } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { ROOT, PROJECT, WORLD_ID, readJSON, writeJSON, digest, run } = require('./lib/files.cjs');
const { call, script } = require('./bridge.cjs');

async function editor() {
    const context = await call('engine_describe_context');
    const world = context.world;
    if (!world?.isEditorMode || world.templateId !== WORLD_ID || world.worldId !== WORLD_ID || !world.engineBooted) {
        throw Error('Open the configured root world in the Talus editor and wait for it to finish loading.');
    }
    return context;
}

async function mountedEditor() {
    const context = await editor();
    if (!context.files?.hostMount?.mounted || !context.files.worldDir) throw Error('The Talus root-world file mount is not ready.');
    return context.files.worldDir;
}

async function native(source) {
    const result = await script(source);
    if (!result.ok || result.error) throw Error(typeof result.error === 'string' ? result.error : JSON.stringify(result));
    return result.value;
}

async function write(file) {
    await call('write_world_file', { worldId: WORLD_ID, path: file, content: fs.readFileSync(path.join(ROOT, 'world', file), 'utf8') });
}

async function types() {
    const source = path.join(await mountedEditor(), 'Scripts/talus.d.ts');
    const target = path.join(ROOT, '.build/talus.d.ts');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    console.log('Saved current native declarations to .build/talus.d.ts');
}

async function ui() {
    await editor();
    const config = readJSON(path.join(ROOT, 'world/Game/input.json'));
    const actual = await native(`const config=${JSON.stringify(config)};const current=await talus.editor.records.get("gameUi");await talus.editor.records.save("gameUi",{...current,...config});await talus.editor.save();return await talus.editor.records.get("gameUi")`);
    if (Object.entries(config).some(([key, value]) => !isDeepStrictEqual(actual[key], value))) throw Error('Native game UI readback does not match Game/input.json.');
    console.log('Installed input bindings and game UI policy.');
}

async function arena() {
    await editor();
    const rules = readJSON(path.join(ROOT, 'world/Game/arena-rules.json'));
    const actual = await native(`const rules=${JSON.stringify(rules)};const layout=await talus.editor.layout.describe();const ids=new Set(rules.map(r=>r.id));const saved=await talus.editor.layout.setRules([...layout.rules.filter(r=>!ids.has(r.id)),...rules]);await talus.editor.save();return saved`);
    for (const expected of rules) {
        const row = actual.find(rule => rule.id === expected.id);
        if (!row || Object.entries(expected).some(([key, value]) => !isDeepStrictEqual(row[key], value)))
            throw Error('Native arena rule readback differs: ' + expected.id);
    }
    console.log('Installed projectile and loose-body arena edges.');
}

async function catalog() {
    await editor();
    const documents = [];
    const sources = [
        ['noise', 'noise', '/presets'], ['semantic', 'semantic', '/recipes'],
        ['growth', 'living', '/presets'], ['neural', 'neural', '/models'],
        ['vector', 'vectors', '/shapes'], ['material', 'element-catalog', '/elements'],
        ['settings', 'semantic-settings', '/presets/0'],
    ];
    for (const [kind, name, pointer] of sources) {
        const relative = `Game/Presets/${name}.json`;
        await write(relative);
        const document = { kind, path: relative, pointer, sha256: digest(fs.readFileSync(path.join(ROOT, 'world', relative))) };
        if (kind === 'settings') document.id = 'default';
        documents.push(document);
    }
    const assets = require('./mazes.cjs').resourceImages(readJSON(path.join(ROOT, 'world/Game/Mazes/catalog.json')));
    let { job } = await call('engine_resource_catalog', { action: 'capture', catalog: 'terrain-presets', documents, assets });
    while (['running', 'committing'].includes(job.state)) {
        await delay(500);
        ({ job } = await call('engine_resource_catalog', { action: 'status', job: job.id }));
    }
    if (job.state !== 'completed') throw Error(JSON.stringify(job.error || job));
    const result = job.catalog;
    writeJSON(path.join(ROOT, 'world/Game/Presets/catalog.json'), result);
    await write('Game/Presets/catalog.json');
    console.log(`Captured ${result.manifest.entries.length} project-owned resources.`);
}

async function guide() {
    await editor();
    const definition = readJSON(path.join(ROOT, 'world/Game/guide.json'));
    definition.markdown = fs.readFileSync(path.join(ROOT, 'world/Guide.md'), 'utf8');
    const note = await native(`const definition=${JSON.stringify(definition)};const old=(await talus.annotations.list()).find(n=>n.name===definition.name);const note=old?await talus.annotations.save({...old,...definition}):await talus.annotations.create(definition);await talus.editor.save();return note`);
    if (note.visibility !== 'editor') throw Error('Guide must remain editor-only.');
    console.log('Installed editor-only guide:', note.annotationId);
}

function expand(file) {
    return path.resolve(file === '~' ? os.homedir() : file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file);
}

function exportProject(args) {
    const destination = expand(args.output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const argv = [path.join(expand(args.publisher), 'tools/publish/cli.mjs'), '--profile', expand(args.profile), '--project', WORLD_ID, '--out', destination];
    if (args['publish-snapshot']) argv.push('--publish-snapshot');
    if (args.overwrite) argv.push('--overwrite');
    const result = spawnSync(expand(args.binary), argv, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal) throw Error('Publisher terminated by ' + result.signal);
    process.exitCode = result.status;
}

async function main() {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        help: { type: 'boolean' },
        binary: { type: 'string', default: '/Applications/Talus.app/Contents/MacOS/Talus' },
        publisher: { type: 'string', default: '/Applications/Talus.app/Contents/Resources/publisher' },
        profile: { type: 'string', default: path.join(os.homedir(), 'Library/Application Support/Talus') },
        output: { type: 'string', default: path.join(ROOT, PROJECT.archive) },
        'publish-snapshot': { type: 'boolean' }, overwrite: { type: 'boolean' },
    } });
    const usage = 'Usage: node tools/project.cjs <types|ui|arena|catalog|guide|export>\nExport: [--binary path] [--publisher path] [--profile path] [--output path] [--publish-snapshot] [--overwrite]';
    if (values.help) return console.log(usage);
    const actions = { types, ui, arena, catalog, guide, export: () => exportProject(values) };
    if (positionals.length !== 1 || !Object.hasOwn(actions, positionals[0])) throw Error(usage);
    await actions[positionals[0]]();
}

module.exports = { editor, mountedEditor, native, exportProject };
if (require.main === module) run(main);
