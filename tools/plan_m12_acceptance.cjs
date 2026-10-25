// Offline planning only: execute the game's real story-selection functions
// against immutable project metadata. No bridge, terrain jobs or file writes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [path.resolve(root, '../foxtrot')] }))
const text = name => fs.readFileSync(path.join(root, name), 'utf8')
const read = name => JSON.parse(text(name))
const source = text('world/Scripts/match.ts'), config = read('world/Game/generation.json')
const stories = read('world/Game/landscape-stories.json'), catalog = read('world/Game/Presets/catalog.json')
const models = read('world/Game/Presets/neural.json').models, growth = read('world/Game/Presets/living.json').presets
const files = new Map()
const talus = {
  editor: { available: false }, on() {}, after() {},
  files: { readText: async name => {
    if (!name.startsWith('Game/')) throw Error('Unexpected metadata path: ' + name)
    if (!files.has(name)) files.set(name, text('world/' + name))
    return files.get(name)
  } },
  world: { resources: {
    catalogs: async () => [structuredClone(catalog)],
    validate: async () => catalog.manifest.entries.map(e => ({ ...e, ok: true, runtime: { supported: true } })),
    read: async (id, kind, key) => {
      if (id !== catalog.id || !['neural', 'growth'].includes(kind)) throw Error('Unexpected resource lookup')
      const value = (kind === 'neural' ? models : growth).find(x => x.id === key)
      if (!value) throw Error('Missing resource ' + key)
      return structuredClone(value)
    },
  } },
}
const injected = source.replace(/}\s*$/, `
  globalThis.plan = async function(seed, config, arenaConfig) {
    arena = arenaConfig; generationRecipes = config; configureGeneration('brush');
    match = {seed, generationVersion:12, chaos:{rng:2468}};
    persist = () => {}; record = () => {};
    await prepareProcedural();
    if (!match.procedural.story) throw Error('Local storyFile is not enabled');
    const macro = storyMacroPlan();
    return {seed, story:match.procedural.story, macroJobs:storyMacroJobs().length,
      profilePoints:macro.nodes.length, familyCounts:Object.fromEntries(Object.entries(match.procedural.choices).map(([k,v])=>[k,v.length]))};
  }
}`)
const context = { talus }; vm.createContext(context)
vm.runInContext(ts.transpileModule(injected, { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText, context)
async function main() {
  const start = Number(process.argv[2] || 256300), limit = Number(process.argv[3] || 256)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(limit) || limit < 1 || limit > 2000) throw Error('Usage: node tools/plan_m12_acceptance.cjs [start-seed] [1..2000-seeds]')
  const desired = { 'drowned-cathedral': 'spillway', 'black-gold-graveyard': 'fuel-cell', 'hanging-quarry': 'counterweight' }
  const chosen = new Map()
  for (let seed = start; seed < start + limit && chosen.size < stories.themes.length; seed++) {
    const result = await context.plan(seed, structuredClone(config), read('world/Game/arena.json'))
    const id = result.story.id
    if (chosen.has(id) || (desired[id] && result.story.motifs[0].kind !== desired[id])) continue
    chosen.set(id, result)
  }
  if (chosen.size !== stories.themes.length) throw Error('Search did not cover all story/central-kind requirements')
  const authoredMotifs = stories.themes.flatMap(t => t.motifs.map(m => m.id))
  const selectedMotifs = new Set([...chosen.values()].flatMap(p => p.story.motifs.map(m => m.id)))
  if (authoredMotifs.some(id => !selectedMotifs.has(id))) throw Error('Selected maps omit an authored motif')
  const hash = s => crypto.createHash('sha256').update(s).digest('hex')
  console.log(JSON.stringify({
    scope:'Offline source selection only; no native generation/physics acceptance', start, limit, uniqueMotifs:selectedMotifs.size,
    sourceSha256:hash(source), storySha256:hash(text('world/Game/landscape-stories.json')), catalogHash:catalog.hash,
    stories: stories.themes.map(theme => {
      const p = chosen.get(theme.id)
      return {seed:p.seed,id:theme.id,name:theme.name,macroJobs:p.macroJobs,profilePoints:p.profilePoints,familyCounts:p.familyCounts,
        motifs:p.story.motifs.map(m=>({site:m.siteIndex,central:m.central,id:m.id,kind:m.kind,
          support:m.parameters.supportMaterial,deck:m.parameters.deckMaterial,load:m.parameters.loadMaterial,
          liquid:m.parameters.liquidMaterial,secondaryLiquid:m.parameters.secondaryLiquidMaterial,
          ignition:m.parameters.ignitionMaterial,source:m.parameters.sourceElement,drain:m.parameters.drainElement}))}
    }),
  }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
