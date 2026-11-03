/** Export a matched native template and publish immutable remote revisions. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { ROOT, PROJECT, readJSON, digest, run } = require('./lib/files.cjs');

function command(binary, args, cwd = ROOT, { capture = false, timeout = 0 } = {}) {
    const result = spawnSync(binary, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`${path.basename(binary)} ${args[0]} failed (${result.signal || result.status})${capture ? ': ' + result.stderr.trim() : ''}`);
    return result.stdout?.trim() || '';
}

function matchingBuild(options) {
    const release = readJSON(path.join(options.publisher, 'release.json'));
    const checkout = fs.readFileSync(path.join(options.engine, 'build_number.txt'), 'utf8').trim();
    if (!/^\d+$/.test(checkout) || Number(checkout) < PROJECT.minimumEngineBuild || String(release.engineBuild) !== checkout) {
        throw Error(`Matching Talus build required: desktop ${release.engineBuild}, checkout ${checkout}; this template needs ${PROJECT.minimumEngineBuild} or later. Install a matching desktop before exporting.`);
    }
    return checkout;
}

function exportTemplate(options) {
    console.log(`Exporting with matched Talus build ${matchingBuild(options)}. Save and close the editor before running this command.`);
    command(process.execPath, [path.join(ROOT, 'tools/project.cjs'), 'export', '--overwrite',
        '--binary', options.binary, '--publisher', options.publisher, '--profile', options.profile]);
    command(process.execPath, [path.join(ROOT, 'tools/audit.cjs')]);
    command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test']);
}

function artifactPaths(entry) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid revision identity');
    return [`${entry.id}/${entry.sha256}`, `${entry.id}/latest.json`, `${entry.id}/registry.json`];
}

function validateEntry(entry) {
    if (entry.id !== PROJECT.registry.id || entry.templateId !== PROJECT.worldId || entry.name !== PROJECT.name || !entry.thumbnail) {
        throw Error('Export must carry the configured root ID, project title and a thumbnail. Correct it in the editor and export again.');
    }
    artifactPaths(entry);
}

async function verifyHosted(verify, { attempts = 20, wait = () => delay(15000), log = console.log } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try { verify(); return; }
        catch (error) {
            if (attempt === attempts) throw error;
            log(`Hosted verification pending (${attempt}/${attempts}); retrying in 15 seconds.`);
            await wait();
        }
    }
}

async function publishTemplate(options) {
    matchingBuild(options);
    const settings = PROJECT.registry, git = args => command('git', args, options.artifacts, { capture: true });
    if (git(['branch', '--show-current']) !== settings.branch) throw Error(`The artifact worktree must be on ${settings.branch}.`);
    if (git(['remote', 'get-url', 'origin']) !== settings.remote || git(['remote', 'get-url', '--push', 'origin']) !== settings.remote) {
        throw Error('The artifact origin must use the configured public repository over SSH.');
    }
    if (git(['status', '--porcelain'])) throw Error('The artifact worktree has pending changes. Review and finish them before publishing.');
    command('git', ['diff', '--exit-code', 'HEAD', '--', 'src/templates/templateRegistry.json'], options.engine);
    command('git', ['fetch', 'origin', settings.branch], options.artifacts);
    command('git', ['merge', '--ff-only', `origin/${settings.branch}`], options.artifacts);
    exportTemplate(options);
    matchingBuild(options);
    const sha256 = digest(fs.readFileSync(path.join(ROOT, PROJECT.archive)));
    if (fs.existsSync(path.join(options.artifacts, settings.id, sha256))) {
        throw Error('This revision folder already exists. Keep it immutable; verify/push its existing commit instead.');
    }
    const tool = path.join(options.engine, 'tools/templates/template-registry.mjs');
    const invoke = args => command(process.execPath, [tool, ...args], options.engine, { timeout: 60000 });
    invoke(['stage', '--archive', path.join(ROOT, PROJECT.archive), '--id', settings.id,
        '--base-url', settings.baseUrl, '--out', options.artifacts, '--version', options.version]);
    const entry = readJSON(path.join(options.artifacts, settings.id, 'latest.json'));
    validateEntry(entry);
    if (entry.sha256 !== sha256) throw Error('Staged archive changed during publication.');
    invoke(['verify', '--id', settings.id, '--local', options.artifacts]);
    command('git', ['add', '--', ...artifactPaths(entry)], options.artifacts);
    const changes = git(['diff', '--cached', '--name-status', '--no-renames']).split('\n').filter(Boolean);
    const allowed = artifactPaths(entry);
    if (changes.some(line => {
        const [status, file] = line.split('\t');
        return !['A', 'M'].includes(status) || !(file.startsWith(allowed[0] + '/') || allowed.slice(1).includes(file));
    })) throw Error('Refusing changes outside this new revision and its latest/registry pointers.');
    command('git', ['commit', '-m', `Publish ${PROJECT.name} template ${options.version}`], options.artifacts);
    command('git', ['push', 'origin', settings.branch], options.artifacts);
    await verifyHosted(() => invoke(['verify', '--id', settings.id]));
    console.log(`Published ${entry.id}: ${entry.sha256}\nLatest revision: ${settings.baseUrl}${settings.id}/latest.json`);
    console.log('Next: run the engine live registry lane, then review and commit only its registry file. The engine has not been staged, committed or pushed.');
    command('git', ['diff', '--', 'src/templates/templateRegistry.json'], options.engine);
}

async function main() {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        engine: { type: 'string', default: process.env.TALUS_ENGINE_ROOT || path.resolve(ROOT, '..', 'foxtrot') },
        artifacts: { type: 'string', default: path.resolve(ROOT, '..', path.basename(ROOT) + '-artifacts') },
        binary: { type: 'string', default: '/Applications/Talus.app/Contents/MacOS/Talus' },
        publisher: { type: 'string', default: '/Applications/Talus.app/Contents/Resources/publisher' },
        profile: { type: 'string', default: path.join(os.homedir(), 'Library/Application Support/Talus') },
        version: { type: 'string', default: new Date().toISOString().slice(0, 10) }, help: { type: 'boolean' },
    } });
    const usage = 'Usage: node tools/template.cjs <export|publish> [--engine path] [--artifacts path] [--profile path] [--binary path] [--publisher path] [--version YYYY-MM-DD]';
    if (values.help) return console.log(usage);
    if (positionals.length !== 1 || !['export', 'publish'].includes(positionals[0])) throw Error(usage);
    for (const name of ['engine', 'artifacts', 'binary', 'publisher', 'profile']) values[name] = path.resolve(values[name]);
    if (positionals[0] === 'export') exportTemplate(values);
    else await publishTemplate(values);
}

module.exports = { matchingBuild, artifactPaths, validateEntry, verifyHosted };
if (require.main === module) run(main);
