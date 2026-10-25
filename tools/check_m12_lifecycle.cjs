// Exercise the actual game helpers across separate script VMs and parked
// native handles. Native streaming/serialization still needs live acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [path.resolve(root, '../foxtrot')] }))
const source = fs.readFileSync(path.join(root, 'world/Scripts/match.ts'), 'utf8')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/shop.json'), 'utf8'))
function actor(id) {
  const native = { residency: 'live', alive: true, position: { x: 100, y: 600 }, snapshot: true,
    fuel: 0, ground: null, defenses: {}, reads: 0, activations: [], allowActivation: true, kills: [] }
  const loaded = () => { native.reads++; if (native.residency !== 'live') throw Error('NOT_LIVE') }
  const tank = { id, get isLive() { return native.residency === 'live' }, get residency() { return native.residency },
    get alive() { return native.alive }, snapshot: () => native.snapshot ? { ...native.position, alive: native.alive } : null,
    kill: why => native.kills.push(why),
    controller: {
      get state() { loaded(); return { enabled: true, capacity: 12, fuel: native.fuel } },
      get groundDrive() { loaded(); return structuredClone(native.ground) },
      addFuel: n => { native.fuel += Math.min(n, 12 - native.fuel) }, removeFuel: n => { native.fuel -= Math.min(n, native.fuel) },
      configureGroundDrive: config => { native.ground = { config: structuredClone(config), fuel: 0, spent: 0 }; return { accepted: true } },
      addGroundFuel: n => { native.ground.fuel += Math.min(n, native.ground.config.capacity - native.ground.fuel) },
      removeGroundFuel: n => { native.ground.fuel -= Math.min(n, native.ground.fuel) },
    },
    defenses: {
      get state() { loaded(); return structuredClone(native.defenses) },
      configure: (kind, spec) => { native.defenses[kind] = { spec: structuredClone(spec), remaining: 0, active: false }; return { accepted: true } },
      charge: (kind, amount) => { const s = native.defenses[kind]; s.remaining += Math.min(amount, s.spec.capacity - s.remaining) },
      discharge: (kind, amount) => { const s = native.defenses[kind]; s.remaining -= Math.min(amount, s.remaining); if (!s.remaining) s.active = false },
      activate: (kind, enabled) => { loaded(); native.activations.push(kind); if (native.allowActivation) native.defenses[kind].active = enabled; return { accepted: native.allowActivation } },
    },
  }
  return { tank, native }
}
function scene({ installed = {}, actors = new Map(), savedMatch, worldId = 'lifecycle-world' } = {}) {
  const handlers = {}, states = {}, eliminated = [], records = [], writes = []
  const shop = structuredClone(catalog)
  for (const item of shop.items) if (item.kind !== 'weapon') item.enabled = ['jetpack', 'shield', 'magnet', 'fuel-tank', 'auto-defense'].includes(item.id)
  const talus = {
    editor: { available: false }, after() {}, on: (name, fn) => (handlers[name] ||= []).push(fn),
    entities: { get: id => actors.get(id)?.tank }, elements: { get: () => ({ id: 12 }) },
    world: { id: worldId }, sim: { clock: 1 },
    installed: { get: key => structuredClone(installed[key]), set: (key, value) => { installed[key] = structuredClone(value); writes.push(structuredClone(value)) } },
    state: { getJson: key => states[key], setJson: (key, value) => { states[key] = structuredClone(value) } },
    game: { setSaveBarrier() {} }, log: (kind, detail) => records.push({ kind, ...detail }),
  }
  const code = source.replace(/}\s*$/, `globalThis.api = {
    checkRoster, accountSupply, syncUtilities, autoDefend,
    load(saved, shop) { match=saved; market=shop; booted=true; ensureWallets();
      eliminate=(p,why)=>{ globalThis.eliminated.push({id:p.entityId,why});p.eliminated=true }
    }, get match(){return match}, get bank(){return bank}
  }\n}`)
  const context = { talus, eliminated }; vm.createContext(context)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText, context)
  const match = savedMatch || { phase: 'turn', turnNumber: 1, roster: ['Alpha', 'Bravo'].map((name, i) => ({ name, entityId: 'instance@tank-' + i, eliminated: false })),
    bounds: { x: 0, y: 0, w: 1000, h: 1280 }, presentation: { active: null, queue: [] }, chaos: { jobs: [] } }
  for (const p of match.roster) if (!actors.has(p.entityId)) actors.set(p.entityId, actor(p.entityId))
  context.api.load(match, shop)
  return { api: context.api, installed, actors, match, records, eliminated, writes,
    wallet: i => context.api.bank.players[match.roster[i].name.toLowerCase()],
    emit: name => (handlers[name] || []).forEach(fn => fn({})),
    reload: () => scene({ installed, actors, savedMatch: structuredClone(match), worldId }),
  }
}

