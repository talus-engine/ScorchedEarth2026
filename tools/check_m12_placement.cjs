// Game request/receipt sequencing only. Exact occupancy, texture translation
// and physical assembly behavior require the native E51 acceptance run.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [path.resolve(root, '../foxtrot')] }))
const source = fs.readFileSync(path.join(root, 'world/Scripts/match.ts'), 'utf8')
const arena = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/arena.json'), 'utf8'))
const stories = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/landscape-stories.json'), 'utf8'))
const plain = value => JSON.parse(JSON.stringify(value))
function scene() {
  const calls = [], mutations = [], values = {}, barriers = new Map()
  let response = null
  const talus = {
    editor: { available: false }, on() {}, after() {}, log() {}, sim: { clock: 0 }, ui: { set() {} },
    game: { setSaveBarrier: (id, reason) => barriers.set(id, reason) },
    state: { getJson: key => values[key], setJson: (key, value) => { values[key] = plain(value) } },
    elements: { get: name => ({ id: name }) },
    world: { findSurface: async () => 768, terrainWork: async spec => {
      calls.push(plain(spec))
      const body = spec.vector?.output.kind === 'body', preview = spec.placement?.preview === true
      const index = body ? Math.min(5, spec.placement.offsets.length - 1) : 0
      const receipt = { id: calls.length, status: 'completed', reason: preview ? 'preview-clear' : 'ok',
        accepted: preview ? 0 : 37, work: preview ? 0 : 37, added: preview ? 0 : 37,
        ...(body ? { bodies: preview ? [] : ['native-body-' + calls.length], placement: {
          preview, selected: { index, offset: spec.placement.offsets[index] }, evaluated: 37 * (index + 1), cells: 37,
          attempts: spec.placement.offsets.slice(0, index + 1).map((offset, n) => ({ index: n, offset,
            blocked: n === index ? 0 : 1, categories: n === index ? {} : { occupancy: 1 },
            samples: n === index ? [] : [{ x: spec.shape.x, y: spec.shape.y, element: 42, category: 'occupancy' }],
            reason: n === index ? null : 'blocked-footprint' })) } } : {}) }
      const result = response ? response(spec, receipt) : receipt
      if (result.status === 'completed' && !preview && result.accepted) mutations.push(plain(spec))
      return result
    } },
  }
  const code = source.replace(/}\s*$/, `globalThis.api = { generateStructures, generateStoryMechanisms, storyAssemblyJobs,
    configure(a) { arena = a; publish = () => {}; match = { seed: 256337, phase: 'deploying', roster: [], focusIndex: 0,
      presentation: { active: null, queue: [] }, chaos: { jobs: [] }, procedural: { catalog: 'procedural-m11',
      completed: {}, receipts: [], sites: Array.from({length:50},(_,i)=>({x:6400+i*256,ground:768})),
      choices: {vector:Array.from({length:15},()=> 'builtin:x-mark'),structureTexture:Array.from({length:15},(_,i)=>i%2?'builtin-wood':'builtin-concrete4')} } } },
    restore(m) { match = m }, get m() { return match }
  }\n}`)
  const context = { talus }; vm.createContext(context)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText, context)
  context.api.configure(plain(arena))
  return { api: context.api, calls, mutations, values, barriers, respond(fn) { response = fn } }
}
function noFit(receipt) {
  return { ...receipt, status: 'refused', reason: 'no-fitting-placement', accepted: 0, work: 0, added: 0, bodies: [],
    placement: { ...receipt.placement, selected: null,
      attempts: [{ index: 0, offset: { x: 0, y: 0 }, blocked: 1, categories: { 'protected-owner': 1 },
        samples: [{ x: 6400, y: 650, element: 12, category: 'protected-owner' }], reason: 'blocked-footprint' }] } }
}
function assembly(f) {
  const motif = plain(stories.themes.flatMap(theme => theme.motifs).find(m => m.kind === 'counterweight'))
  motif.seed = 734; motif.siteIndex = 0; motif.central = true; motif.origin = { x: 6400, y: 700 }
  motif.supportDepths = Object.fromEntries([-.32, .32].map(k => [String(motif.parameters.dimensions.deckLength * k), 42]))
  f.api.m.procedural.story = { id: 'fixture-story', motifs: [motif] }
  return { motif, jobs: plain(f.api.storyAssemblyJobs(motif, motif.origin)) }
}
async function main() {
  const props = scene(); await props.api.generateStructures()
  assert.equal(props.calls.length, 15, 'Each prop uses one native placement call, never scripted candidate commits')
  assert.equal(props.api.m.procedural.completed.structures, 15)
  for (const spec of props.calls) {
    const offsets = spec.placement.offsets, shape = spec.shape
    assert.equal(offsets.length, 8); assert.deepEqual(offsets[0], { x: 0, y: 0 })
    assert.ok(offsets.every(p => Number.isInteger(p.x) && Number.isInteger(p.y)))
    const w = shape.w + Math.max(0, ...offsets.map(p => p.x)) - Math.min(0, ...offsets.map(p => p.x))
    const h = shape.h + Math.max(0, ...offsets.map(p => p.y)) - Math.min(0, ...offsets.map(p => p.y))
    assert.ok(w <= 512 && h <= 512); assert.equal(spec.budget.cells, w * h)
    assert.equal(spec.placement.maxChecks, shape.w * shape.h * offsets.length)
    assert.equal(spec.budget.particles, shape.w * shape.h); assert.equal(spec.budget.work, shape.w * shape.h)
    assert.equal(spec.replacement, 'empty'); assert.equal(spec.vector.fill.kind, 'noise')
    assert.equal(spec.vector.output.kind, 'body'); assert.equal(spec.layerPolicy, 'active-only')
    assert.equal(spec.placement.preview, undefined)
    const geometry = spec.vector.geometry
    if (geometry.kind === 'vector') {
      assert.equal(geometry.center.x, shape.x + 128); assert.equal(geometry.center.y, shape.y + 128)
    } else assert.deepEqual({ x: (geometry.points[0].x + geometry.points[1].x) / 2,
      y: (geometry.points[0].y + geometry.points[1].y) / 2 }, { x: shape.x + 128, y: shape.y + 128 })
  }
  const mark = props.calls[14]
  assert.equal(mark.vector.geometry.id, 'builtin:x-mark'); assert.equal(mark.vector.geometry.width, 92)
  assert.equal(mark.vector.geometry.height, 70); assert.equal(mark.vector.geometry.rotationDeg, -42)
  for (const receipt of props.api.m.procedural.receipts) {
    assert.deepEqual(plain(receipt.placement.selected), { index: 5, offset: props.calls[receipt.n].placement.offsets[5] })
    assert.equal(receipt.placement.cells, 37, 'Keep native full-membership evidence with the durable body receipt')
  }
  const repeat = scene(); await repeat.api.generateStructures(); assert.deepEqual(repeat.calls, props.calls)
  const done = scene(); done.api.restore(plain(props.api.m)); await done.api.generateStructures(); assert.equal(done.calls.length, 0)
  for (const failure of ['no-fit', 'no-progress']) {
    const f = scene(); f.respond((spec, receipt) => failure === 'no-fit' ? noFit(receipt) : { ...receipt, accepted: 0, bodies: [] })
    await assert.rejects(f.api.generateStructures(), failure === 'no-fit' ? /no-fitting-placement/ : /made-no-progress/)
    assert.equal(f.calls.length, 1); assert.equal(f.mutations.length, 0)
    assert.equal(f.api.m.procedural.completed.structures, undefined); assert.equal(f.api.m.procedural.receipts.length, 0)
    assert.ok(f.api.m.procedural.lastFailure.receipt.placement); assert.ok(f.barriers.get('match-sequence'))
    if (failure === 'no-fit') assert.equal(f.api.m.procedural.lastFailure.receipt.placement.attempts[0].samples[0].category, 'protected-owner')
  }
  const complete = scene(), { jobs } = assembly(complete)
  await complete.api.generateStoryMechanisms()
  const rigid = jobs.filter(j => j.spec.vector.output.kind === 'body')
  assert.equal(rigid.length, 2)
  assert.ok(complete.calls.slice(0, 2).every(spec => spec.placement.preview))
  assert.equal(complete.calls.length, jobs.length + 2); assert.equal(complete.mutations.length, jobs.length)
  for (const spec of complete.calls.filter(s => s.vector.output.kind === 'body')) {
    assert.deepEqual(spec.placement.offsets, [{ x: 0, y: 0 }], 'Assembly pieces never choose independent translations')
    assert.equal(spec.placement.maxChecks, spec.shape.w * spec.shape.h)
    const authored = jobs.find(j => j.spec.seed === spec.seed).spec
    assert.deepEqual(spec.vector, authored.vector); assert.deepEqual(spec.shape, authored.shape)
  }
  const noAssembly = scene(); assembly(noAssembly)
  noAssembly.respond((spec, receipt) => noAssembly.calls.length === 2 ? noFit(receipt) : receipt)
  await assert.rejects(noAssembly.api.generateStoryMechanisms(), /mechanism-0 3: no-fitting-placement/)
  assert.equal(noAssembly.mutations.length, 0, 'All exact rigid preflights precede the first terrain support/device mutation')
  assert.equal(noAssembly.api.m.procedural.completed['mechanism-0'], undefined)
  assert.equal(noAssembly.api.m.procedural.lastFailure.preview, true)
  const unreasoned = scene(); assembly(unreasoned)
  unreasoned.respond((spec, receipt) => spec.vector.output.kind === 'particles'
    ? { ...receipt, status: 'refused', reason: null, accepted: 0, work: 0, added: 0 } : receipt)
  await assert.rejects(unreasoned.api.generateStoryMechanisms(), /mechanism-0 0: refused/)
  assert.equal(unreasoned.mutations.length, 0)
  assert.equal(unreasoned.api.m.procedural.completed['mechanism-0'], undefined,
    'A refused particle job without a reason cannot advance the saved prefix')
  const interrupted = scene(); const { motif } = assembly(interrupted)
  interrupted.respond((spec, receipt) => spec.vector.output.name?.endsWith('rolling weight') && !spec.placement.preview ? noFit(receipt) : receipt)
  await assert.rejects(interrupted.api.generateStoryMechanisms(), /no-fitting-placement/)
  assert.equal(interrupted.api.m.procedural.completed['mechanism-0'], 3, 'Commit revalidates occupancy after advisory previews')
  assert.equal(interrupted.api.m.procedural.receipts.length, 3)
  const resume = scene(); resume.api.restore(plain(interrupted.api.m))
  resume.respond((spec, receipt) => {
    assert.ok(!spec.vector.output.name?.endsWith('inclined deck'), 'A completed body must never be previewed against itself or recreated')
    return receipt
  })
  await resume.api.generateStoryMechanisms()
  assert.equal(resume.calls.filter(spec => spec.placement?.preview).length, 1)
  assert.equal(resume.calls[0].vector.output.name, motif.name + ' · rolling weight')
  assert.deepEqual(plain(resume.api.m.procedural.story.motifs[0].origin), motif.origin)
  assert.equal(resume.api.m.procedural.completed['mechanism-0'], jobs.length)
  assert.equal(resume.api.m.procedural.lastFailure, undefined)
  assert.equal(resume.api.m.procedural.receipts.length, jobs.length)
  const finished = scene(); finished.api.restore(plain(resume.api.m)); await finished.api.generateStoryMechanisms()
  assert.equal(finished.calls.length, 0, 'Completed assemblies neither preview nor repaint')
  console.log('PASS: one native ordered placement per whole textured prop; bounded deterministic transforms/check budgets; exact no-fit/no-progress evidence; fixed-pose assembly previews before particles; commit revalidation; partial/full resume without self-collision or duplicate bodies')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
