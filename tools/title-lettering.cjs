/** Outline the engine's VCR font into reusable native vector stamps. */
const fs = require('node:fs'), path = require('node:path'), opentype = require('opentype.js');
const { ROOT, writeJSON } = require('./lib/files.cjs');
const colors = ['#050509', '#30303c', '#757580', '#b7b7bf', '#f5f5f7'];
function outline(font, text, width, height) {
    const shape = font.getPath(text, 0, 0, 64), box = shape.getBoundingBox();
    for (const command of shape.commands) for (const suffix of ['', '1', '2']) {
        if (command['x' + suffix] != null) command['x' + suffix] = Math.round((command['x' + suffix] - box.x1) * width / (box.x2 - box.x1) * 100) / 100;
        if (command['y' + suffix] != null) command['y' + suffix] = Math.round((command['y' + suffix] - box.y1) * height / (box.y2 - box.y1) * 100) / 100;
    }
    return shape.toPathData({ decimalPlaces: 2, flipY: false });
}
const svg = (width, height, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges" role="img" aria-label="${label}"><title>${label}</title>${body}</svg>\n`;
function layers(parts) {
    return colors.map((color, layer) => parts.map(part => {
        const offset = (4 - layer) * 2;
        return `<path d="${part.svgPath}" transform="translate(${part.x + offset} ${part.y + offset})" fill="${color}"/>`;
    }).join('')).join('');
}
function generate(fontFile) {
    const bytes = fs.readFileSync(fontFile), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const parts = [
        { id: 'scorched-title-word', name: 'Scorched title lettering', text: 'Scorched', x: 24, y: 22, width: 354, height: 42 },
        { id: 'earth-title-word', name: 'Earth title lettering', text: 'Earth', x: 402, y: 22, width: 208, height: 42 },
        { id: 'year-title-word', name: '2026 title lettering', text: '2026', x: 280, y: 90, width: 80, height: 17 },
    ].map(part => ({ ...part, svgPath: outline(font, part.text, part.width, part.height), viewBox: `0 0 ${part.width} ${part.height}` }));
    const folder = path.join(ROOT, 'world/Art/Title'); fs.mkdirSync(folder, { recursive: true });
    for (const part of parts) fs.writeFileSync(path.join(folder, part.id + '.svg'), svg(part.width, part.height, `<path d="${part.svgPath}" fill="#fff"/>`, part.name));
    fs.writeFileSync(path.join(folder, 'logo.svg'), svg(640, 128, layers(parts), 'Scorched Earth 2026'));
    const icon = [
        { x: 76, y: 102, svgPath: outline(font, 'SE', 348, 220) },
        { x: 128, y: 366, svgPath: outline(font, '2026', 244, 52) },
    ];
    fs.writeFileSync(path.join(folder, 'icon.svg'), svg(512, 512, '<rect width="512" height="512" fill="#111125"/>' + layers(icon), 'Scorched Earth 2026 icon'));
    writeJSON(path.join(ROOT, 'world/Game/title-vectors.json'), {
        shapes: parts.map(({ id, name, svgPath, viewBox }) => ({ id, name, svgPath, viewBox })),
    });
    writeJSON(path.join(ROOT, 'world/Game/title-lettering.json'), {
        width: 640, height: 128, colors, parts: parts.map(({ svgPath, viewBox, ...part }) => part),
    });
    console.log('Wrote layered SVG, icon and three reusable VCR font vector stamps.');
}
module.exports = { generate, outline, layers, svg, colors };
if (require.main === module) {
    if (!process.argv[2]) throw Error('Usage: node tools/title-lettering.cjs /path/to/Talus/public/fonts/VCR_OSD_MONO.ttf');
    generate(path.resolve(process.argv[2]));
}
