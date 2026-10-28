const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./support/game.cjs');
const catalog = require('../world/Game/terrain-recipes.json');

test('random maps and landscape tours contain only WFC and the four maze styles', () => {
    assert.equal(catalog.defaultRecipe, 'random');
    assert.deepEqual(catalog.recipes.map(r => r.id), ['wfc', 'bunker-grid', 'rat-run', 'cavern-war', 'terrace-siege']);
    for (const recipe of catalog.recipes) {
        assert.ok(recipe.weight > 0);
        assert.equal(recipe.family, recipe.id === 'wfc' ? 'template' : 'maze');
        assert.deepEqual(recipe.bounds, { x: 0, y: 0, w: 12800, h: 1280 });
        if (recipe.family === 'maze') {
            assert.deepEqual(recipe.foundation, { height: 256, element: 9 });
            assert.ok(recipe.clearances.length, 'Mazes reserve open deployment space');
        }
    }
    const f = fixture();
    Object.assign(f.m, { biomeCycle: true, biomeRounds: 2, series: { complete: false }, baseGeneration: { recipe: 'random' } });
    for (let round = 1; round <= 20; round++) {
        f.m.round = round;
        assert.equal(f.api.nextGeneration().recipe, catalog.recipes[Math.floor(round / 2) % catalog.recipes.length].id);
    }
    f.m.biomeCycle = false;
    assert.equal(f.api.nextGeneration().recipe, 'random');
});

test('native terrain startup deploys without preset preflight or whole-map decoration', async () => {
    for (const recipe of catalog.recipes) {
        const f = fixture(), ctx = f.game.context, reads = [];
        f.m.phase = 'deploying';
        f.m.generation = recipe.id;
        for (const p of f.m.roster) p.placementReady = true;
        ctx.session.persist();
        ctx.state.booted = false;
        f.talus.files = { readText: async name => {
            reads.push(name);
            return fs.readFileSync(path.join(__dirname, '../world', name), 'utf8');
        } };
        const refuse = () => { throw Error('Startup must not visit or decorate the entire map'); };
        f.talus.world.generation.status = () => ({ recipeId: recipe.id, phase: 'ready' });
        f.talus.world.resources = { catalogs: refuse, validate: refuse, read: refuse };
        f.talus.world.findSurface = refuse;
        f.talus.world.terrainWork = refuse;
        f.talus.ui.damageTextStyle = () => {};
        f.talus.ui.hud = () => {};
        f.talus.camera.setZoom = () => {};
        f.talus.camera.follow = () => {};
        f.talus.camera.frame = () => {};
        f.talus.state.set = () => {};
        f.talus.encounters = { get: () => ({}) };
        ctx.payloads.load = async () => {};
        ctx.equipment.passivePosture = () => {};
        ctx.presentation.nameplate = () => {};
        ctx.session.run = () => {};
        ctx.menus.publish = () => {};
        await ctx.lifecycle.boot();
        assert.equal(ctx.state.booted, true);
        assert.equal(ctx.state.match.phase, 'ready');
        assert.ok(reads.includes('Game/terrain-recipes.json'));
        assert.ok(reads.every(name => !name.startsWith('Game/Presets/')));
    }
});
