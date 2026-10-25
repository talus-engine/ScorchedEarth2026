// Game integration with actual E53's boolean durable-target contract. These
// doubles do not claim to prove native guidance or serialized collision reads.
const assert = require('node:assert/strict')
const { fixture } = require('./check_m8.cjs')
function scene(accepted, targetResidency) {
  const f = fixture(), [owner, target] = f.m.roster, assignments = [], removals = []
  const shooter = f.actors.get(owner.entityId), victim = f.actors.get(target.entityId)
  owner.control = 'human'; owner.weaponId = 'homing-rocket'; owner.targetId = target.entityId
  shooter.residency = 'stored'; victim.residency = targetResidency
  const wallet = f.api.bank.players.alpha; wallet.stock['homing-rocket'] = 2
  f.m.phase = 'firing'
  // The native launch callback is independent of the shooter's residency.
  f.m.attack = { owner: owner.entityId, item: owner.weaponId, damageBefore: 0, rootId: null, ids: {},
    launched: 0, ended: 0, emitted: 1, tasks: 0, pending: [], launchClock: null, spent: false,
    lastPoint: null, angle: -.7, power: 70, origin: null }
  const point = { x: 9000, y: 400, vx: 250, vy: -200 }
  const rocket = { id: 61, exists: true, snapshot: () => rocket.exists ? { id: 61, ...point } : null,
    setTarget(key) {
      assert.equal(typeof key, 'string', 'Guidance receives durable identity, not a live body id or a loaded handle')
      assert.equal(key, target.entityId); assignments.push(key); return accepted
    },
    remove() { removals.push('remove'); rocket.exists = false },
    detonate() { removals.push('detonate'); rocket.exists = false },
  }
  f.talus.projectiles = { get: id => id === rocket.id ? rocket : null }
  f.talus.world.watchSettle = () => ({ done: new Promise(() => {}) })
  f.emit('projectile.launch', { projectileId: rocket.id, owner: null, ownerEntityId: owner.entityId, projectile: rocket })
  return { ...f, owner, target, shooter, victim, wallet, rocket, point, assignments, removals }
}
for (const [accepted, targetResidency] of [[true, 'stored'], [false, 'stored'], [false, 'unresolved'], [false, 'destroyed']]) {
  const f = scene(accepted, targetResidency), attack = f.m.attack
  assert.equal(f.shooter.liveId, null); assert.equal(f.victim.liveId, null)
  assert.deepEqual(f.assignments, [f.target.entityId])
  assert.equal(f.wallet.stock['homing-rocket'], 1); assert.equal(f.owner.shots, 1)
  assert.equal(f.m.phase, 'flight'); assert.equal(f.m.shotId, f.rocket.id)
  assert.equal(attack.rootId, f.rocket.id); assert.equal(attack.launched, 1); assert.ok(attack.ids[f.rocket.id])
  const events = f.talus.state.getJson('indigo.events'), receipt = events.find(e => e.kind === 'homing-target')
  assert.deepEqual({ id: receipt.id, owner: receipt.owner, target: receipt.target, accepted: receipt.accepted },
    { id: f.rocket.id, owner: f.owner.entityId, target: f.target.entityId, accepted })
  assert.equal(events.filter(e => e.kind === 'ammo-spent').length, 1)
  assert.equal(f.m.message, accepted ? 'Attack in flight' : 'Homing refused · rocket in flight')
  assert.equal(f.ui.status, f.m.message, 'A false receipt is visible without hiding the launched rocket')
  assert.deepEqual(f.removals, []); assert.equal(f.rocket.exists, true)
  f.api.tickAttack()
  assert.equal(f.m.attack, attack); assert.equal(f.wallet.stock['homing-rocket'], 1)
  if (accepted) {
    f.shooter.residency = 'live'; f.shooter.liveId = 901
    f.victim.residency = 'live'; f.victim.liveId = 902
    f.api.tickAttack()
    assert.deepEqual(f.assignments, [f.target.entityId], 'Native durable guidance survives new roots without game reassignment')
  }
  f.rocket.exists = false
  f.emit('projectile.end', { projectileId: f.rocket.id, owner: null, ownerEntityId: f.owner.entityId,
    x: f.point.x, y: f.point.y, reason: 'detonated' })
  f.api.tickAttack()
  assert.equal(f.m.attack, null); assert.equal(f.m.shotId, null); assert.equal(f.m.phase, 'settling')
  assert.equal(f.wallet.stock['homing-rocket'], 1, 'An actual launch is paid exactly once, even when guidance refuses')
  assert.equal(f.api.bank.players.alpha.stock['homing-rocket'], 1)
  assert.equal(f.assignments.length, 1, 'No retry after an accepted physical cast')
  assert.deepEqual(f.removals, [], 'Target refusal neither cancels nor detonates the actual shot')
  assert.equal(attack.ended, 1)
  assert.equal(f.owner.cashBreakdown.shoot, f.shop.awards.shoot, 'Stored-owner launch keeps durable cash attribution')
  assert.equal(f.owner.cashBreakdown.resolution, f.shop.awards.resolution)
}
console.log('PASS: stored shooter/target use one durable homing assignment; explicit accepted/refused events and HUD; one ammunition debit; new roots require no reassignment; refused rockets stay tracked and resolve without refund, retry or cancellation')
