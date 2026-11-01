/** Capture authored files; install reviewed text through the public API.
 * No automatic deletions or conflict resolution. The baseline records identical bytes.
 */
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual, parseArgs } = require('node:util');
const { ROOT, WORLD_ID, digest, readJSON, writeJSON, run } = require('./lib/files.cjs');
const { call } = require('./bridge.cjs');
const { mountedEditor: context } = require('./project.cjs');
const TEXT = new Set(['.ts', '.js', '.json', '.ink', '.html', '.css', '.md', '.txt', '.svg', '.csv']);
const ASSETS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.wav', '.ogg', '.mp3', '.flac', '.bin']);
const GENERATED = new Set(['Scripts/talus.d.ts', 'Scripts/tsconfig.json']);

function inventory(root) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Error('Directory unavailable (mount may be offline): ' + root);
    if (fs.lstatSync(root).isSymbolicLink()) throw Error('Refusing symlink: ' + root);
    const out = {};
    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name);
            const relative = path.relative(root, file).split(path.sep).join('/');
            if (entry.isSymbolicLink()) throw Error('Refusing symlink: ' + file);
            if (entry.name.startsWith('.') || ['Thumbnail/', 'Worlds/', 'AI/world-raster/samples/'].some(prefix => (relative + '/').startsWith(prefix))) continue;
            if (entry.isDirectory()) { visit(file); continue; }
            const ext = path.extname(file);
            if (!entry.isFile() || GENERATED.has(relative) || entry.name.startsWith('example-')) continue;
            if (ext === '.js' && fs.existsSync(file.slice(0, -3) + '.ts')) continue;
            if (!TEXT.has(ext) && !ASSETS.has(ext)) continue;
            const data = fs.readFileSync(file);
            out[relative] = { sha256: digest(data), bytes: data.length };
        }
    }
    visit(root);
    if (!Object.keys(out).length) throw Error('No authored files found; refusing an empty snapshot');
    return out;
}

function classify(local, live, baseline) {
    return [...new Set([...Object.keys(local), ...Object.keys(live), ...Object.keys(baseline)])].sort().map(name => {
        const a = local[name]?.sha256 ?? null, b = live[name]?.sha256 ?? null, old = baseline[name];
        let state;
        if (a === b) state = a ? 'same' : 'absent';
        else if (old == null) state = a === null ? 'mount-new' : b === null ? 'repo-new' : 'conflict';
        else if (a === null || b === null) state = 'missing-side';
        else if (a === old) state = 'mount-changed';
        else if (b === old) state = 'repo-changed';
        else state = 'conflict';
        return { path: name, state, repo: a, mount: b };
    });
}

async function sync(action, localRoot, liveRoot, statePath, { paths, writer } = {}) {
    if (!['status', 'capture', 'install'].includes(action)) throw Error('Unknown sync action: ' + action);
    const old = fs.existsSync(statePath) ? readJSON(statePath) : { template: WORLD_ID, files: {} };
    if (old.template !== WORLD_ID) throw Error('Baseline belongs to a different template');
    const local = inventory(localRoot), live = inventory(liveRoot);
    const rows = classify(local, live, old.files);
    const selected = new Set(paths?.length ? paths : rows.map(row => row.path));
    const unknown = [...selected].filter(name => !rows.some(row => row.path === name));
    if (unknown.length) throw Error('Unknown paths: ' + unknown.sort().join(', '));
    const chosen = rows.filter(row => selected.has(row.path));
    if (action === 'status') return rows;
    const conflicts = chosen.filter(row => ['conflict', 'missing-side'].includes(row.state));
    if (conflicts.length) throw Error('Resolve these files explicitly before syncing: ' + conflicts.map(row => row.path).join(', '));
    const allowed = action === 'capture' ? ['mount-new', 'mount-changed'] : ['repo-new', 'repo-changed'];
    const work = chosen.filter(row => allowed.includes(row.state));
    if (action === 'install') {
        const unsupported = work.filter(row => !TEXT.has(path.extname(row.path)) || local[row.path].bytes > 1024 * 1024);
        if (unsupported.length) throw Error('Install these binary/large assets with talus.files.writeBytes: ' + unsupported.map(row => row.path).join(', '));
        if (!writer) throw Error('No public-API installer configured');
    }
    // Check the whole snapshot before mutation, and each source/destination at use.
    if (!isDeepStrictEqual(inventory(localRoot), local) || !isDeepStrictEqual(inventory(liveRoot), live)) throw Error('Files changed during preflight; retry after editing stops');
    for (const row of work) {
        const capture = action === 'capture';
        const src = path.join(capture ? liveRoot : localRoot, row.path);
        const dst = path.join(capture ? localRoot : liveRoot, row.path);
        const data = fs.readFileSync(src), sourceHash = capture ? row.mount : row.repo, destHash = capture ? row.repo : row.mount;
        if (digest(data) !== sourceHash || (fs.existsSync(dst) ? digest(fs.readFileSync(dst)) : null) !== destHash) throw Error('File changed before write: ' + row.path);
        if (capture) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            const temporary = path.join(path.dirname(dst), '.' + path.basename(dst) + '.capture');
            fs.writeFileSync(temporary, data);
            fs.renameSync(temporary, dst);
            if (digest(fs.readFileSync(dst)) !== sourceHash) throw Error('Capture readback failed: ' + row.path);
        } else {
            await writer(row.path, new TextDecoder('utf-8', { fatal: true }).decode(data));
        }
        old.files[row.path] = sourceHash;
    }
    for (const row of chosen) if (row.state === 'same') old.files[row.path] = row.repo;
    writeJSON(statePath, old);
    return rows.map(row => ({ ...row, applied: work.includes(row) }));
}

async function installText(file, content) {
    await context();
    await call('write_world_file', { worldId: WORLD_ID, path: file, content });
    if ((await call('read_world_file', { worldId: WORLD_ID, path: file })).content !== content) throw Error('Installed readback failed: ' + file);
}

async function main() {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { path: { type: 'string', multiple: true }, help: { type: 'boolean' } } });
    const usage = 'Usage: node tools/talus_sync.cjs <status|capture|install> [--path relative/path ...]';
    if (values.help) return console.log(usage);
    if (positionals.length !== 1 || !['status', 'capture', 'install'].includes(positionals[0])) throw Error(usage);
    const action = positionals[0];
    const rows = await sync(action, path.join(ROOT, 'world'), await context(), path.join(ROOT, '.build/sync/baseline.json'), { paths: values.path, writer: installText });
    for (const row of rows) if (row.state !== 'same') console.log((row.applied ? 'APPLIED ' : '') + row.state + ' ' + row.path);
    console.log(`${rows.filter(row => row.state === 'same').length} identical files; no deletions`);
    if (action === 'install') {
        const result = await call('engine_run_script', { source: 'await talus.editor.save();return true', timeoutMs: 30000 }, 35);
        if (!result.value) throw Error('Template save did not complete');
        const status = await call('engine_script_status');
        if (status.faulted?.length) throw Error('Installed script fault: ' + JSON.stringify(status.faulted));
    }
}

module.exports = { inventory, classify, sync, context, installText };
if (require.main === module) run(main);
