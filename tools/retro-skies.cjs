/** Generate compact pixel skies and install them in the native background library. */
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { ROOT, readJSON, writeJSON, run } = require('./lib/files.cjs');

const palettes = [
    { id: 'sunset', name: 'Atomic Sunset', colors: ['#21145c', '#4535bb', '#7870ed', '#b85b9b', '#ed5859', '#ff913d'], sun: '#fff231' },
    { id: 'dawn', name: 'Desert Dawn', colors: ['#17265d', '#414fa5', '#7d79c1', '#c583ae', '#f7b69b', '#ffe2a6'], sun: '#fff5b3' },
    { id: 'cobalt', name: 'Cobalt Noon', colors: ['#13266f', '#2451b4', '#4388d5', '#80b7e9', '#bddeee'], sun: '#fffad1' },
    { id: 'ember', name: 'Ember Horizon', colors: ['#170e32', '#46214b', '#82304e', '#bd473f', '#f77b39', '#ffbd5b'], sun: '#ffe339' },
    { id: 'midnight', name: 'Midnight Range', colors: ['#070b20', '#0c1332', '#171f46', '#30345a', '#535471'], moon: '#dce9ee', stars: 190 },
    { id: 'violet', name: 'Violet Moon', colors: ['#140e37', '#241457', '#432578', '#684b97', '#9682b3'], moon: '#ffdfac', stars: 115 },
    { id: 'aurora', name: 'Arctic Moon', colors: ['#07152c', '#0d2c46', '#155461', '#438880', '#9dbca0'], moon: '#e0fff0', stars: 100 },
    { id: 'starfield', name: 'Deep Space', colors: ['#090a1c', '#101128', '#171832', '#20213d'], stars: 260 },
];
const rgb = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
function rng(seed) {
    let n = seed >>> 0;
    return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
function sky(palette, variant) {
    const width = 480, height = 270, png = new PNG({ width, height });
    const random = rng(0x19891991 + palettes.indexOf(palette) * 931 + variant * 773);
    const colors = palette.colors.map(rgb), bands = 24;
    const put = (x, y, color) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = (y * width + x) * 4;
        png.data.set([...color, 255], i);
    };
    for (let y = 0; y < height; y++) {
        const t = Math.floor(y / height * bands) / (bands - 1) * (colors.length - 1);
        const a = Math.min(colors.length - 1, Math.floor(t)), b = Math.min(colors.length - 1, a + 1);
        const color = colors[a].map((v, i) => Math.round(v + (colors[b][i] - v) * (t - a)));
        for (let x = 0; x < width; x++) put(x, y, color);
    }
    for (let i = 0; i < (palette.stars || 0); i++) {
        const x = Math.floor(random() * width), y = Math.floor(random() * height * .84);
        const light = ['#9095b9', '#c3c9da', '#f7f2d2'][Math.floor(random() * 3)];
        put(x, y, rgb(light));
        if (i % 43 === 0) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(x + dx, y + dy, rgb('#737a9b'));
    }
    if (palette.sun || palette.moon) {
        // Tank views put the terrain near mid-screen: leave a broad arc above it.
        const cx = Math.floor(width * (variant ? .74 : .26)), cy = Math.floor(height * (palette.sun ? .60 : .28));
        const radius = palette.sun ? 82 + variant * 12 : 28 + variant * 9;
        const color = rgb(palette.sun || palette.moon);
        for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius); y++)
            for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius); x++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
                // A sparse two-tone disc keeps the moon legible at the game's widest view.
                const crater = palette.moon && [[-.28, -.22, .19], [.23, .18, .26], [-.1, .49, .12]]
                    .some(([dx, dy, r]) => (x - cx - dx * radius) ** 2 + (y - cy - dy * radius) ** 2 < (r * radius) ** 2);
                put(x, y, crater ? color.map(v => Math.round(v * .78)) : color);
            }
    }
    return png;
}
function build() {
    const dir = path.join(ROOT, 'assets/native/backgrounds');
    fs.mkdirSync(dir, { recursive: true });
    const ids = [], previews = [];
    for (const palette of palettes) for (let variant = 0; variant < 2; variant++) {
        const id = `retro-${palette.id}-${variant}`, png = sky(palette, variant);
        ids.push(id); previews.push(png);
        writeJSON(path.join(dir, id + '.json'), { id, name: palette.name + (variant ? ' East' : ' West'), gradient: null,
            layers: [{ id: id + '-sky', name: palette.name, imageDataUrl: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64'),
                parallaxFactor: 1, parallaxFactorX: 1, parallaxFactorY: 1, offsetY: 0, opacity: 1, tiling: 'none', pixelScale: 1 }] });
        writeJSON(path.join(ROOT, 'world/Biomes', id + '.json'), { name: palette.name, lightingId: 'scorched-daylight', backgroundId: id });
    }
    writeJSON(path.join(ROOT, 'world/Biomes/biomes.json'), { default: ids[0], random: { biomes: ids, weights: ids.map(() => 1) } });
    const sheet = new PNG({ width: 480 * 4, height: 270 * 4 });
    for (let i = 0; i < previews.length; i++) PNG.bitblt(previews[i], sheet, 0, 0, 480, 270, i % 4 * 480, Math.floor(i / 4) * 270);
    fs.mkdirSync(path.join(ROOT, '.build/visuals'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.build/visuals/retro-skies.png'), PNG.sync.write(sheet));
    console.log(`Generated ${ids.length} native backgrounds and seeded biome choices.`);
}
async function install() {
    const { editor, native } = require('./project.cjs');
    await editor();
    for (const name of fs.readdirSync(path.join(ROOT, 'assets/native/backgrounds')).filter(n => n.endsWith('.json'))) {
        const record = readJSON(path.join(ROOT, 'assets/native/backgrounds', name));
        await native(`return await talus.editor.records.save('background',${JSON.stringify(record)})`);
    }
    await preview();
    await native('await talus.editor.save();return true');
    console.log('Installed native retro backgrounds. Sync Biomes/ files before starting a new game.');
}
async function preview() {
    const { editor, native } = require('./project.cjs');
    await editor();
    const { default: skyId } = readJSON(path.join(ROOT, 'world/Biomes/biomes.json'));
    const changed = await native(`
        const skyId=${JSON.stringify(skyId)};
        if(!await talus.editor.records.get('background',skyId))throw Error('Install the sky records first');
        const {grid}=await talus.editor.layout.describe();let changed=0;
        for(let x=grid.x;x<grid.x+grid.w;x+=32){
            const cells=await talus.editor.layout.cells({x,y:grid.y,w:Math.min(32,grid.x+grid.w-x),h:grid.h});
            const targets=cells.filter(c=>(c.backgroundId||c.type==='wfc')&&!c.backgroundBands&&c.backgroundId!==skyId)
                .map(c=>({x:c.x,y:c.y}));
            for(let i=0;i<targets.length;i+=256){
                const result=await talus.editor.layout.paint(targets.slice(i,i+256),{layer:'background',id:skyId});
                if(result.skipped.length)throw Error(JSON.stringify(result.skipped));
                changed+=result.changed;
            }
        }
        await talus.editor.save();return changed;
    `);
    console.log(`Bound ${changed} authored cells to the default sky; game biomes choose their seeded sky.`);
}
if (require.main === module) run(async () => {
    const action = process.argv[2] || 'build';
    if (action === 'build') build();
    else if (action === 'install') await install();
    else if (action === 'preview') await preview();
    else throw Error('Usage: node tools/retro-skies.cjs [build|install|preview]');
});
module.exports = { build, sky, palettes };
