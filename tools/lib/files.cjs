const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const PROJECT = readJSON(path.join(ROOT, 'project.json'));
const WORLD_ID = process.env.TALUS_PROJECT_ID || PROJECT.worldId;
const digest = data => createHash('sha256').update(data).digest('hex');

function writeJSON(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function files(root) {
    return fs.readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => path.join(entry.parentPath, entry.name)).sort();
}

function run(main) {
    Promise.resolve().then(main).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { ROOT, PROJECT, WORLD_ID, readJSON, writeJSON, digest, files, run };
