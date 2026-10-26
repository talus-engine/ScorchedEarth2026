// Local authoring adapter for the game's pure script. The engine will run the
// same source through its sandbox; no Node dependency belongs in the game file.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../world/Game/title-logo-pattern.js'), 'utf8');
function pattern(logo) {
  return vm.runInNewContext('(function(logo){\n' + source + '\n})(logo)',
    {logo}, {timeout: 1000, filename: 'title-logo-pattern.js'});
}
module.exports = {pattern};
if (require.main === module) {
  const result = pattern(JSON.parse(fs.readFileSync(0, 'utf8')));
  process.stdout.write(JSON.stringify({...result, indices: Array.from(result.indices)}));
}
