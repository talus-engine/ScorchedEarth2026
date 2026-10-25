// Analytic geometry checks only; native admission/contact remain live acceptance.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [path.resolve(root, '../foxtrot')] }))
const source = fs.readFileSync(path.join(root, 'world/Scripts/match.ts'), 'utf8')
const stories = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/landscape-stories.json'), 'utf8'))
const context = { talus: { editor: { available: false }, on() {}, after() {} } }; vm.createContext(context)
vm.runInContext(ts.transpileModule(source.replace(/}\s*$/, `globalThis.api = { storyAssemblyJobs,
  configure() { arena = { bounds: { x: 0, y: 0, w: 25600, h: 1280 } }; match = { procedural: {
    catalog: 'procedural-m11', choices: { structureTexture: ['builtin-wood', 'builtin-concrete'] } } } }
}\n}`), { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText, context)
context.api.configure()

function assembly(authored, origin = { x: 18048, y: 240 }) {
  const motif = structuredClone(authored), d = motif.parameters.dimensions
  motif.seed = 734; motif.supportDepths = {}
  for (const x of [-d.deckLength * .32, d.deckLength * .32]) motif.supportDepths[String(x)] = 42
  return { motif, origin, jobs: context.api.storyAssemblyJobs(motif, origin) }
}
function verify({ motif, origin, jobs }) {
  const d = motif.parameters.dimensions, angle = motif.parameters.slopeDeg * Math.PI / 180
  const deck = jobs.find(job => job.label === 'inclined deck').spec
  const g = deck.vector.geometry, sin = Math.sin(angle), cos = Math.cos(angle)
  assert.equal(g.center.x, origin.x); assert.equal(g.center.y, origin.y - 76)
  assert.equal(g.width, d.deckLength); assert.equal(g.height, d.deckThickness)
  assert.equal(g.rotationDeg, motif.parameters.slopeDeg); assert.equal(deck.vector.fill.element, motif.parameters.deckMaterial)
  assert.equal(JSON.stringify(deck.placement.offsets), '[{"x":0,"y":0}]', 'Deck keeps the common authored transform')
  const supports = jobs.filter(job => job.label.startsWith('trestle-'))
  assert.equal(supports.length, 2)
  for (const support of supports) {
    const s = support.spec, line = s.vector.geometry, [top, bottom] = line.points
    assert.equal(s.vector.output.kind, 'particles'); assert.equal(s.vector.fill.element, motif.parameters.supportMaterial)
    assert.equal(line.width, d.supportWidth); assert.equal(top.x, bottom.x); assert.equal(bottom.y, origin.y + 42)
    assert.ok(top.y < bottom.y, 'A support extends downward to its unchanged surveyed ground')
    // TerrainVector.drawLine uses ceil(width/2); RasterOps.paintBrush covers
    // circle centers through radius-1, after lineEachPixel rounds its endpoint.
    const radius = Math.max(0, Math.ceil(line.width / 2) - 1)
    let closestCap = Infinity, paddedGap = Infinity
    for (let i = 0; i < 720; i++) {
      const a = i * Math.PI / 360
      const dx = Math.cos(a) * radius, dy = Math.sin(a) * radius
      const x = top.x + dx - g.center.x, y = top.y + dy - g.center.y
      closestCap = Math.min(closestCap, -sin * x + cos * y - g.height / 2)
      // Exercise rounded native stamp centers plus a conservative 1.5px
      // envelope for both pixel footprints/antialiasing. The cap must remain
      // wholly below the deck, not merely miss a few sampled deck centers.
      for (const ex of [-1.5, 1.5]) for (const ey of [-1.5, 1.5]) {
        const rx = Math.round(top.x) + dx + ex - g.center.x
        const ry = Math.round(top.y) + dy + ey - g.center.y
        paddedGap = Math.min(paddedGap, -sin * rx + cos * ry - g.height / 2)
      }
    }
    assert.ok(closestCap >= 3.99 && closestCap < 5, motif.id + ': a small native settling gap, not a floating deck')
    assert.ok(paddedGap > 1, motif.id + ': rounded/raster cap envelope stays below the full rotated underside')
    const localX = cos * (top.x - g.center.x) + sin * (top.y - g.center.y)
    assert.ok(Math.abs(localX) + radius < g.width / 2, 'Both trestles remain under the full deck length')
  }
}
const counterweights = stories.themes.flatMap(theme => theme.motifs).filter(motif => motif.kind === 'counterweight')
assert.equal(counterweights.length, 18)
for (const motif of counterweights) verify(assembly(motif))
// Authored motifs currently share dimensions. Exercise both slope signs and
// odd cap widths so a half-thickness/vertical-radius shortcut cannot regress.
let variations = 0
for (const slope of [-30, -8, 0, 8, 30]) for (const width of [7, 8, 11]) for (const thickness of [6, 10, 18]) {
  const motif = structuredClone(counterweights[0])
  motif.parameters.slopeDeg = slope
  motif.parameters.dimensions.supportWidth = width
  motif.parameters.dimensions.deckThickness = thickness
  verify(assembly(motif, { x: 6400.37, y: 700.26 })); variations++
}
// Exact occupied cells reported by native packaged2571 for fallen-bell. They
// must no longer be painted by either trestle; the deck itself is unchanged.
const fallen = assembly(counterweights.find(motif => motif.id === 'fallen-bell'))
for (const [x, y] of [[18002, 162], [18004, 163], [18094, 174], [18092, 175], [18093, 175], [18094, 175], [18095, 175], [18096, 175]]) {
  for (const { spec } of fallen.jobs.filter(job => job.label.startsWith('trestle-'))) {
    const [a, b] = spec.vector.geometry.points, radius = Math.ceil(spec.vector.geometry.width / 2) - 1
    const nearestY = Math.max(Math.round(a.y), Math.min(Math.round(b.y), y))
    assert.ok(Math.hypot(x - Math.round(a.x), y - nearestY) > radius, 'Trestle must not reproduce reported deck obstruction at ' + x + ',' + y)
  }
}
console.log('PASS: 18 authored counterweights and ' + variations + ' slope/width/thickness variants keep complete rounded trestle caps clear of unchanged decks; all eight native fallen-bell obstruction cells excluded')
