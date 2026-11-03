import { fileURLToPath } from 'node:url';
const engine = process.env.TALUS_ENGINE_ROOT + '/';
export default {
    server: { fs: { allow: [engine, fileURLToPath(new URL('../../', import.meta.url))] } },
    cacheDir: './.build/native-tests',
    define: { __APP_VERSION__: JSON.stringify('game-aim-benchmark'), __BUILD_NUMBER__: '0' },
    resolve: { alias: { '@': engine + 'src', ...Object.fromEntries(['audio', 'image', 'video', 'asset', 'spritesheet', 'sprite-images'].map(k => ['virtual:' + k + '-manifest', engine + 'tests/setup/virtualManifestStub.ts'])) } },
    test: { environment: 'happy-dom', globals: true, include: ['tests/native/*.test.ts'],
        setupFiles: [engine + 'tests/setup/webgpuGlobals.ts', engine + 'tests/setup/coreScriptWasm.ts'], maxWorkers: 1, fileParallelism: false, testTimeout: 30000 },
};
