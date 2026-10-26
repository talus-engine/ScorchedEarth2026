// Exercises game sequencing against the ENGINE-reserved E52 contract. The mock
// never interpolates a camera: only actual native acceptance can prove motion.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { fixture } = require('./check_m8.cjs')
function setup(computers = 2) {
  const f = fixture(undefined, false, computers), calls = [], texts = [], shots = [], holds = [], plates = []
  let tracking = null, serial = 0
  f.talus.camera = {
    get tracking() { return tracking },
    track(target, options) {
      const point = target.point || f.actors.get(typeof target.entity === 'string' ? target.entity : target.entity.id)?.position || null
      tracking = { id: ++serial, phase: 'moving', target: target.point ? { point: { ...point } } : { entityId: typeof target.entity === 'string' ? target.entity : target.entity.id },
        center: tracking?.center || { x: 0, y: 0 }, targetPoint: point && { ...point }, distance: null,
        tolerance: options.tolerance, ready: false, reason: null }
      calls.push({ target, options, center: { ...tracking.center } }); return tracking
    },
    hold() { if (tracking) tracking.phase = 'held'; return tracking },
    centerOn() { throw Error('No instantaneous camera positioning during gameplay') },
    frame() { throw Error('No all-tank frame') },
  }
  f.talus.ui.worldText = (id, spec) => texts.push({ id, spec, clock: f.talus.sim.clock })
  f.talus.ui.nameplate = (tank, spec) => plates.push({ id: tank.id, spec })
  f.talus.ui.fade = () => { throw Error('No fade-covered camera cut') }
  f.talus.ui.banner = () => {}
  f.talus.state.set = (key, value) => { f.ui[key] = value }
  f.talus.sim.paused = false
  for (const [id, tank] of f.actors) {
    tank.liveId = Number(id.slice(-1)) + 1
    tank.controller.holdPose = seconds => { holds.push({ id, seconds }); return { accepted: true, seconds } }
    tank.controller.levitate = () => ({ accepted: true })
    tank.controller.setPosture = () => ({ accepted: true })
    tank.weapon.fire = () => { shots.push({ id, clock: f.talus.sim.clock }); return true }
    tank.blackboard.set('custom.angle', 45); tank.blackboard.set('custom.power', 70)
  }
  const status = (phase, ready = phase === 'arrived') => {
    assert.ok(tracking); tracking.phase = phase; tracking.ready = ready
    if (phase === 'arrived') { tracking.center = { ...tracking.targetPoint }; tracking.distance = 0 }
  }
  return { ...f, calls, texts, shots, holds, plates, status }
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function gates(f) {
  const waiting = []
  f.talus.sleepTicks = () => new Promise(resolve => waiting.push(resolve))
  return async (dt = 1 / 60) => {
    f.talus.sim.clock += dt
    f.emit('tick.sim.pre', { dt }); f.emit('tick.sim.post', { dt })
    for (const resolve of waiting.splice(0)) resolve()
    await flush()
    assert.notEqual(f.api.match.phase, 'fault', f.ui['indigo.error'])
  }
}
function inputProbe(f) {
  const player = { slot: 0, inputEnabled: false, release() {}, readInput: () => ({ actions: {} }) }
  const cpu = []
  f.talus.players.list = () => [player]; f.talus.players.get = () => player
  f.api.testCpuHooks(null, async (p, turn) => { cpu.push({ id: p.entityId, turn }) })
  return { player, cpu }
}
function finishedDeath(f, p) {
  p.eliminated = true; p.chaosId = 1 // Its physical effect has already completed.
  const at = f.actors.get(p.entityId).position
  return { owner: p.entityId, kind: 'death', ...at, stage: 'effect', started: f.talus.sim.clock, elapsed: 0 }
}
function enableBoot(f) {
  // Preserve the fixture's utility capabilities across a real boot; utility
  // components are independently covered by the lifecycle/accounting suites.
  f.talus.files = { readText: async name => name === 'Game/shop.json' ? JSON.stringify(f.shop)
    : fs.readFileSync(path.join(__dirname, '../world', name), 'utf8') }
  f.talus.ui.damageTextStyle = () => {}; f.talus.ui.hud = () => {}
  f.talus.audio = { play() {} }; f.talus.encounters = { get: () => ({}) }
  f.talus.sim.pause = () => { f.talus.sim.paused = true }
  f.talus.camera.setZoom = zoom => assert.equal(zoom, .25)
  f.talus.camera.follow = mode => assert.equal(mode, 'off')
  f.talus.camera.frame = frame => assert.equal(frame, null, 'Reload clears only the obsolete all-tank frame')
}
async function main() {
  {
    const f = setup(), p = f.m.roster[0]
    f.m.phase = 'telegraph'; f.api.queuePresentation(p, 'shooting'); f.api.tickPresentation()
    assert.equal(f.m.presentation.active.stage, 'centering'); assert.equal(f.texts.length, 0)
    assert.equal(f.calls[0].target.entity, p.entityId); assert.equal(f.calls[0].options.whilePaused, false)
    f.talus.sim.clock += 4; f.api.tickPresentation()
    assert.equal(f.shots.length, 0); assert.equal(f.texts.length, 0, 'Travel time cannot consume the speech interval')
    f.status('loading'); f.talus.sim.clock += 1; f.api.tickPresentation()
    assert.equal(f.texts.length, 0, 'Being near the point before native terrain readiness is not arrival')
    f.status('arrived'); f.api.tickPresentation(); const spokenAt = f.talus.sim.clock
    assert.equal(f.texts.at(-1).clock, spokenAt); assert.equal(f.m.presentation.active.stage, 'speech')
    f.talus.sim.clock = spokenAt + 2.999; f.api.tickPresentation(); assert.equal(f.shots.length, 0)
    f.talus.sim.clock = spokenAt + 3; f.api.tickPresentation(); assert.equal(f.shots.length, 1)
    assert.equal(f.shots[0].clock - spokenAt, 3)
  }
  {
    const f = setup(), p = f.m.roster[0]
    f.m.phase = 'focusing'; f.m.presentation.queue.push({ owner: f.m.roster[1].entityId, kind: 'death' })
    let ticks = 0
    f.talus.sleepTicks = async () => {
      ticks++; f.talus.sim.clock += 1 / 60
      if (ticks === 1900) f.m.presentation.queue = []
      if (ticks === 1901) f.status('arrived')
    }
    assert.equal(await f.api.focus(), true)
    assert.equal(ticks, 1901, 'Queued death presentations do not exhaust another tank’s camera-readiness budget')
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].target.entity, p.entityId)
  }
  {
    const f = setup(), p = f.m.roster[0], tank = f.actors.get(p.entityId)
    tank.residency = 'stored'; tank.liveId = null
    f.api.eliminate(p, 'parked-fixture', null, { x: 11000, y: 650 }); f.api.tickPresentation()
    assert.equal(f.holds.length, 0); assert.equal(f.texts.length, 0)
    f.status('arrived'); f.talus.sim.clock += 2; f.api.tickPresentation()
    assert.equal(f.texts.length, 0, 'Death words wait for the stored wreck to restore too')
    tank.residency = 'live'; tank.liveId = 717
    f.api.tickPresentation(); assert.equal(f.holds.at(-1).seconds, 120)
    const start = f.talus.sim.clock
    assert.equal(f.m.presentation.active.stage, 'speech')
    f.talus.sim.clock = start + 2.999; f.api.tickPresentation(); assert.equal(f.m.chaos.jobs.length, 0)
    f.talus.sim.clock = start + 3; f.api.tickPresentation(); assert.equal(f.m.chaos.jobs.length, 1)
    assert.equal(f.holds.at(-1).seconds, 0); assert.equal(f.m.presentation.active.stage, 'effect')
    f.talus.sim.paused = true; f.api.tickPresentation(); assert.equal(f.m.presentation.active.elapsed, 0)
    f.talus.sim.paused = false; f.talus.sim.clock = start + 5.499; f.api.tickPresentation()
    assert.ok(f.m.presentation.active)
    f.talus.sim.clock = start + 5.5; f.api.tickPresentation(); assert.equal(f.m.presentation.active, null)
  }
  {
    const f = setup()
    f.api.cameraPoint({ x: 9000, y: 400 }, 'projectile'); f.api.cameraPoint({ x: 9000, y: 400 }, 'projectile')
    assert.equal(f.calls.length, 1, 'Stationary intent does not restart native tracking every tick')
    f.api.cameraPoint({ x: 9100, y: 380 }, 'projectile')
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].center, f.calls[0].center, 'Game submits a target without writing camera position')
    f.api.cameraTank(f.m.roster[1]); assert.equal(f.calls.at(-1).target.entity, f.m.roster[1].entityId)
    assert.ok(f.calls.every(c => c.options.maxSpeed === 2400 && c.options.smoothSeconds === .32))
  }
  {
    const f = setup(), [p, other] = f.m.roster, tank = f.actors.get(p.entityId), distant = f.actors.get(other.entityId)
    f.m.phase = 'focusing'; tank.residency = 'stored'; tank.liveId = null; distant.residency = 'stored'
    let ticks = 0
    tank.weapon.aim = () => ticks >= 8
    f.talus.sleepTicks = async () => {
      ticks++; f.talus.sim.clock += 1 / 60
      if (ticks === 3) { tank.residency = 'live'; tank.liveId = 902 }
      if (ticks === 5) f.status('arrived')
    }
    assert.equal(await f.api.focus(), true); assert.equal(ticks, 8)
    assert.equal(distant.residency, 'stored', 'Focusing one tank does not restore the whole roster')
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].target.entity, p.entityId)
    assert.ok(f.talus.state.getJson('indigo.events').some(e => e.kind === 'turn-camera-arrived' && e.liveId === 902))
  }
  {
    const f = setup(), p = f.m.roster[0], tank = f.actors.get(p.entityId)
    f.m.phase = 'ready'; tank.residency = 'frozen'
    f.emit('entity.residency', { entityKey: p.entityId, entity: tank })
    f.emit('tick.sim.post', {}); assert.equal(f.plates.length, 0)
    tank.residency = 'live'; tank.liveId = 911 // Native frozen→live has no event.
    f.emit('tick.sim.post', {}); assert.equal(f.plates.length, 1)
    f.emit('tick.sim.post', {}); assert.equal(f.plates.length, 1, 'Deferred restore initialization completes once')
  }
  for (const control of ['human', 'cpu']) {
    const f = setup(3), advance = gates(f), { player, cpu } = inputProbe(f)
    const p = f.m.roster[0], tank = f.actors.get(p.entityId)
    p.control = control; f.m.turnNumber = 7; f.m.remaining = 2.25
    const cue = finishedDeath(f, f.m.roster[1]); cue.started -= 2.5
    f.m.presentation.active = cue; tank.residency = 'stored'
    f.api.cameraPoint(cue, 'death:' + cue.owner); f.status('arrived')
    f.api.tickPresentation()
    assert.equal(f.m.phase, 'refocusing', 'Ending a distant death synchronously blocks the interrupted turn')
    assert.equal(player.inputEnabled, false); assert.equal(cpu.length, 0)
    await advance(1)
    tank.residency = 'live'; f.status('loading'); await advance(1)
    assert.equal(f.m.remaining, 2.25, 'Return travel/loading does not spend the remaining turn budget')
    assert.equal(f.m.phase, 'refocusing'); assert.equal(player.inputEnabled, false); assert.equal(cpu.length, 0)
    f.status('arrived'); await advance(0)
    assert.equal(f.m.phase, 'turn'); assert.equal(f.m.turnNumber, 7); assert.equal(f.m.remaining, 2.25)
    assert.equal(player.inputEnabled, control === 'human'); assert.equal(cpu.length, control === 'cpu' ? 1 : 0)
    assert.equal(p.cashBreakdown.turn, undefined, 'Resuming cannot grant a second turn reward')
  }
  {
    const f = setup(3), advance = gates(f), { player, cpu } = inputProbe(f)
    const p = f.m.roster[0], tank = f.actors.get(p.entityId)
    p.control = 'human'; f.m.turnNumber = 7
    let completed = false
    const next = f.api.beginTurn(false).then(() => { completed = true })
    await flush() // The supply-boundary check yields before camera tracking begins.
    f.status('arrived'); await advance(0)
    f.emit('tick.frame', { dt: 0 }); assert.equal(f.ui.arcadeCards.length, 1)
    f.m.presentation.active = finishedDeath(f, f.m.roster[1]); tank.residency = 'stored'
    f.emit('tick.frame', { dt: .5 }); assert.equal(f.ui.arcadeCards.length, 0)
    await advance(2.5) // The death camera has stolen the previous successful focus.
    assert.equal(f.m.presentation.active, null)
    f.emit('tick.frame', { dt: 0 }); f.emit('tick.frame', { dt: 1 }); await flush()
    assert.equal(completed, false, 'The expired card is not permission to start with a parked tank')
    assert.equal(f.m.phase, 'focusing'); assert.equal(player.inputEnabled, false); assert.equal(cpu.length, 0)
    assert.equal(f.calls.at(-1).target.entity, p.entityId, 'The card completion reacquires its tank')
    tank.residency = 'live'; f.status('loading'); await advance(1)
    assert.equal(completed, false); assert.equal(f.m.remaining, f.m.turnSeconds)
    f.status('arrived'); await advance(0); await next
    assert.equal(f.m.phase, 'turn'); assert.equal(player.inputEnabled, true)
    assert.equal(p.cashBreakdown.turn, f.shop.awards.turn, 'The new turn starts exactly once after reacquisition')
  }
  for (const [phase, cueKind, control] of [['turn', 'active', 'human'], ['turn', 'queued', 'cpu'],
    ['focusing', 'active', 'human'], ['ready', 'queued', 'human']]) {
    const f = setup(3), advance = gates(f), { player, cpu } = inputProbe(f)
    enableBoot(f)
    f.m.phase = phase; f.m.turnNumber = phase === 'ready' ? 0 : 7; f.m.remaining = 2.25
    f.m.roster[0].control = control
    const dead = f.m.roster[phase === 'ready' ? 0 : 1], cue = finishedDeath(f, dead)
    cue.stage = cueKind === 'active' ? 'speech' : 'centering'
    cue.text = 'Restored last words'; cue.elapsed = 1
    if (cueKind === 'active') f.m.presentation.active = cue
    else f.m.presentation.queue.push(cue)
    for (const p of f.m.roster) if (!p.eliminated) f.actors.get(p.entityId).residency = 'stored'
    f.api.prepareReload()
    let bootComplete = false
    const loading = f.api.boot().then(() => { bootComplete = true })
    await flush()
    assert.equal(bootComplete, true, phase + '/' + cueKind + ': boot must finish while its presentation is still pending')
    await loading
    const m = f.api.match
    assert.ok(m.presentation.active || m.presentation.queue.length)
    assert.equal(player.inputEnabled, false); assert.equal(cpu.length, 0)
    assert.equal(m.remaining, 2.25)
    await advance(0)
    assert.equal(m.presentation.active.stage, 'centering', 'Boot completion enables ordinary presentation ticks')
    f.status('arrived'); await advance(0)
    assert.equal(m.presentation.active.stage, 'speech')
    await advance(3); assert.equal(m.presentation.active.stage, 'effect')
    await advance(2.5); assert.equal(m.presentation.active, null)
    const current = m.roster[m.focusIndex], tank = f.actors.get(current.entityId)
    assert.equal(f.calls.at(-1).target.entity, current.entityId)
    assert.equal(player.inputEnabled, false); assert.equal(cpu.length, 0); assert.equal(m.remaining, 2.25)
    tank.residency = 'live'; f.status('loading'); await advance(1)
    assert.equal(player.inputEnabled, false); assert.equal(cpu.length, 0)
    f.status('arrived'); await advance(0)
    assert.equal(m.phase, phase === 'ready' ? 'ready' : 'turn')
    assert.equal(m.remaining, 2.25)
    assert.equal(player.inputEnabled, phase !== 'ready' && control === 'human')
    assert.equal(cpu.length, phase !== 'ready' && control === 'cpu' ? 1 : 0)
    assert.equal(m.turnNumber, phase === 'ready' ? 0 : 7, 'Reload never silently advances the round')
    if (phase === 'ready') {
      assert.notEqual(current.entityId, dead.entityId, 'Ready-phase death selects a surviving focus without pressing Begin')
      assert.ok(m.roster.every(p => !p.cashBreakdown.turn))
    }
  }
  {
    const f = setup(); enableBoot(f); inputProbe(f)
    f.m.phase = 'flight'; f.m.attack = { rootId: 42 }
    f.api.prepareReload()
    await assert.rejects(f.api.boot(), /Native projectile\/cast persistence is required/,
      'Presentation resume support must not pretend that a saved paid volley can be restored')
  }
  console.log('PASS: native arrival/loading and full speech/death clocks; finite holds; continuous tracking; restored readiness; interrupted human/CPU turns preserve time and wait for arrival; card preemption reacquires focus; active/queued boot resumes without deadlock or implicit Begin')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
