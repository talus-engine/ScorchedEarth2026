/** Refresh the title's ignition sites and Home thumbnail from its native vector stamp. */
const fs = require('node:fs'), path = require('node:path');
const { PNG } = require('pngjs');
const { ROOT, writeJSON } = require('./lib/files.cjs');
function generate() {
    const world = path.join(ROOT, 'world');
    const sceneFile = path.join(world, 'Menus/Scenes/title.json');
    const scene = JSON.parse(fs.readFileSync(sceneFile));
    const image = scene.particleImages[0];
    const logo = PNG.sync.read(fs.readFileSync(path.join(world, image.file)));
    const sky = PNG.sync.read(fs.readFileSync(path.join(world, scene.backgrounds[0].file)));
    const ignitionSites = [];
    // Use opaque interior pixels, so no random brush can miss the lettering.
    for (let y = 8; y < logo.height; y += 16) for (let x = 8; x < logo.width; x += 16) {
        let filled = true;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (!logo.data[((y + dy) * logo.width + x + dx) * 4 + 3]) filled = false;
        }
        if (filled) ignitionSites.push([x, y]);
    }
    if (ignitionSites.length < 7) throw Error('Not enough opaque title ignition sites');
    image.materialScript.args = { ignitionSites };
    scene.loopSeconds = 25;
    writeJSON(sceneFile, scene);
    const thumbnail = new PNG({ width: 1280, height: 720 });
    for (let y = 0; y < thumbnail.height; y++) for (let x = 0; x < thumbnail.width; x++) {
        const target = (y * thumbnail.width + x) * 4;
        const source = (Math.floor(y * sky.height / thumbnail.height) * sky.width + Math.floor(x * sky.width / thumbnail.width)) * 4;
        sky.data.copy(thumbnail.data, target, source, source + 4);
        const lx = Math.floor(x / 2), ly = Math.floor((y - 260) / 2);
        if (ly >= 0 && ly < logo.height) {
            const pixel = (ly * logo.width + lx) * 4;
            if (logo.data[pixel + 3]) logo.data.copy(thumbnail.data, target, pixel, pixel + 4);
        }
    }
    fs.mkdirSync(path.join(world, 'Thumbnail'), { recursive: true });
    fs.writeFileSync(path.join(world, 'Thumbnail/custom.png'), PNG.sync.write(thumbnail));
    console.log(`Title: ${ignitionSites.length} ignition sites and 1280×720 Home thumbnail.`);
}
module.exports = { generate };
if (require.main === module) generate();
