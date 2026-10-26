/** Embed the shared arcade theme in native, self-contained HTML menus. */
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { ROOT, run } = require('./lib/files.cjs');

function build(check = false, directory = path.join(ROOT, 'world/Menus')) {
    const theme = fs.readFileSync(path.join(directory, 'arcade.css'), 'utf8').trim();
    const changed = [];
    for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.html')).sort()) {
        const file = path.join(directory, name);
        const source = fs.readFileSync(file, 'utf8');
        const result = source.replace(/<style data-game-theme>.*?<\/style>/s, () => `<style data-game-theme>\n${theme}\n</style>`);
        if (result !== source) {
            changed.push(name);
            if (!check) fs.writeFileSync(file, result);
        }
    }
    if (check && changed.length) throw Error('Run node tools/menus.cjs: ' + changed.join(', '));
    return changed;
}

module.exports = { build };
if (require.main === module) run(() => {
    const { values } = parseArgs({ options: { check: { type: 'boolean' }, help: { type: 'boolean' } } });
    if (values.help) return console.log('Usage: node tools/menus.cjs [--check]');
    build(values.check);
    console.log('Shared theme is synchronized across native menus.');
});
