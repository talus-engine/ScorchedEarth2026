// Check game policy invariants against the actual TypeScript functions.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const ts = require(require.resolve('typescript', { paths: [path.resolve(root, '../foxtrot')] }))
const arena = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/arena.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'world/Scripts/match.ts'), 'utf8')
const instrumented = source.replace(/}\s*$/, `
  globalThis.testPolicy = { validate, movementVelocity,
    configure(a) { arena = a }, load(m) { match = m } }
}`)
const context = { talus: { editor: { available: false }, world: { seed: 7 }, on() {}, after() {} } }
vm.createContext(context)
vm.runInContext(ts.transpileModule(instrumented, { compilerOptions: { target: ts.ScriptTarget.ES2024 } }).outputText, context)
const policy = context.testPolicy
policy.configure(arena)
for (let count = 2; count <= arena.maxPlayers; count++) {
  const match = policy.validate({ humans: 0, computers: count, turnSeconds: 30 })
  const xs = match.roster.map(p => p.spawnX)
  assert.equal(new Set(xs).size, count, 'Each tank has its own deployment position')
  assert.equal(match.humans, 0)
  assert.equal((xs[0] + xs.at(-1)) / 2, arena.bounds.w / 2)
  assert.ok(xs.at(-1) - xs[0] + 2 * arena.combat.tankHalfWidth <= 1600)
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 2 * arena.combat.tankHalfWidth)
  policy.load(match)
  const left = match.bounds.x + arena.combat.tankHalfWidth
  const right = match.bounds.x + match.bounds.w - arena.combat.tankHalfWidth
  for (const x of [left, left + .1, (left + right) / 2, right - .1, right]) {
    for (const dt of [1 / 30, 1 / 60]) for (const request of [-55, 0, 55]) {
      const velocity = policy.movementVelocity(x, request, dt)
      assert.ok(x + velocity * dt >= left && x + velocity * dt <= right)
      assert.ok(Math.abs(velocity) <= Math.abs(request))
      assert.ok(velocity === 0 || Math.sign(velocity) === Math.sign(request))
    }
  }
  assert.equal(policy.movementVelocity(left, 55, 1 / 60), 55, 'Left edge permits moving inward')
  assert.equal(policy.movementVelocity(right, -55, 1 / 60), -55, 'Right edge permits moving inward')
}
console.log('PASS: 2–16 CPU layouts, distinct nonoverlapping hulls, compact span and movement boundary policy')
