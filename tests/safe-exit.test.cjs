const { loadGame } = require('./support/runtime.cjs');
// Exercise authored exit preparation against both script and native barriers.
// This does not claim native menu lifecycle/navigation acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
function scene() {
    const handlers = new Map(), barriers = new Map(), values = {}, menus = [], resumes = [], pauses = [], exits = [];
    let paused = true, native = false;
    const player = { slot: 0, inputEnabled: true };
    const talus = {
        editor: { available: false }, on(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); }, after() { },
        players: { list: () => [player] }, entities: { get: () => null },
        sim: { get paused() { return paused; }, pause() { paused = true; pauses.push(1); }, resume() { paused = false; resumes.push(1); } },
        game: { get saveStatus() { return { allowed: !native && ![...barriers.values()].some(Boolean), blockers: [] }; }, setSaveBarrier: (id, why) => barriers.set(id, why), quitToMenu: options => exits.push(options) },
        ui: { set(key, value) { if (typeof key === 'string')
                values[key] = value;
            else
                Object.assign(values, key); }, openMenu: file => menus.push(file) },
        state: { setJson() { } },
    };
    const c = { talus };
    const ctx = loadGame(c.talus, c).context;
    c.api = {
        configure() { ctx.state.booted = true; ctx.state.booting = false; ctx.state.match = { phase: 'turn', roster: [{ control: 'human', entityId: null }], focusIndex: 0, turnNumber: 1, presentation: { active: null, queue: [] }, chaos: { jobs: [] } }; ctx.session.persist(); },
        get match() { return ctx.state.match; }, get drain() { return ctx.state.exitDrain; },
        active: ctx.core.active,
        input: ctx.menus.input,
        persist: ctx.session.persist,
        tick: ctx.session.tickExitPreparation,
    };
    c.api.configure();
    return { api: c.api, talus, values, menus, player, pauses, resumes, exits,
        native(value) { native = value; },
        emit(name, e = {}) { for (const fn of handlers.get(name) || [])
            fn(e); },
        finish() { this.emit('menu.pause.finish-action'); this.emit('menu.closed', { file: 'Menus/pause.html', reason: 'close' }); },
    };
}
const shot = scene();
shot.api.match.phase = 'flight';
shot.api.match.attack = {};
shot.api.persist();
shot.finish();
assert.equal(shot.api.drain.phase, 'running');
assert.equal(shot.talus.sim.paused, false);
assert.equal(shot.player.inputEnabled, false);
assert.equal(shot.api.active(), false);
shot.api.input(true);
assert.equal(shot.player.inputEnabled, false, 'No human input is enabled by a continuing transition');
shot.api.tick(1);
assert.equal(shot.menus.length, 0, 'A pending shot does not open a save-ready menu');
assert.equal(shot.values.exitBlocked, true);
shot.api.match.phase = 'turn';
shot.api.match.attack = null;
shot.api.persist();
shot.native(true);
shot.api.tick(1);
assert.equal(shot.menus.length, 0, 'Other native work must finish even after game sequencing clears');
shot.native(false);
shot.api.tick(1);
assert.equal(shot.api.drain.phase, 'ready');
assert.equal(shot.talus.sim.paused, true);
assert.equal(shot.values.exitBlocked, false);
assert.equal(shot.menus[0], 'Menus/pause.html');
assert.equal(shot.api.active(), false, 'A ready CPU/human turn remains inhibited until explicit Resume');
shot.api.tick(1);
assert.equal(shot.menus.length, 1, 'The ready menu is not reopened each frame');
shot.emit('menu.custom.resume');
assert.equal(shot.api.drain, null);
assert.equal(shot.talus.sim.paused, false);
assert.equal(shot.api.active(), true);
assert.equal(shot.player.inputEnabled, true);
const interrupted = scene();
interrupted.api.match.phase = 'settling';
interrupted.api.persist();
interrupted.finish();
interrupted.talus.sim.pause();
const before = interrupted.resumes.length;
interrupted.api.tick(30);
assert.equal(interrupted.resumes.length, before, 'A later pause is never overridden by the drain');
assert.equal(interrupted.api.drain.elapsed, 0);
interrupted.emit('menu.closed', { file: 'Menus/pause.html', reason: 'back' });
assert.equal(interrupted.api.drain, null, 'Back from a later pause cancels preparation and restores play');
const bounded = scene();
bounded.native(true);
bounded.finish();
bounded.api.tick(181);
assert.equal(bounded.api.drain.phase, 'failed');
assert.equal(bounded.talus.sim.paused, true);
assert.equal(bounded.talus.game.saveStatus.allowed, false, 'Timeout never releases another subsystem’s barrier');
assert.match(bounded.values.exitStatus, /save has not been replaced/);
bounded.emit('menu.custom.cancel-exit');
assert.equal(bounded.api.drain, null);
const html = fs.readFileSync(path.join(root, 'world/Menus/pause.html'), 'utf8');
const reloaded = scene();
assert.equal(reloaded.api.drain, null);
reloaded.emit('menu.pause.resume');
assert.equal(reloaded.talus.sim.paused, false, 'Resume releases a saved explicit pause even after transient drain state was discarded');
assert.match(html, /data-talus-action="event" data-talus-event="save-title" data-talus-attr-disabled="exitBlocked"/);
const saving = scene();
saving.native(true);
saving.emit('menu.pause.save-title');
assert.equal(saving.exits.length, 0, 'Save & title preserves native save blockers');
saving.native(false);
saving.api.match.phase = 'flight';
saving.emit('menu.pause.save-title');
assert.equal(saving.exits.length, 0, 'Save & title also preserves game sequence barriers');
saving.api.match.phase = 'turn';
saving.emit('menu.pause.save-title');
assert.deepEqual(JSON.parse(JSON.stringify(saving.exits)), [{ save: 'required', destination: 'title' }], 'Saving overrides the project discard policy explicitly');
const quit = html.match(/<button[^>]*data-talus-action="quit"[^>]*>/)?.[0];
assert.ok(quit, 'An immediate quit action is always present');
assert.doesNotMatch(quit, /disabled|data-talus-show/, 'Quit remains available during native and scripted save blockers');
assert.match(html, /data-talus-action="resume" data-talus-event="finish-action"/);
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'world/Game/input.json'))).quitSavePolicy, 'discard');
console.log('PASS: unfinished shot and native barriers drain; new input stays inhibited; quiet boundary pauses once; Resume/Back restore play; later pauses respected; timeout preserves barriers; native destinations retained');
