// Authored posture intent across native parking/reload. Physical terrain
// alignment itself remains a native acceptance check.
const assert = require('node:assert/strict')
const { fixture } = require('./check_m8.cjs')
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function scene(saved) {
  const f = fixture(), writes = []
  if (saved) f.api.load(structuredClone(saved))
  const m = f.api.match
  for (const p of m.roster) p.control = 'human'
  f.talus.ui.nameplate = () => {}
  f.api.testCpuHooks(null, async () => { throw Error('This fixture must not start a CPU action') })
  for (const tank of f.actors.values()) {
    tank.controller.posture = { config: { mode: 'upright' }, status: 'complete' }
    tank.controller.setPosture = config => {
      assert.equal(tank.residency, 'live', 'A stored/frozen controller cannot accept a posture write')
      writes.push({ id: tank.id, liveId: tank.liveId, config: structuredClone(config) })
      tank.controller.posture = { config: structuredClone(config), status: 'pending' }
      return { accepted: true, reason: 'ok' }
    }
  }
  return { ...f, m, writes }
}
async function endedTurn(residency) {
  const f = scene(), previous = f.m.roster[0], tank = f.actors.get(previous.entityId)
  tank.residency = residency
  f.m.turnNumber = 3; f.m.lastCardTurn = 3 // Its score card has already completed.
  const turning = f.api.beginTurn(true)
  await flush()
  assert.equal(f.m.focusIndex, 1); assert.equal(previous.passivePosturePending, true)
  assert.equal(f.writes.length, 0)
  assert.equal(f.talus.state.getJson('indigo.match').roster[0].passivePosturePending, true,
    'The missed reset is game save state, not only a transient readiness queue')
  f.emit('tick.frame', { dt: 0 }); f.emit('tick.frame', { dt: 1 }); await turning
  assert.equal(f.m.phase, 'turn')
  return { ...f, previous, tank }
}
async function main() {
  for (const residency of ['stored', 'frozen']) {
    const f = await endedTurn(residency)
    f.emit('entity.residency', { entityKey: f.previous.entityId })
    f.tank.residency = 'frozen'; f.emit('tick.sim.post', {})
    assert.equal(f.writes.length, 0); assert.equal(f.previous.passivePosturePending, true)
    f.tank.residency = 'live'; f.tank.liveId = 904 // No frozen→live event is emitted by the engine.
    f.emit('tick.sim.post', {})
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].id, f.previous.entityId)
    assert.equal(f.writes[0].liveId, 904); assert.equal(f.writes[0].config.mode, 'passive')
    assert.equal(f.previous.passivePosturePending, undefined)
    assert.equal(f.talus.state.getJson('indigo.match').roster[0].passivePosturePending, undefined)
    f.emit('tick.sim.post', {}); assert.equal(f.writes.length, 1, 'Restoring a tank does not repeatedly reset native posture work')
    assert.equal(f.actors.get(f.m.roster[1].entityId).controller.posture.config.mode, 'upright')
  }
  {
    const original = await endedTurn('stored')
    const reloaded = scene(original.talus.state.getJson('indigo.match'))
    const waiting = reloaded.m.roster[0], tank = reloaded.actors.get(waiting.entityId)
    tank.residency = 'frozen'
    reloaded.emit('tick.sim.post', {}); assert.equal(reloaded.writes.length, 0)
    tank.residency = 'live'; tank.liveId = 1201
    reloaded.emit('tick.sim.post', {}) // Fresh VM, no old Set and no residency event.
    assert.equal(reloaded.writes.length, 1); assert.equal(reloaded.writes[0].config.mode, 'passive')
    assert.equal(waiting.passivePosturePending, undefined)
  }
  for (const phase of ['focusing', 'refocusing', 'turn', 'telegraph', 'firing', 'flight']) {
    const f = scene(), current = f.m.roster[0]
    current.passivePosturePending = true; f.m.phase = phase
    f.emit('entity.residency', { entityKey: current.entityId }); f.emit('tick.sim.post', {})
    assert.equal(f.writes.length, 0, phase + ': a new active turn supersedes an older pending passive reset')
    assert.equal(current.passivePosturePending, undefined)
    assert.equal(f.actors.get(current.entityId).controller.posture.config.mode, 'upright')
  }
  {
    const f = scene(), other = f.m.roster[1]
    f.emit('entity.residency', { entityKey: other.entityId }); f.emit('tick.sim.post', {})
    assert.equal(f.writes.length, 0, 'Unrelated restoration without a pending reset leaves native posture untouched')
    other.passivePosturePending = true
    let refusals = 0
    f.actors.get(other.entityId).controller.setPosture = () => { refusals++; return { accepted: false, reason: 'unsupported' } }
    f.emit('tick.sim.post', {}); f.emit('tick.sim.post', {})
    assert.equal(refusals, 1, 'Unsupported native posture produces an explicit receipt, not an endless reset loop')
    assert.equal(f.talus.state.getJson('indigo.events').at(-1).kind, 'tank-restored')
    assert.ok(f.talus.state.getJson('indigo.events').some(e => e.kind === 'posture-refused' && e.receipt.reason === 'unsupported'))
  }
  console.log('PASS: actual parked/frozen end-of-turn defers posture; live/new-ID recovery applies once; fresh-VM save intent survives without events; active aiming/shooting and unrelated restores remain untouched; native refusal stays explicit')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
