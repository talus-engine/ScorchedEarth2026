/** Author per-palette native smoke elements and the empty trajectory raster layer. */
const path = require('node:path');
const { ROOT, readJSON, writeJSON, run } = require('./lib/files.cjs');
const rgb = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
function build() {
    const config = readJSON(path.join(ROOT, 'world/Game/shot-trails.json'));
    const base = readJSON(path.join(ROOT, 'assets/native/elements/TANK_INK_VAPOR.json'));
    const colors = [...new Set(readJSON(path.join(ROOT, 'world/Game/arena.json')).tankPalettes.map(p => p.color.toUpperCase()))];
    config.palettes = colors.map(color => {
        const key = color.slice(1), gas = 'TANK_INK_' + key;
        const bands = config.palette.bands.map(band => rgb(color).map((v, i) => v * (1 - band.amount) + rgb(band.mix)[i] * band.amount));
        writeJSON(path.join(ROOT, 'assets/native/elements', gas + '.json'), { name: gas, basedOn: base.basedOn,
            fields: { ...base.fields, color: rgb(color), renderMode: 'noise', textureAnchor: true,
                noiseSpec: { algorithm: 'simplex', frequency: .08, octaves: 3, persistence: .55, lacunarity: 2,
                    noiseMix: 1, noiseVisualMode: 'bands', layers: bands.map((c, i) => ({ color: c, alpha: 1,
                        scale: .08, strength: 1, endPos: (i + 1) / bands.length })) },
                shape: { kind: 'puff', size: 4, sizeJitter: .3, tween: .08 },
                opacityChannel: null } });
        return { color, gas };
    });
    for (const key of ['element', 'widthPixels', 'spacingPixels', 'bandLengthPixels', 'maxParticlesPerTick', 'maxLiveParticles']) delete config[key];
    delete config.palette.phase;
    config.smoke = { spacingPixels: 2, widthPixels: 4, particlesPerPoint: 4, maxPointsPerTick: 64 };
    config.path = { layer: 'Shot paths', widthPixels: 1, batchSeconds: .25, maxSpanPixels: 128, maxPending: 2048 };
    writeJSON(path.join(ROOT, 'world/Game/shot-trails.json'), config);
    console.log(`Authored ${colors.length} native smoke palettes.`);
}
async function install() {
    const { editor, native } = require('./project.cjs');
    await editor();
    await native(`let layer=talus.layers.get('Shot paths');
        if(!layer)layer=await talus.layers.create({type:'raster',name:'Shot paths',above:'foreground',
            props:{lit:false,locked:false,raster:{receivesScorch:false}}});
        if(layer.type!=='raster')throw Error('Shot paths must be a raster layer');
        await talus.editor.save();return {id:layer.id,name:layer.name,type:layer.type}`);
    console.log('Installed the native Shot paths raster above the foreground.');
}
if (require.main === module) run(async () => {
    const action = process.argv[2] || 'build';
    if (action === 'build') build();
    else if (action === 'install') await install();
    else throw Error('Usage: node tools/shot-visuals.cjs [build|install]');
});
module.exports = { build };
