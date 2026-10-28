/** Assemble native streamed maze recipes from project-owned art and brush presets. */
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { ROOT, readJSON, run } = require('./lib/files.cjs');
const THEMES = path.join(ROOT, 'assets/mazes/themes.json');
const OUTPUT = path.join(ROOT, 'world/Game/Mazes/catalog.json');
const ACTIVE = path.join(ROOT, 'world/Game/terrain-recipes.json');
const copy = value => structuredClone(value);
const preset = name => readJSON(path.join(ROOT, 'world/Game/Presets', name + '.json'));

function required(rows, id, label) {
    const row = rows.find(row => row.id === id);
    if (!row) throw Error(`Missing ${label}: ${id}`);
    return copy(row);
}

function randomFor(id) {
    let n = 2166136261;
    for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
    return () => {
        n = Math.imul(n ^ n >>> 15, 1 | n);
        n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
        return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
}

function assemble({ tiles, props, catalog, themes = readJSON(THEMES).themes }) {
    const noise = preset('noise').presets, semantic = preset('semantic').recipes;
    const growth = preset('living').presets;
    const settings = preset('semantic-settings').presets[0];
    const style = id => ({ recipes: [required(semantic, id, 'semantic recipe')],
        weights: [{ anchorId: id, w: 1 }], settings: copy(settings), noisePresets: [], visuals: {} });
    const recipes = themes.map(theme => {
        const base = catalog.recipes.find(row => row.id === theme.recipe);
        if (!base || base.family !== 'maze') throw Error(`Missing maze recipe: ${theme.recipe}`);
        const recipe = copy(base), maze = recipe.maze, random = randomFor(theme.recipe);
        const fg = required(tiles, theme.foreground, 'foreground tile set');
        const bg = required(tiles, theme.background, 'background tile set');
        if (/background/i.test(fg.name) || !/background/i.test(bg.name)) throw Error('Foreground/background tile roles are reversed');
        maze.resources = { catalog: 'terrain-presets', tilesets: [fg, bg].map(tile => {
            if (!tile.path.startsWith('/Assets/Sprites/')) throw Error('Expected a native sprite sheet: ' + tile.path);
            return { id: tile.id, name: tile.name, imageRef: 'sprite-image:' + tile.path.slice('/Assets/Sprites/'.length),
                tileWidth: tile.tileWidth, tileHeight: tile.tileHeight, type: tile.ruleMode, layout: tile.layout };
        }) };
        const mapping = (tile, layerId, mazeKind, element) => ({ layerId, kind: 'tile', mazeKind,
            tilesetId: tile.id, tilesetSourcePath: tile.path, tilesetLayerId: tile.layers[0].id,
            elementId: element, materialElementId: element });
        maze.mappings = [mapping(fg, 'world', 'wall', theme.material),
            { layerId: 'world', kind: 'none', mazeKind: 'floor', elementId: 0, materialElementId: 0 },
            mapping(bg, 'background', 'wall-bg', 9), mapping(bg, 'background', 'floor', 9)];
        const stroke = (id, sourceKind, direction, size, order, fields = {}) => ({
            id: `${theme.recipe}:${id}`, name: id.replaceAll('-', ' '), enabled: true,
            direction, order, layerId: 'world', sourceKind, elementId: theme.material,
            brush: { size, shapeId: sourceKind === 'noise' ? 'star' : 'circle',
                rotationDeg: Math.round(random() * 360 - 180),
                rotationStepDeg: sourceKind === 'noise' ? 8 + Math.floor(random() * 49) : 0,
                lfoAmplitudePx: sourceKind === 'noise' ? 3 + Math.floor(random() * 10) : 0,
                lfoFrequencyHz: sourceKind === 'noise' ? Number((0.15 + random() * 0.5).toFixed(3)) : 0,
                spacingPx: sourceKind === 'grow' ? 48 : 8 }, ...fields,
        });
        const noisePreset = required(noise, theme.noise, 'noise preset');
        maze.strokes = [
            stroke('weathered-edge', 'noise', 'n', 12 + Math.floor(random() * 9), 0,
                { noisePresetId: noisePreset.id, noiseSpec: noisePreset.spec }),
            stroke('semantic-ledges', 'semantic', 'n', 20, 1, { content: { semantic: style(theme.semantic) } }),
            stroke('living-fringe', 'grow', 'n', 3, 2,
                { content: { growth: required(growth, theme.growth, 'living preset'), growthTextures: {} } }),
            stroke('tile-trim', 'tile', 's', 8, 0,
                { patternChoice: `preset:${fg.id}`, patternLayerId: fg.layers[0].id, content: { terrainId: 'solid' } }),
            stroke('pattern-inlay', 'pattern', 'w', 6, 0,
                { patternChoice: `preset:${fg.id}`, patternLayerId: fg.layers[0].id }),
            stroke('loose-grit', 'element', 's', 3, 1, { elementId: 11 }),
        ];
        maze.spawners = { enabled: true, maxSpawns: 48, footprintWidthPx: 44, footprintHeightPx: 36,
            avoidBoundaryCells: true, rules: theme.props.map((id, index) => {
                const prop = required(props, id, 'maze entity');
                return { id, templateId: prop.templateId, probability: 0.025, centroidMin: 0, centroidMax: 1,
                    noiseMin: index / (theme.props.length + 1), noiseMax: (index + 2) / (theme.props.length + 1),
                    initialFlags: { mazeScenery: true } };
            }) };
        maze.torches = { enabled: true, surface: 'floor', probability: 0.03, spacingTiles: 12,
            positionRatio: 0.5, jitterPx: 2, maxTorches: 24,
            types: [{ templateId: required(props, 'lamp', 'maze lamp').templateId, weight: 1,
                initialFlags: { mazeScenery: true } }] };
        maze.doors = { enabled: false, totalDoorCount: 0 };
        return recipe;
    });
    return { version: 1, recipes };
}

function build() {
    const tiles = readJSON(path.join(ROOT, 'assets/mazes/tiles.json')).presets;
    const props = readJSON(path.join(ROOT, 'world/Game/Mazes/entities.json')).entities;
    const catalog = readJSON(ACTIVE);
    const result = assemble({ tiles, props, catalog });
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n');
    catalog.recipes = catalog.recipes.map(recipe => result.recipes.find(maze => maze.id === recipe.id) || recipe);
    fs.writeFileSync(ACTIVE, JSON.stringify(catalog, null, 2) + '\n');
    return result;
}

function resourceImages(catalog) {
    return [...new Set(catalog.recipes.flatMap(recipe => recipe.maze?.resources?.tilesets.map(tile => tile.imageRef) || []))].sort();
}

module.exports = { assemble, build, resourceImages };
if (require.main === module) run(async () => {
    const { positionals, values } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean' } } });
    const usage = 'Usage: node tools/mazes.cjs <build|props>';
    if (values.help) return console.log(usage);
    if (positionals.length !== 1 || !['build', 'props'].includes(positionals[0])) throw Error(usage);
    if (positionals[0] === 'props') console.log(`Saved ${(await require('./lib/maze-props.cjs').install()).length} native scenery templates.`);
    else console.log(`Built ${build().recipes.length} native maze recipes.`);
});
