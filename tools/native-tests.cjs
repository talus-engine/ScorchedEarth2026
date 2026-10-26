/** Run the native solver and real Rapier/WASM benchmarks in a Talus checkout. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
if (!process.env.TALUS_ENGINE_ROOT)
    throw Error('Set TALUS_ENGINE_ROOT to a built Talus engine checkout.');
const engine = path.resolve(process.env.TALUS_ENGINE_ROOT);
const env = { ...process.env, TALUS_ENGINE_ROOT: engine, NODE_PATH: path.join(engine, 'node_modules') };
for (const args of [['tests/wfc-solver.cjs'], [path.join(engine, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'tests/native/vitest.config.mjs']]) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
    if (result.status)
        process.exit(result.status);
}
