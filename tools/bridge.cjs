/** Talus HTTP client. Credentials stay in the local profile. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseArgs } = require('node:util');
const { ROOT, PROJECT, WORLD_ID, run } = require('./lib/files.cjs');

async function call(name, args = {}, timeout = 120) {
    const tokenFile = process.env.TALUS_TOKEN_FILE || path.join(os.homedir(), 'Library/Application Support/Talus/bridge-token');
    const token = fs.readFileSync(tokenFile, 'utf8').trim();
    const base = (process.env.TALUS_BRIDGE_URL || 'http://127.0.0.1:3702').replace(/\/$/, '');
    const response = await fetch(`${base}/v1/tools/${encodeURIComponent(name)}`, {
        method: 'POST', body: JSON.stringify(args),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(Math.ceil(timeout * 1000)),
    });
    if (!response.ok) throw Error(`${name}: HTTP ${response.status}: ${await response.text()}`);
    const result = await response.json();
    if (result?.ok === false || result?.isError === true) throw Error(`${name}: ${JSON.stringify(result)}`);
    return result;
}

function script(source, timeout = 120) {
    return call('engine_run_script', { source, timeoutMs: timeout * 1000 }, timeout + 10);
}

async function main() {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { output: { type: 'string' }, help: { type: 'boolean' } } });
    const usage = 'Usage: node tools/bridge.cjs <tool> [JSON | @path] [--output path]';
    if (values.help) return console.log(usage);
    if (!positionals.length || positionals.length > 2) throw Error(usage);
    const [tool, input = '{}'] = positionals;
    const args = JSON.parse(input.startsWith('@') ? fs.readFileSync(input.slice(1), 'utf8') : input);
    const output = JSON.stringify(await call(tool, args), null, 2) + '\n';
    if (values.output) {
        fs.writeFileSync(values.output, output);
        console.log(JSON.stringify({ saved: values.output, bytes: Buffer.byteLength(output) }));
    } else process.stdout.write(output);
}

module.exports = { ROOT, PROJECT, WORLD_ID, call, script };
if (require.main === module) run(main);
