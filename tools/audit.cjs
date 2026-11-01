/** Check template structure, native imports, file references and the portable archive. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseArgs, isDeepStrictEqual } = require('node:util');
const { createGunzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { ROOT, PROJECT, files, readJSON, run } = require('./lib/files.cjs');
const { build } = require('./menus.cjs');
const TEXT = new Set(['.md', '.ts', '.js', '.cjs', '.mjs', '.html', '.css', '.json', '.ink']);

async function auditArchive(problems) {
    const archive = path.join(ROOT, PROJECT.archive);
    if (!fs.existsSync(archive)) return;
    let folder, connection;
    try {
        const { DatabaseSync } = require('node:sqlite');
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'talus-template-audit-'));
        const database = path.join(folder, 'project.sqlite');
        await pipeline(fs.createReadStream(archive), createGunzip(), async function* (source) {
            let total = 0;
            for await (const chunk of source) {
                total += chunk.length;
                if (total > 1024 ** 3) throw Error('Archive exceeds the 1 GiB validation budget.');
                yield chunk;
            }
        }, fs.createWriteStream(database));
        connection = new DatabaseSync(database, { readOnly: true });
        const integrity = connection.prepare('PRAGMA integrity_check').all();
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') problems.push('Archive integrity: ' + JSON.stringify(integrity.slice(0, 3)));
        const lookup = connection.prepare('SELECT bytes FROM world_files WHERE world_id=? AND path=?');
        const world = path.join(ROOT, PROJECT.worldFiles);
        for (const file of files(world)) {
            const relative = path.relative(world, file).split(path.sep).join('/');
            const row = lookup.get(PROJECT.worldId, relative);
            if (!row || !Buffer.from(row.bytes).equals(fs.readFileSync(file))) problems.push('Archive source mismatch: ' + relative);
        }
        const title = connection.prepare('SELECT parent_id,kind,scene_id FROM world_document_links WHERE document_id=?').get(PROJECT.titleWorldId);
        if (!title || title.parent_id !== PROJECT.worldId || title.kind !== 'menu-scene' || title.scene_id !== 'menu:title') problems.push('Archive is missing the native Title world binding.');
        if (!connection.prepare('SELECT 1 FROM world_files WHERE world_id=? LIMIT 1').get(PROJECT.titleWorldId)) problems.push('Archive is missing Title world files.');
        if (connection.prepare('SELECT count(*) AS count FROM installed_game_state').get().count) problems.push('Archive contains installed player data.');
        const row = connection.prepare('SELECT template_name,is_template,description,game_ui_config FROM world_templates WHERE template_id=?').get(PROJECT.worldId);
        if (row?.template_name !== PROJECT.name || row.is_template !== 1 || !row.description?.trim()) problems.push('Archive must have the configured project title, Template flag and description.');
        if (!['Thumbnail/custom.png', 'Thumbnail/auto.png'].some(name => lookup.get(PROJECT.worldId, name)?.bytes?.length)) problems.push('Archive has no project thumbnail.');
        const actual = JSON.parse(row?.game_ui_config || '{}');
        const expected = readJSON(path.join(ROOT, 'world/Game/input.json'));
        if (Object.entries(expected).some(([key, value]) => !isDeepStrictEqual(actual[key], value))) problems.push('Archive native UI policy differs from Game/input.json.');
    } catch (error) {
        problems.push('Cannot validate project archive: ' + error.message);
    } finally {
        try { connection?.close(); }
        finally { if (folder) fs.rmSync(folder, { recursive: true, force: true }); }
    }
}

async function audit(sourceOnly = false) {
    const problems = [];
    const maintained = ['world', 'assets', 'tools', 'tests', 'docs'].flatMap(dir => files(path.join(ROOT, dir)));
    const forbidden = /(?<![A-Za-z0-9])m\d{1,2}(?![A-Za-z0-9])|\bE\d{2}\b|engine agent|handoff|checkpoint|legacy implementation|migration branch/i;
    for (const file of maintained) {
        const relative = path.relative(ROOT, file).split(path.sep).join('/'), ext = path.extname(file);
        if (!TEXT.has(ext)) continue;
        const source = fs.readFileSync(file, 'utf8');
        if (ext === '.json') try { JSON.parse(source); } catch (error) { problems.push(`${relative}: ${error.message}`); }
        if (relative !== 'tools/audit.cjs') {
            source.split('\n').forEach((line, i) => {
                // Encoded model/image bytes are assets, not prose.
                if (line.length < 1000 && forbidden.test(line)) problems.push(`${relative}:${i + 1}: historical source label`);
            });
            if (source.includes('/Users/') || source.includes('../foxtrot')) problems.push(`${relative}: workstation-specific path`);
        }
        if (ext === '.ts' && relative.startsWith('world/Scripts/')) {
            for (const [, name] of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
                if (!fs.existsSync(path.join(ROOT, 'world/Scripts/lib', name + '.ts'))) problems.push(`${relative}: missing native library ${name}`);
            }
        }
        if (['.html', '.json', '.ts', '.js'].includes(ext)) {
            for (const [, reference] of source.matchAll(/["']((?:Menus|Game|Graphs|Dialogue|WFC|Art)\/[A-Za-z0-9_./-]+\.(?:html|json|js|ink|png|webp|svg))["']/g)) {
                if (!fs.existsSync(path.join(ROOT, 'world', reference))) problems.push(`${relative}: missing world file ${reference}`);
            }
        }
    }
    for (const name of ['artifacts', 'backups', 'fixtures']) if (fs.existsSync(path.join(ROOT, name))) problems.push('Unexpected source directory: ' + name);
    if (spawnSync('git', ['ls-files', '--error-unmatch', 'AGENT_CHAT.md'], { cwd: ROOT }).status === 0) problems.push('AGENT_CHAT.md must remain untracked');
    if (spawnSync('git', ['check-ignore', '-q', 'AGENT_CHAT.md'], { cwd: ROOT }).status !== 0) problems.push('AGENT_CHAT.md is not ignored');
    if (spawnSync('git', ['ls-files', '--error-unmatch', PROJECT.archive], { cwd: ROOT }).status === 0) problems.push('The template archive belongs on the artifacts branch, not in source control.');
    if (spawnSync('git', ['check-ignore', '-q', PROJECT.archive], { cwd: ROOT }).status !== 0) problems.push('The local template archive must be ignored.');
    try { build(true); } catch (error) { problems.push(error.message); }
    if (!sourceOnly) {
        for (const name of ['README.md', 'world/Guide.md', 'world/Game/guide.json', 'world/Scripts/guide.ts', PROJECT.archive]) {
            if (!fs.existsSync(path.join(ROOT, name))) problems.push('Missing template entry: ' + name);
        }
        const definition = path.join(ROOT, 'world/Game/guide.json');
        if (fs.existsSync(definition) && readJSON(definition).visibility !== 'editor') problems.push('The level guide must be editor-only');
        if (forbidden.test(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'))) problems.push('README contains a historical source label');
        for (const file of [path.join(ROOT, 'README.md'), ...files(path.join(ROOT, 'docs')).filter(file => file.endsWith('.md'))]) {
            for (const [, target] of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
                if (!target.includes(':') && !fs.existsSync(path.resolve(path.dirname(file), target.split('#')[0]))) problems.push(`${path.basename(file)}: broken link ${target}`);
            }
        }
        await auditArchive(problems);
    }
    if (problems.length) throw Error(problems.join('\n'));
    console.log(`Template audit passed: ${maintained.length} maintained files.`);
}

module.exports = { auditArchive, audit };
if (require.main === module) run(async () => {
    const { values } = parseArgs({ options: { 'source-only': { type: 'boolean' }, help: { type: 'boolean' } } });
    if (values.help) return console.log('Usage: node tools/audit.cjs [--source-only]');
    await audit(values['source-only']);
});
