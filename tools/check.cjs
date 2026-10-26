/** Type-check game scripts, then execute the isolated behavior suite. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const declarations = path.resolve(process.env.TALUS_TYPES || '.build/talus.d.ts');
if (!fs.existsSync(declarations))
    throw Error('Set TALUS_TYPES to the editor’s Scripts/talus.d.ts, or run tools/project.py types.');
const scripts = path.join(root, 'world/Scripts');
const files = fs.readdirSync(scripts, { recursive: true }).filter(p => p.endsWith('.ts')).map(p => path.join(scripts, p));
const program = ts.createProgram([...files, declarations], {
    target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS, strict: true, noImplicitAny: false,
    moduleDetection: ts.ModuleDetectionKind.Force, verbatimModuleSyntax: true, skipLibCheck: true,
    noEmit: true, noUnusedLocals: true, noUnusedParameters: true, types: [], baseUrl: scripts, paths: { '*': ['./lib/*'] },
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root, getCanonicalFileName: p => p, getNewLine: () => '\n',
    }));
    process.exitCode = 1;
}
else {
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...fs.readdirSync(path.join(root, 'tests')).filter(p => p.endsWith('.test.cjs')).map(p => path.join(root, 'tests', p))], { stdio: 'inherit', cwd: root });
    process.exitCode = result.status || 0;
}
