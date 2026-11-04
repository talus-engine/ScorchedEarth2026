const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { auditElements } = require('../tools/audit.cjs');
const { PROJECT } = require('../tools/lib/files.cjs');

test('archive audit rejects element definitions that a project import would omit', t => {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec('CREATE TABLE element_overrides(world_template_id TEXT, element_name TEXT NOT NULL, UNIQUE(world_template_id,element_name))');
    const insert = db.prepare('INSERT INTO element_overrides VALUES(?,?)');
    insert.run(null, 'SAND');
    insert.run(PROJECT.titleWorldId, 'TITLE_INK');
    insert.run(PROJECT.worldId, 'TANK_INK_VAPOR');
    const problems = [];
    auditElements(db, problems);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /project-owned schema/);
    assert.match(problems[1], /2 element definitions outside the project root/);
});

test('archive audit accepts root-owned elements shared by its child worlds', t => {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec('CREATE TABLE element_overrides(world_template_id TEXT NOT NULL, element_name TEXT NOT NULL, PRIMARY KEY(world_template_id,element_name))');
    const insert = db.prepare('INSERT INTO element_overrides VALUES(?,?)');
    insert.run(PROJECT.worldId, 'SAND');
    insert.run(PROJECT.worldId, 'TITLE_INK');
    const problems = [];
    auditElements(db, problems);
    assert.deepEqual(problems, []);
    assert.throws(() => insert.run(null, 'WATER'), /NOT NULL/);
    assert.throws(() => insert.run(PROJECT.worldId, 'SAND'), /UNIQUE/);
});
