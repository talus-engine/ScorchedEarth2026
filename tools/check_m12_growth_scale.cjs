// Game authoring policy and saved-plan compatibility; no rendered plant or
// native material output is inferred from these request-level checks.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { scene } = require('./check_m12_generation.cjs')
const root = path.resolve(__dirname, '..')
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const presets = read('world/Game/Presets/living.json').presets
const elements = read('world/Game/Presets/element-catalog.json').elements
const recipes = read('world/Game/generation.json')
const plain = value => JSON.parse(JSON.stringify(value))
function setup() {
  const f = scene(256337, -1, true)
  f.talus.elements.get = name => elements.find(e => e.name === name) || null
  return f
}
function sites(f) {
  f.api.m.procedural.sites = Array.from({ length: 50 }, (_, n) => ({ x: 16512 + n * 256, ground: 640, size: 96 }))
}
function growthEvents(f) { return f.values['indigo.events'].filter(e => e.kind === 'generation-native' && e.family === 'growth') }
async function main() {
  const f = setup(); await f.api.prepareProcedural(); sites(f)
  const p = f.api.m.procedural, selections = plain(p.choices), authored = JSON.stringify(presets)
  assert.equal(p.story.id, 'drowned-cathedral', 'Use the actual A1 seed and source selection')
  assert.equal(p.detailMaterialPolicy, 1, 'New plans pin story-material eligibility')
  for (const preset of presets) assert.equal(p.growthPolicies[preset.id].lengthMax, preset.sheet.lengthMax)
  const fresh = plain(f.api.m)
  await f.api.generateCatalogLife()
  assert.equal(f.calls.length, 50); assert.equal(p.completed.growth, 50)
  assert.deepEqual(plain(p.choices), selections, 'Keep every seeded preset choice and all 50 passes')
  const events = growthEvents(f)
  assert.equal(events.length, 50)
  for (let n = 0; n < 50; n++) {
    const s = f.calls[n], event = events[n], preset = presets.find(v => v.id === s.growth.presetId)
    assert.equal(s.growth.presetId, selections.growth[n]); assert.equal(s.layerPolicy, 'authored')
    assert.equal(s.growth.steps, recipes.living.steps); assert.equal(s.growth.fragments, recipes.living.fragments)
    assert.equal(s.growth.jobs, 64); assert.equal(s.bounds.h, 1024)
    assert.equal(event.radius, s.growth.radius); assert.equal(event.size, event.radius * 2)
    assert.ok(event.requestedSize >= 64 && event.requestedSize <= 128)
    if (preset.stroke.sizeMode === 'scale') {
      const nominal = preset.sheet.lengthMax * Math.max(1, s.growth.radius) / preset.stroke.sizeReference
      assert.equal(event.sizePolicy, 'nominal-length'); assert.equal(event.nominalLengthTarget, event.requestedSize)
      assert.equal(event.nominalLengthMax, nominal)
      assert.ok(nominal <= event.requestedSize + 1e-8, preset.id + ': nominal trunk length stays within its target')
    } else {
      assert.equal(event.sizePolicy, 'toolbar-diameter'); assert.equal(event.nominalLengthTarget, undefined)
    }
    assert.equal(s.growth.liveSeconds, preset.sheet.timeClip ? Math.min(60, preset.sheet.endTime + 1 / 60)
      : preset.sheet.flowSpeed > 0 ? 2 : undefined, 'Preserve authored finite timing policy')
  }
  for (const [n, size] of [[6, 125], [26, 96]]) {
    assert.equal(f.calls[n].growth.presetId, 'builtin-oak-sapling')
    assert.equal(events[n].requestedSize, size)
    assert.equal(f.calls[n].growth.radius, size * 3 / 32)
    assert.equal(events[n].nominalLengthMax, size, 'A1 oak no longer requests a 512–667px trunk')
  }
  for (const id of ['builtin-coral', 'builtin-bramble', 'builtin-living-bramble', 'indigo-m9-bramble']) {
    const n = selections.growth.indexOf(id); assert.ok(n >= 0)
    assert.equal(events[n].nominalLengthMax, events[n].requestedSize, id + ' retains its preset at the nominal target size')
    assert.ok(f.calls[n].growth.radius >= 1)
  }
  assert.equal(JSON.stringify(presets), authored, 'No captured preset mutation')

  // A persisted plan without length metadata keeps its old toolbar policy,
  // including a partial-prefix reopen under the new script.
  const saved = plain(fresh)
  for (const policy of Object.values(saved.procedural.growthPolicies)) delete policy.lengthMax
  const legacy = setup(); legacy.api.restore(plain(saved))
  legacy.talus.world.resources.read = async () => { throw Error('Saved plans must not be rehydrated into the new sizing policy') }
  await legacy.api.prepareProcedural(); await legacy.api.generateCatalogLife()
  const oldEvents = growthEvents(legacy)
  for (let n = 0; n < 50; n++) {
    assert.equal(oldEvents[n].sizePolicy, 'toolbar-diameter'); assert.equal(oldEvents[n].nominalLengthTarget, undefined)
    assert.equal(legacy.calls[n].growth.radius, oldEvents[n].requestedSize / 2)
    const preset = presets.find(v => v.id === selections.growth[n])
    if (preset.stroke.sizeMode !== 'scale') assert.deepEqual(f.calls[n], legacy.calls[n], 'Scatter/attribute native requests remain exact')
    const policy = saved.procedural.growthPolicies[preset.id]
    const rate = preset.stroke.sizeMode === 'scatter' ? Math.max(policy.tubesPerStep, 1 / policy.stroke.sizeReference)
      * f.calls[n].growth.radius / policy.stroke.sizeReference : policy.tubesPerStep
    assert.ok(policy.startTubes + Math.floor(f.calls[n].growth.path.length * rate + 1e-6) <= 64)
  }
  assert.equal(legacy.calls[6].growth.radius, 62.5)
  const partial = setup(); saved.procedural.completed.growth = 7; partial.api.restore(plain(saved))
  partial.talus.world.resources.read = legacy.talus.world.resources.read
  await partial.api.prepareProcedural(); await partial.api.generateCatalogLife()
  assert.deepEqual(partial.calls, legacy.calls.slice(7), 'Resume only the original remaining passes, with unchanged geometry/timing')
  assert.ok(Object.values(partial.api.m.procedural.growthPolicies).every(v => v.lengthMax === undefined))

  const detail = setup(); detail.api.restore(plain(fresh))
  detail.api.m.procedural.macro = { material: 'LIMESTONE', loose: 'SAND' }
  await detail.api.generateCatalogDetails()
  assert.equal(detail.calls.length, 117, 'All noise, semantic and neural detail passes run')
  for (const s of detail.calls) {
    assert.deepEqual(s.materials.map(m => m.element), ['DIRT', 'SAND', 'STONE', 'LIMESTONE'].map(name => elements.find(e => e.name === name).id))
    assert.equal(new Set(s.materials.map(m => m.element)).size, s.materials.length)
    assert.equal(s.replacement, 'eligible'); assert.equal(s.bounds.h, 1024, 'The stone foundation remains outside detail write bounds')
  }
  const noMacro = setup(); noMacro.api.restore(plain(fresh)); await noMacro.api.generateCatalogDetails()
  for (const s of noMacro.calls) assert.deepEqual(s.materials.map(m => m.element), [10, 11, 9])
  const oldDetails = plain(fresh)
  delete oldDetails.procedural.detailMaterialPolicy
  oldDetails.procedural.macro = { material: 'LIMESTONE', loose: 'SAND' }
  const oldFull = setup(); oldFull.api.restore(plain(oldDetails)); await oldFull.api.prepareProcedural(); await oldFull.api.generateCatalogDetails()
  assert.equal(oldFull.calls.length, 117)
  for (const s of oldFull.calls) assert.deepEqual(s.materials.map(m => m.element), [10, 11, 9], 'Metadata-less saved story plans keep original detail eligibility')
  const oldPartial = setup(); oldDetails.procedural.completed.noise = 23; oldPartial.api.restore(plain(oldDetails))
  oldPartial.talus.world.resources.read = async () => { throw Error('Partial detail plans must not adopt new metadata') }
  await oldPartial.api.prepareProcedural(); await oldPartial.api.generateCatalogDetails()
  assert.equal(oldPartial.api.m.procedural.detailMaterialPolicy, undefined)
  assert.deepEqual(oldPartial.calls, oldFull.calls.slice(23), 'All 94 remaining detail requests retain original eligibility after reload')
  const unknownPolicy = setup(); unknownPolicy.api.restore(plain(fresh)); unknownPolicy.api.m.procedural.detailMaterialPolicy = 2
  await assert.rejects(unknownPolicy.api.generateCatalogDetails(), /Unsupported saved detail material policy: 2/)
  assert.equal(unknownPolicy.calls.length, 0)
  const missing = setup(); missing.api.restore(plain(fresh)); missing.api.m.procedural.macro = { material: 'MISSING_STORY_MATERIAL', loose: 'SAND' }
  await assert.rejects(missing.api.generateCatalogDetails(), /Unknown detail material: MISSING_STORY_MATERIAL/)
  assert.equal(missing.calls.length, 0); assert.equal(missing.api.m.procedural.completed.noise, undefined)
  const corrupt = setup(); corrupt.api.restore(plain(fresh)); corrupt.api.m.procedural.growthPolicies[selections.growth[0]].lengthMax = 'bad'
  await assert.rejects(corrupt.api.generateCatalogLife(), /Invalid saved growth length/); assert.equal(corrupt.calls.length, 0)
  console.log('PASS: A1 oak/coral/bramble nominal length, all 50 unchanged choices, exact scatter/timing, legacy growth/detail partial resume, versioned story-material eligibility/dedup/foundation bounds and explicit invalid-policy/material refusal')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
