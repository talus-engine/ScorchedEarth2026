const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
const personas = require('../world/Game/personas.json');
function scene() {
    const f = fixture(); f.api.setPersonas(personas);
    Object.assign(f.m, { phase: 'finished', resultsShown: true, series: { complete: false }, seriesId: 'cup', seriesLength: 5,
        round: 2, seed: 19, baseGeneration: { recipe: 'rat-run', recipeParameters: { 'rat-run': { cellSize: 64 } } } });
    return f;
}
test('CPU round transition persists shopping and typed settings once before native acceptance', async () => {
    const f = scene(); let calls = 0, request;
    f.talus.game.newGame = async params => {
        calls++; request = params;
        assert.equal(f.talus.state.getJson('indigo.match').nextRoundRequest.status, 'requested');
        assert.equal(Object.keys(f.installed['indigo.economy'].cpuShops['economic-world:finished']).length, 2);
        return { status: 'accepted', requestId: 'next', projectId: 'project', seed: params.seed };
    };
    await Promise.all([f.api.advanceCpuRound(), f.api.advanceCpuRound()]);
    await f.api.advanceCpuRound();
    assert.equal(calls, 1); assert.equal(request.round, 3); assert.equal(request.seriesId, 'cup');
    assert.equal(request.humans, 0); assert.equal(request.computers, 2); assert.equal(request.seed, (19 + 0x9e3779b9) >>> 0);
    assert.equal(request.generation.recipeParameters['rat-run'].cellSize, 64);
});
test('CPU round transition respects presentation, pause, exit, native barriers and human choices', async () => {
    for (const inhibit of [f => f.m.resultsShown = false, f => f.talus.sim.paused = true,
        f => f.game.context.state.exitDrain = {}, f => f.game.context.state.arcadeCard = {},
        f => f.barriers.set('native', 'flight'), f => f.m.roster[0].control = 'human', f => f.m.series.complete = true]) {
        const f = scene(); let calls = 0; f.talus.game.newGame = async () => { calls++; };
        inhibit(f); await f.api.advanceCpuRound(); assert.equal(calls, 0);
    }
});
test('native refusal keeps paid shopping and offers an explicit retry without a request loop', async () => {
    const f = scene(); let calls = 0, opened = 0;
    f.talus.ui.openMenu = () => opened++;
    f.talus.game.newGame = async () => { calls++; return { status: 'refused', reason: 'terrain-busy' }; };
    await f.api.advanceCpuRound(); const spent = f.api.bank.players.alpha.spent;
    await f.api.advanceCpuRound();
    assert.equal(calls, 1); assert.equal(opened, 1); assert.equal(f.api.bank.players.alpha.spent, spent);
    assert.equal(f.m.nextRoundRequest.status, 'refused'); assert.match(f.m.message, /terrain-busy/);
});
