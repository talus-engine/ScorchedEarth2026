// Instrumented milestone one: real cannon, camera streaming, impact and restoration.
const tankTemplate = '__TANK_ID__'
let shooter: Entity | null = null
let target: Entity | null = null
let shot: Projectile | null = null
let ticks = 0
let shotNumber = 0
let settled = false
const events: any[] = []

function record(kind: string, data: any = {}) {
  // Keep the event name even when the payload's kind is "rigid-body".
  const row = { kind, ...data, event: kind, time: talus.sim.clock }
  events.push(row)
  if (events.length > 160) events.shift()
  talus.state.setJson('m1.events', events)
  talus.log(kind, data)
}
function status(value: string) {
  talus.state.set('m1.status', value)
  talus.ui.banner(value)
}
function protect(fn: (e: any) => Promise<void>) {
  return (e: any) => { void fn(e).catch(error => {
    record('fault', { message: String(error), stack: error?.stack })
    status('M1 error: ' + String(error))
  }) }
}

talus.on('indigo:m1-start', protect(async e => {
  if (shooter) return
  // Configurable diagnostic site; the normal starting-terrain check remains x=400.
  const x = typeof e.x === 'number' ? e.x : 400
  status('M1: loading test ground')
  talus.camera.follow('off')
  talus.camera.centerOn(x, 560)
  await talus.sleepTicks(90)
  const ground = await talus.world.findSurface(x, 512, 256)
  if (ground === null) throw new Error('Test ground did not generate')
  shooter = await talus.entities.spawn(tankTemplate, x, ground - 40)
  if (!shooter) throw new Error('Shooter spawn refused')
  shooter.blackboard.set('custom.m1Marker', 'shooter-survives-streaming')
  shooter.blackboard.set('name', 'M1 Shooter')
  talus.ui.nameplate(shooter, { text: 'M1 SHOOTER', bar: 'health', color: '#b6afff' })
  await talus.sleepTicks(120)
  talus.state.set('m1.shooter', shooter.id)
  talus.state.setJson('m1.before', shooter.snapshot())
  record('spawned', { shooter: shooter.id, snapshot: shooter.snapshot(), weapon: shooter.weapon.state })
  status('M1 ready to fire')
}))

talus.on('indigo:m1-fire', protect(async e => {
  if (!shooter || shot) return
  talus.camera.follow('off')
  talus.camera.centerOn(shooter.position!)
  if (!await shooter.whenLive({ timeoutTicks: 600 })) throw new Error('Shooter failed to restore')
  await talus.sleepTicks(60)
  settled = false
  shotNumber++
  shooter.weapon.aim(typeof e.angle === 'number' ? e.angle : -Math.PI / 6,
    typeof e.power === 'number' ? e.power : 1)
  record('fire-request', { shotNumber, shooter: shooter.snapshot(), weapon: shooter.weapon.state })
  shooter.weapon.fire()
}))

talus.on('projectile.launch', e => {
  shot = e.projectile
  record('launch', { shotNumber, id: e.projectileId, rawOwner: e.ownerEntityId, owner: e.owner?.id, position: e.projectile.position })
  status('M1: following shell ' + shotNumber)
})

talus.on('tick.sim.pre', () => {
  ticks++
  if (!shot?.exists) return
  const s = shot.snapshot()
  if (!s) return
  // Poll even while a projectile is held waiting for streamed ground.
  talus.camera.centerOn(s.x, s.y)
  if (ticks % 60 === 0) {
    record('flight', { shotNumber, shot: s, shooter: shooter?.snapshot(), owner: shot.owner?.id })
  }
})

talus.on('projectile.detonate', e => {
  record('detonate', { shotNumber, id: e.projectileId, ...JSON.parse(JSON.stringify(e)), owner: e.owner?.id, shooter: shooter?.snapshot() })
})
talus.on('projectile.hit', e => {
  record('hit', { shotNumber, ...JSON.parse(JSON.stringify(e)), owner: e.owner?.id })
})
talus.on('explosion', e => record('explosion', { shotNumber, ...JSON.parse(JSON.stringify(e)), source: e.source?.id }))
talus.on('damage', e => record('damage', { shotNumber, ...JSON.parse(JSON.stringify(e)), source: e.source?.id, target: e.target?.id }))
talus.on('death', e => record('death', { shotNumber, ...JSON.parse(JSON.stringify(e)), killer: e.killer?.id, entity: e.entity?.id }))
talus.on('entity.residency', e => record('residency', { ...JSON.parse(JSON.stringify(e)), entity: e.entity?.id }))

talus.on('projectile.end', protect(async e => {
  const p = { x: Number(e.x), y: Number(e.y) }
  shot = null
  talus.state.setJson('m1.impact', p)
  record('end', { shotNumber, ...JSON.parse(JSON.stringify(e)), owner: e.owner?.id })
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Projectile ended without coordinates')
  talus.camera.centerOn(p)
  const result = await talus.world.watchSettle({ x: p.x - 160, y: p.y - 128, w: 320, h: 384 }, { maxTicks: 600 }).done
  settled = !result.timedOut
  record('settled', { shotNumber, ...result, target: target?.snapshot() })
  status(result.timedOut ? 'M1: settle timed out' : 'M1: impact settled')
}))

talus.on('indigo:m1-target', protect(async e => {
  if (shot) throw new Error('Wait for the current shot')
  const impact = talus.state.getJson('m1.impact') as any
  const x = typeof e.x === 'number' ? e.x : Math.round(impact.x) - 70
  talus.camera.centerOn(x, 580)
  await talus.sleepTicks(90)
  const y = await talus.world.findSurface(x, 512, 256)
  if (y === null) throw new Error('Target ground missing')
  target = await talus.entities.spawn(tankTemplate, x, y - 40)
  if (!target) throw new Error('Target spawn refused')
  target.blackboard.set('name', 'M1 Target')
  target.blackboard.set('custom.m1Marker', 'target-survives-streaming')
  talus.ui.nameplate(target, { text: 'M1 TARGET', bar: 'health', color: '#ffc18a' })
  await talus.sleepTicks(120)
  talus.state.set('m1.target', target.id)
  record('target-spawned', { target: target.snapshot() })
  status('M1 target ready')
}))

talus.on('indigo:m1-return', protect(async () => {
  if (!shooter || shot) throw new Error('No idle shooter')
  const parked = shooter.snapshot()
  const markerBefore = shooter.blackboard.get('custom.m1Marker')
  talus.camera.centerOn(shooter.position!)
  if (!await shooter.whenLive({ timeoutTicks: 600 })) throw new Error('Shooter did not restore')
  await talus.sleepTicks(90)
  const result = { parked, restored: shooter.snapshot(), markerBefore,
    markerAfter: shooter.blackboard.get('custom.m1Marker'), weapon: shooter.weapon.state, settled }
  talus.state.setJson('m1.restoration', result)
  record('returned', result)
  status('M1 shooter restored')
}))

talus.state.set('m1.status', 'M1 script ready')