{
  const f = scene(), [a, b] = f.match.roster, first = f.actors.get(a.entityId).native, second = f.actors.get(b.entityId).native
  first.residency = 'unresolved'; first.snapshot = false
  second.residency = 'stored'
  f.api.checkRoster(); assert.equal(f.eliminated.length, 0, 'Unresolved and healthy parked tanks remain survivors')
  first.residency = 'destroyed'; f.api.checkRoster()
  assert.deepEqual(structuredClone(f.eliminated), [{ id: a.entityId, why: 'destroyed' }], 'Native destroyed residency is an explicit elimination')
  second.alive = false; f.api.checkRoster()
  assert.equal(f.eliminated[1].id, b.entityId, 'Known parked death eliminates without demanding live residency')
  assert.equal(first.reads + second.reads, 0, 'Roster checks never invoke loaded-only components')
}
{
  const f = scene(), p = f.match.roster[0], s = f.actors.get(p.entityId).native
  s.alive = null; f.api.checkRoster(); assert.equal(f.eliminated.length, 0, 'Unknown alive state is not false')
  s.alive = true; s.residency = 'stored'; s.position.x = 1000
  f.api.checkRoster(); assert.deepEqual(structuredClone(f.eliminated), [{ id: p.entityId, why: 'out of bounds' }])
  assert.deepEqual(s.kills, ['env:indigo-bounds']); f.api.checkRoster(); assert.equal(s.kills.length, 1)
}
{
  let f = scene(), p = f.match.roster[0], s = f.actors.get(p.entityId).native
  Object.assign(f.wallet(0).stock, { jetpack: 6, shield: 2, magnet: 1, 'fuel-tank': 6 })
  f.api.syncUtilities(p)
  assert.equal(s.fuel, 6); assert.equal(s.defenses.shield.remaining, 120); assert.equal(s.defenses.deflector.remaining, 6)
  s.fuel -= 2; s.defenses.shield.remaining -= 30; s.defenses.deflector.remaining -= 1; s.ground.fuel--; s.ground.spent++
  s.residency = 'stored'; const beforeReads = s.reads
  f.api.accountSupply(p); f.api.syncUtilities(p)
  assert.equal(s.reads, beforeReads, 'Parking postpones reconciliation without losing its last observation')
  f = f.reload(); p = f.match.roster[0]
  f.api.syncUtilities(p); assert.equal(s.reads, beforeReads, 'Reload leaves stored bodies alone')
  s.residency = 'live'; f.api.syncUtilities(p)
  assert.equal(f.wallet(0).stock.jetpack, 4); assert.equal(s.fuel, 4, 'Consumed fuel is not refilled from a stale pre-park balance')
  assert.equal(f.wallet(0).stock.shield, 1.5); assert.equal(s.defenses.shield.remaining, 90)
  assert.ok(Math.abs(f.wallet(0).stock.magnet - 5 / 6) < 1e-9); assert.equal(s.defenses.deflector.remaining, 5)
  assert.equal(f.wallet(0).stock['fuel-tank'], 5); assert.equal(s.ground.fuel, 5)
  const expected = structuredClone(f.wallet(0)), persisted = f.installed['indigo.economy']
  assert.equal(persisted.tankUtilities['lifecycle-world'][p.entityId].supplySeen.jet, 4)
  assert.equal(persisted.players.alpha.stock.jetpack, 4, 'Debit and its new observation are in the same installed write')
  for (let n = 0; n < 3; n++) { f = f.reload(); f.api.syncUtilities(f.match.roster[0]) }
  assert.deepEqual(structuredClone(f.wallet(0)), expected, 'Repeated reload/restore never charges an already reconciled native delta')
  const beforeWrites = f.writes.length; f.api.syncUtilities(f.match.roster[0]); assert.equal(f.writes.length, beforeWrites, 'Idle observation does not write the ledger every frame')
}
{
  const f = scene(), [a, b] = f.match.roster, x = f.actors.get(a.entityId).native, y = f.actors.get(b.entityId).native
  for (const i of [0, 1]) Object.assign(f.wallet(i).stock, { shield: 1, 'auto-defense': 1 })
  y.residency = 'stored'; f.api.autoDefend()
  assert.equal(f.wallet(0).stock['auto-defense'], 0); assert.equal(x.defenses.shield.active, true)
  assert.equal(f.wallet(1).stock['auto-defense'], 1); assert.equal(y.reads, 0); assert.equal(b.autoDefenseChecked, undefined)
  y.residency = 'live'; f.emit('tick.sim.post')
  assert.equal(f.wallet(1).stock['auto-defense'], 0); assert.equal(y.defenses.shield.active, true, 'A later restored tank gets its own first activation')
  x.defenses.shield.active = false; y.defenses.shield.active = false
  const oldMatch = structuredClone(f.match); delete oldMatch.roster[0].autoDefenseChecked; delete oldMatch.roster[1].autoDefenseChecked
  const reloaded = scene({ installed: f.installed, actors: f.actors, savedMatch: oldMatch })
  reloaded.api.autoDefend(); reloaded.emit('tick.sim.post')
  assert.equal(x.activations.length, 1); assert.equal(y.activations.length, 1, 'Durable receipts prevent replay even from older match flags')
  assert.equal(reloaded.wallet(0).stock['auto-defense'], 0); assert.equal(reloaded.wallet(1).stock['auto-defense'], 0)
}
{
  const f = scene(), p = f.match.roster[0], s = f.actors.get(p.entityId).native
  Object.assign(f.wallet(0).stock, { shield: 1, 'auto-defense': 2 }); f.match.autoDefenseChecked = true; s.residency = 'stored'
  f.api.autoDefend(); assert.equal(s.reads, 0); assert.equal(p.autoDefenseChecked, true)
  s.residency = 'live'; f.emit('tick.sim.post'); f.api.autoDefend()
  assert.equal(s.activations.length, 0); assert.equal(f.wallet(0).stock['auto-defense'], 2, 'The legacy global receipt does not replay old activations')
}
{
  const f = scene(), p = f.match.roster[0], s = f.actors.get(p.entityId).native
  Object.assign(f.wallet(0).stock, { shield: 1, 'auto-defense': 1 }); s.allowActivation = false
  f.api.autoDefend(p); assert.equal(f.wallet(0).stock['auto-defense'], 1); assert.equal(p.autoDefenseChecked, undefined)
  s.allowActivation = true; f.api.autoDefend(p); f.api.autoDefend(p)
  assert.equal(f.wallet(0).stock['auto-defense'], 0); assert.equal(s.activations.length, 2, 'Refusal is retried; acceptance is debited once')
}
console.log('PASS: unresolved/stored roster semantics, explicit death and bounds, supply consumption across park and fresh VM reload, atomic debit observations, idempotent restore, deferred per-tank auto-defense, legacy receipt migration and refusal safety')
