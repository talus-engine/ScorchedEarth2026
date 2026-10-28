const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/game.cjs');
const catalog = require('../world/Game/players.json');
const personas = require('../world/Game/personas.json');
const arena = require('../world/Game/arena.json');
function setup() {
    const f = fixture();
    f.game.context.state.playerCatalog = structuredClone(catalog);
    f.api.setPersonas(personas);
    return f;
}
test('authored CPU pool supplies ten distinct identities, all personas and all skill levels', () => {
    const f = setup(), m = f.api.validate({ humans: 0, computers: 10, turnSeconds: 30 });
    assert.equal(catalog.maxPlayers, arena.maxPlayers);
    assert.equal(new Set(m.roster.map(p => p.name)).size, 10);
    assert.equal(new Set(m.roster.map(p => p.templateId)).size, 10);
    assert.equal(new Set(m.roster.map(p => p.personaId)).size, 5);
    assert.deepEqual([...new Set(m.roster.map(p => p.cpuSkill))].sort(), ['easy', 'expert', 'hard', 'regular', 'rookie']);
    for (const p of m.roster) {
        const character = catalog.characters.find(c => c.id === p.characterId);
        assert.equal(p.name, character.name);
        assert.equal(p.color, character.color);
        assert.equal(f.api.doctrine(p).candidateBudget, personas.personas.find(profile => profile.skill === p.cpuSkill).strategy.candidateBudget);
        assert.equal(f.api.doctrine(p).primary, personas.personas.find(profile => profile.id === p.personaId).strategy.primary);
    }
});
test('human names and CPU enum selections survive rounds without global difficulty overriding characters', () => {
    const f = setup(), params = { humans: 2, computers: 2, turnSeconds: 30,
        humanNames: ['  Alex  ', 'Robin'], cpuCharacters: ['badger', 'fizzle'], cpuSkill: 'expert' };
    const m = f.api.validate(params);f.api.load(m);
    assert.deepEqual(Array.from(m.roster,p=>p.name), ['Alex', 'Robin', 'Major Badger', 'Professor Fizzle']);
    assert.deepEqual(Array.from(m.roster,p=>p.cpuSkill), [null, null, 'hard', 'rookie']);
    assert.equal(new Set(m.roster.map(p=>p.templateId)).size,4);
    f.talus.game.params = params;
    const next = f.api.nextRoundParams(), restarted = f.api.validate(next);
    assert.deepEqual(Array.from(next.humanNames), ['Alex','Robin']);
    assert.deepEqual(Array.from(next.cpuCharacters), ['badger','fizzle']);
    assert.deepEqual(Array.from(restarted.roster,p=>p.name),Array.from(m.roster,p=>p.name));
    f.api.ensureWallets();
    assert.equal(f.api.playerKey(m.roster[0]), 'alex');
    assert.equal(f.api.wallet(m.roster[0]).name, 'Alex');
});
test('roster rejects invalid caps, duplicate names, duplicate or unknown CPU IDs before deployment', () => {
    const f=setup(), base={humans:0,computers:2,turnSeconds:30};
    for(const counts of [[0,0],[0,1],[11,0],[0,11],[5,6],[-1,4],[1.5,4]])
        assert.throws(()=>f.api.validate({...base,humans:counts[0],computers:counts[1]}),/Choose/);
    for(const counts of [[0,2],[2,0],[10,0],[0,10],[5,5]])
        assert.equal(f.api.validate({...base,humans:counts[0],computers:counts[1]}).roster.length,counts[0]+counts[1]);
    assert.throws(()=>f.api.validate({...base,cpuCharacters:['mole','mole']}),/different character/);
    assert.throws(()=>f.api.validate({...base,cpuCharacters:['not-real','mole']}),/CPU character/);
    assert.throws(()=>f.api.validate({...base,humans:2,computers:0,humanNames:[' Alex ','alex']}),/distinct human names/);
    assert.throws(()=>f.api.validate({...base,humans:1,computers:1,humanNames:['Dr. Domino'],cpuCharacters:['domino']}),/distinct human names/);
    assert.throws(()=>f.api.validate({...base,humans:1,computers:1,humanNames:['X'.repeat(33)]}),/32 characters/);
});
test('setup preserves a rejected draft without changing remembered player accounts', () => {
    const f=setup();f.m.phase='ready';
    f.installed.indigo={humans:0,computers:4,humanNames:['Remembered']};
    f.api.showSetup({humans:2,computers:1,humanNames:['Alex','alex'],cpuCharacters:['domino']});
    assert.deepEqual(Array.from(f.ui['installed.indigo'].humanNames),['Alex','alex']);
    assert.deepEqual(f.installed.indigo.humanNames,['Remembered']);
    assert.equal(f.ui['installed.indigo'].computers,1);
});
