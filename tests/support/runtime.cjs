/** Load the actual native CommonJS libraries in an isolated test VM. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(require.resolve('typescript', { paths: [root, process.env.TALUS_ENGINE_ROOT || root] }));
function loadGame(talus, globals = {}) {
    const cache = new Map();
    const sandbox = vm.createContext({ talus, ...globals });
    function load(name) {
        if (!/^[a-z-]+$/.test(name))
            throw Error('Invalid native library: ' + name);
        if (cache.has(name))
            return cache.get(name).exports;
        const filename = path.join(root, 'world/Scripts/lib', name + '.ts');
        const source = fs.readFileSync(filename, 'utf8');
        const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS } }).outputText;
        const module = { exports: {} };
        cache.set(name, module);
        vm.runInContext('(function(require,module,exports){' + code + '\n})', sandbox, { filename })(load, module, module.exports);
        return module.exports;
    }
    const game = load('game')();
    const api = new Proxy({}, {
        get(target, key) {
            if (key in target)
                return target[key];
            if (key in game.context.state)
                return game.context.state[key];
            for (const [domain, service] of Object.entries(game.context))
                if (domain !== 'state' && key in service)
                    return service[key];
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    game.start();
    return { ...game, api, sandbox };
}
module.exports = { loadGame };
