const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');

function completed() {
    const f = fixture(), opened = [], exits = [];
    Object.assign(f.m, { phase: 'finished', resultsShown: true, round: 3, seriesLength: 5,
        seriesId: 'finished-cup', baseGeneration: { recipe: 'random' },
        series: { complete: true, champion: 'Bravo', standings: [
            { name: 'Bravo', wins: 3, kills: 3 }, { name: 'Alpha', wins: 0, kills: 0 },
        ] } });
    f.talus.ui.openMenu = file => opened.push(file);
    f.talus.game.quitToMenu = request => exits.push(request);
    return { ...f, opened, exits };
}

test('a completed series shows final results without another CPU shopping pass', async () => {
    const f = completed();
    const cash = f.api.bank.players.alpha.cash;
    f.api.openShop();
    assert.deepEqual(f.opened, ['Menus/results.html']);
    assert.equal(f.game.context.state.shopOpen, false);
    assert.equal(f.api.bank.players.alpha.cash, cash);
    assert.equal(f.ui.results.champion, 'Bravo');
    assert.equal(f.ui.results.roundsPlayed, 3);
    assert.equal(f.ui.results.seriesId, '');
    assert.equal(f.ui.results.round, 1);
    assert.equal(f.ui.results.seriesLength, 5);
    assert.equal(f.ui.results.namesText, 'Alpha\nBravo');
    assert.equal(f.ui.results.generation.recipe, 'random');
    let starts = 0;
    f.talus.game.newGame = async () => { starts++; };
    await f.api.advanceCpuRound();
    assert.equal(starts, 0, 'Completion waits for Restart Battle');
});

test('the final Main Menu action exits immediately; stale actions cannot interrupt play', () => {
    const f = completed();
    f.emit('menu.custom.results-title', {});
    assert.equal(f.exits[0].save, 'discard');
    assert.equal(f.exits[0].destination, 'title');
    f.m.phase = 'turn';
    f.emit('menu.custom.results-title', {});
    assert.equal(f.exits.length, 1);
    f.api.showResults();
    assert.equal(f.opened.length, 0);
});

test('an unfinished human series still uses its between-round armory', () => {
    const f = completed();
    f.m.series.complete = false;
    f.m.roster[0].control = 'human';
    f.api.openShop();
    assert.deepEqual(f.opened, ['Menus/shop.html']);
    assert.equal(f.game.context.state.shopOpen, true);
});
