// Indigo M3. Global state owns the match; durable NPC blackboards own controls.
if (!talus.editor.available) {
  let arena: any, match: any
  let booting = false, booted = false, ticks = 0
  let shot: Projectile | null = null
  const colors = ['#bcb1ff', '#ffbd82', '#8ae0ca', '#f7a5c4', '#a4d2ff', '#ebd78a']
  const entity = (p: any): Entity => talus.entities.get(p.entityId)!
  const current = () => match.roster[match.focusIndex]
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const active = () => booted && !booting && match?.phase === 'turn'
  const human = () => active() && current().control === 'human'
  function input(enabled: boolean) { for (const p of talus.players.list()) p.inputEnabled = enabled && p.slot === 0 }
  function persist() { talus.state.setJson('indigo.match', match) }
  function record(kind: string, detail: any = {}) {
    const rows: any = talus.state.getJson('indigo.events') || []
    rows.push({ ...detail, kind, turn: match?.turnNumber, clock: talus.sim.clock })
    talus.state.setJson('indigo.events', rows.slice(-160)); talus.log(kind, detail)
  }
  function fail(error: any) {
    const message = String(error); record('fault', { message })
    input(false)
    if (match) { match.phase = 'fault'; match.message = message; persist(); publish() }
    talus.state.set('indigo.error', message)
    talus.ui.banner('Match stopped', { sub: message, ms: 10000 })
  }
  function run(fn: () => Promise<void>) { void fn().catch(fail) }
  function publish() {
    if (!match) return
    const p = current(), e = p.entityId ? entity(p) : null
    talus.ui.set({ biome: arena.biome.name, seed: match.seed, tankCount: match.roster.length,
      phase: match.phase, status: match.message, turnNumber: match.turnNumber,
      remaining: Math.max(0, Math.ceil(match.remaining)), turnSeconds: match.turnSeconds,
      ready: match.phase === 'ready', human: human(),
      canSetup: ['ready', 'finished', 'fault'].includes(match.phase), finished: match.phase === 'finished',
      winner: match.winner || 'Draw',
      current: { name: p.name, color: p.color, control: p.control === 'human' ? 'Human' : 'Computer',
        angle: Number(e?.blackboard.get('custom.angle') ?? 45),
        power: Number(e?.blackboard.get('custom.power') ?? 70), health: e?.health == null ? '…' : Math.round(e.health) },
      roster: match.roster.map((r: any) => ({ name: r.name, color: r.color,
        health: r.eliminated ? 0 : !r.entityId ? 100 : entity(r)?.health == null ? '…' : Math.max(0, Math.round(entity(r).health!)),
        status: r.eliminated ? 'OUT' : r.index === match.focusIndex ? 'CURRENT' : 'WAITING', kills: r.kills })),
    })
  }
  function showSetup() {
    if (match && !['ready', 'finished', 'fault'].includes(match.phase)) return
    const saved: any = talus.installed.get('indigo') || {}
    talus.ui.set('installed.indigo', { humans: 1, computers: 1, turnSeconds: 30,
      namesText: 'Player 1\nCPU 1', ...saved })
    talus.ui.set('canResume', !!match)
    if (!match) talus.ui.hud(null)
    talus.ui.openMenu('Menus/setup.html')
  }
  function validate(params: any) {
    const humans = Number(params.humans), computers = Number(params.computers), seconds = Number(params.turnSeconds)
    if (!Number.isInteger(humans) || humans < 0 || !Number.isInteger(computers) || computers < 0
      || humans + computers < 2 || humans + computers > arena.maxPlayers)
      throw new Error('Choose between 2 and ' + arena.maxPlayers + ' tanks in total.')
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120)
      throw new Error('Choose a turn length from 5 to 120 whole seconds.')
    const supplied = String(params.namesText || '').split(/\r?\n/).map(v => v.trim().slice(0, 32))
    const count = humans + computers, span = Math.min(arena.tiles.width - 4, (count - 1) * arena.maxStartingGapTiles)
    const left = (arena.tiles.width - 1 - span) / 2
    const roster = Array.from({ length: count }, (_, i) => ({ index: i,
      name: supplied[i] || (i < humans ? 'Player ' + (i + 1) : 'CPU ' + (i - humans + 1)),
      control: i < humans ? 'human' : 'cpu', color: colors[i % colors.length], entityId: null,
      spawnX: Math.round(left + span * i / (count - 1)) * 256 + 128, eliminated: false, kills: 0,
    }))
    if (new Set(roster.map(p => p.name.toLowerCase())).size !== count)
      throw new Error('Use a different name for each tank so scores stay distinct.')
    return { version: 3, seed: talus.world.seed, biome: arena.biome.id, bounds: arena.bounds,
      humans, computers, turnSeconds: seconds, remaining: seconds, phase: 'deploying', focusIndex: 0,
      turnNumber: 0, shotId: null, impact: null, roster, winner: null, message: 'Deploying tanks' }
  }
  function aim() {
    const e = entity(current())
    if (e?.isLive) e.weapon.aim(-Number(e.blackboard.get('custom.angle')) * Math.PI / 180,
      Number(e.blackboard.get('custom.power')) / 100)
  }
  function adjust(angle: number, power: number) {
    if (!human()) return
    const e = entity(current())
    e.blackboard.set('custom.angle', Math.round(clamp(Number(e.blackboard.get('custom.angle')) + angle, 5, 175) * 10) / 10)
    e.blackboard.set('custom.power', Math.round(clamp(Number(e.blackboard.get('custom.power')) + power, 1, 100) * 10) / 10)
    aim()
  }
  async function focus() {
    const e = entity(current())
    talus.camera.follow('off'); talus.camera.centerOn(e.position!)
    if (!await e.whenLive({ timeoutTicks: 600 })) throw new Error('Tank could not be restored: ' + current().name)
    for (let n = 0; n < 600 && !e.isLive; n++) await talus.sleepTicks(1)
    if (!e.isLive) throw new Error('Tank ground did not become ready')
    aim(); talus.ui.nameplate(e, { text: current().name, bar: 'health', color: current().color })
  }
  function eliminate(p: any, reason: string, killerId?: string | null) {
    if (p.eliminated) return
    p.eliminated = true
    const killer = match.roster.find((r: any) => r.entityId === killerId)
    if (killer && killer !== p) killer.kills++
    record('eliminated', { name: p.name, reason, killer: killer?.name || null }); persist(); publish()
  }
  function checkRoster() {
    if (!match || match.phase === 'deploying') return
    const b = match.bounds
    for (const p of match.roster) {
      if (p.eliminated || !p.entityId) continue
      const e = entity(p), s = e?.snapshot()
      if (!s || !s.alive) { eliminate(p, 'destroyed'); continue }
      if (s.x < b.x || s.x >= b.x + b.w || s.y < b.y || s.y >= b.y + b.h) {
        eliminate(p, 'out of bounds'); e.kill('env:indigo-bounds')
      }
    }
  }
  async function announce(story: string, vars: any) {
    if (talus.dialogue.active) talus.dialogue.dismiss()
    if (!await talus.dialogue.start(story, { mode: 'announcer', speaker: 'Range control',
      lineMs: 1600, vars, writeBack: false })) record('announcement-unavailable', { story })
  }
  function finish(): boolean {
    const alive = match.roster.filter((p: any) => !p.eliminated)
    if (alive.length > 1) return false
    match.phase = 'finished'; match.winner = alive[0]?.name || null
    input(false)
    match.message = match.winner ? match.winner + ' wins the match' : 'No tanks remain — draw'
    const scores: any = talus.installed.get('indigo.scores') || { players: {}, matches: {} }
    if (!scores.matches[talus.world.id]) {
      for (const p of match.roster) {
        const key = p.name.toLowerCase(), s = scores.players[key] || { name: p.name, games: 0, wins: 0, kills: 0 }
        s.games++; s.kills += p.kills; if (p.name === match.winner) s.wins++
        scores.players[key] = s
      }
      scores.matches[talus.world.id] = { winner: match.winner, seed: match.seed }
      talus.installed.set('indigo.scores', scores)
    }
    talus.ui.set('scores', Object.values(scores.players))
    persist(); publish(); record('finished', { winner: match.winner })
    run(() => announce('Indigo Result', { winner: match.winner || 'Nobody' })); return true
  }
  async function beginTurn(next: boolean) {
    if (['focusing', 'deploying', 'finished', 'fault'].includes(match.phase)) return
    input(false); match.phase = 'focusing'; checkRoster()
    if (finish()) return
    if (next) do { match.focusIndex = (match.focusIndex + 1) % match.roster.length } while (current().eliminated)
    match.turnNumber++; match.remaining = match.turnSeconds; match.shotId = null; match.impact = null
    match.message = 'Loading ' + current().name; persist(); publish(); await focus()
    match.phase = 'turn'; match.message = current().control === 'human' ? 'Position, aim and fire' : 'Computer is choosing its shot'
    input(current().control === 'human')
    entity(current()).blackboard.set('custom.turn', match.turnNumber)
    persist(); publish(); record('turn', { name: current().name, id: current().entityId })
    run(() => announce('Indigo Turn', { playerName: current().name, seconds: match.turnSeconds }))
    if (current().control === 'cpu') entity(current()).runGraph(arena.cpuGraph, { turn: match.turnNumber })
  }
  function fire() {
    if (!active() || current().eliminated) return
    const e = entity(current()); if (!e.isLive) return
    aim(); input(false); match.phase = 'firing'; match.waitTicks = 0; match.message = 'Firing'; persist(); publish()
    const s = e.snapshot()!; e.setVelocity(0, s.vy); current().shotFrom = { x: s.x, y: s.y }
    record('fire-request', { owner: e.id, angle: e.blackboard.get('custom.angle'), power: e.blackboard.get('custom.power') })
    if (!e.weapon.fire()) fail('Cannon did not accept the trigger')
  }
  function cpuPlan(e: any) {
    if (!active() || current().control !== 'cpu' || e.id !== current().entityId || e.turn !== match.turnNumber) return
    const p = current(), tank = entity(p), origin = tank.position!
    // Sequence reevaluates earlier children while Wait is running.
    if (p.plannedTurn === match.turnNumber) return
    p.plannedTurn = match.turnNumber
    const targets = match.roster.filter((r: any) => !r.eliminated && r !== p)
    targets.sort((a: any, b: any) => Math.abs(entity(a).x! - origin.x) - Math.abs(entity(b).x! - origin.x))
    const target = entity(targets[0]).position!, distance = Math.abs(target.x - origin.x)
    // Simple ranging AI learns from actual impacts, without a copied gravity constant.
    let power = Number(tank.blackboard.get('custom.aiPower') ?? 70)
    const last: any = tank.blackboard.get('custom.aiLastShot'), speed = tank.weapon.state?.speed
    if (last && speed && last.distance > 20) {
      const previousSpeed = speed.min + (speed.max - speed.min) * last.power / 100
      power = clamp((previousSpeed * Math.sqrt(distance / last.distance) - speed.min) / (speed.max - speed.min) * 100, 8, 100)
    }
    p.targetId = targets[0].entityId
    tank.blackboard.set('custom.angle', target.x > origin.x ? 45 : 135)
    tank.blackboard.set('custom.power', Math.round(power)); tank.blackboard.set('custom.aiPower', power)
    aim(); publish(); record('cpu-plan', { name: p.name, target: targets[0].name, power })
  }
  async function settle() {
    const p = match.impact; if (!p) throw new Error('Missing impact resolution point')
    match.phase = 'settling'; match.message = 'Waiting for terrain and tanks to settle'; persist(); publish()
    talus.camera.centerOn(p)
    const result = await talus.world.watchSettle({ x: p.x - 192, y: p.y - 128, w: 384, h: 384 }, { maxTicks: 600 }).done
    record('settled', result)
    if (result.timedOut) throw new Error('Impact did not settle within 600 ticks')
    checkRoster(); if (!finish()) await beginTurn(true)
  }
  async function boot() {
    if (booting || booted) return
    booting = true
    try {
      arena = JSON.parse((await talus.files.readText('Game/arena.json'))!)
      for (const p of talus.players.list()) { p.inputEnabled = false; p.release() }
      match = talus.state.getJson('indigo.match')
      if (!match) {
        const params: any = talus.game.params
        if (params?.deploy !== 'yes') { showSetup(); booted = true; return }
        try { match = validate(params) } catch (err) { talus.ui.set('error', String(err)); showSetup(); booted = true; return }
        persist()
        const saved: any = talus.installed.get('indigo') || {}
        talus.installed.set('indigo', { ...saved, humans: match.humans, computers: match.computers,
          turnSeconds: match.turnSeconds, namesText: match.roster.map((p: any) => p.name).join('\n') })
      }
      if (match.version !== 3) throw new Error('This save belongs to the M2 fixture. Start a new match for M3.')
      talus.ui.closeMenu(); talus.ui.hud('Menus/hud.html'); talus.camera.follow('off')
      if (match.phase === 'deploying') {
        for (const p of match.roster) {
          if (p.entityId) continue
          match.message = 'Deploying ' + (p.index + 1) + ' / ' + match.roster.length; publish()
          const ground = await talus.world.findSurface(p.spawnX, arena.surfaceBand.top, arena.surfaceBand.height)
          if (ground === null) throw new Error('Missing WFC surface at ' + p.spawnX)
          talus.camera.centerOn(p.spawnX, ground - 60); await talus.sleepTicks(90)
          const tank = await talus.entities.spawn(arena.tankTemplate, p.spawnX, ground - 48)
          if (!tank) throw new Error('Tank spawn refused: ' + p.name)
          p.entityId = tank.id; p.surfaceY = ground; persist()
          tank.blackboard.set('name', p.name); tank.blackboard.set('custom.indigoPlayer', p.index)
          tank.blackboard.set('custom.control', p.control); tank.blackboard.set('custom.angle', 45); tank.blackboard.set('custom.power', 70)
          if (!await tank.whenLive({ timeoutTicks: 600 })) throw new Error('Tank did not become live')
          await talus.sleepTicks(90)
          talus.ui.nameplate(tank, { text: p.name, bar: 'health', color: p.color }); record('deployed', { name: p.name, id: tank.id })
        }
        match.phase = 'ready'; match.message = 'Tanks ready — begin when your crew is ready'; persist()
      }
      if (match.phase === 'ready' || match.phase === 'turn') {
        await focus()
      } else if (match.phase === 'flight') {
        shot = talus.projectiles.get(match.shotId)
        if (!shot?.exists) throw new Error('The saved shot is missing. Projectile persistence needs engine investigation.')
      } else if (match.phase === 'firing' || match.phase === 'focusing') throw new Error('Save interrupted a turn transition; resolution needs investigation.')
      else if (match.phase === 'finished') {
        const scores: any = talus.installed.get('indigo.scores'); talus.ui.set('scores', Object.values(scores?.players || {}))
      }
      booted = true; booting = false
      input(match.phase === 'turn' && current().control === 'human')
      if (match.phase === 'settling') run(settle)
      if (match.phase === 'turn' && current().control === 'cpu') entity(current()).runGraph(arena.cpuGraph, { turn: match.turnNumber })
      publish(); talus.state.set('indigo.error', ''); record('match-ready', { phase: match.phase })
    } finally { booting = false }
  }
  talus.on('world.game-started', () => run(boot)); talus.on('world.game-loaded', () => run(boot)); talus.after(1, () => run(boot))
  talus.on('menu.hud.begin', () => { if (match?.phase === 'ready') run(() => beginTurn(false)) })
  talus.on('menu.hud.fire', () => { if (human()) fire() })
  talus.on('menu.hud.pass', () => { if (human()) { record('pass'); run(() => beginTurn(true)) } })
  talus.on('menu.hud.angle-up', () => adjust(5, 0)); talus.on('menu.hud.angle-down', () => adjust(-5, 0))
  talus.on('menu.hud.power-up', () => adjust(0, 5)); talus.on('menu.hud.power-down', () => adjust(0, -5))
  talus.on('menu.hud.setup', showSetup); talus.on('indigo:cpu-plan', cpuPlan)
  talus.on('indigo:cpu-fire', e => { if (active() && current().control === 'cpu' && e.id === current().entityId && e.turn === match.turnNumber) fire() })
  talus.on('input.pressed', e => {
    if (e.slot !== 0 || !human()) return
    if (e.action === 'tank_fire') fire()
    if (e.action === 'tank_pass') { record('pass'); run(() => beginTurn(true)) }
  })
  talus.on('weapon.beforeFire', e => {
    if (match?.roster.some((p: any) => p.entityId === e.entity?.id))
      return match.phase === 'firing' && current().entityId === e.entity?.id
  })
  talus.on('projectile.launch', e => {
    if (!match || match.phase !== 'firing' || e.owner?.id !== current().entityId) return
    shot = e.projectile; match.shotId = e.projectileId; match.phase = 'flight'; match.waitTicks = 0
    match.message = 'Shell in flight'; persist(); publish(); record('launch', { id: e.projectileId, owner: e.owner?.id })
  })
  talus.on('projectile.hit', e => { if (e.projectileId === match?.shotId) record('hit', JSON.parse(JSON.stringify(e))) })
  talus.on('projectile.end', e => {
    if (!match || e.projectileId !== match.shotId) return
    shot = null; match.shotId = null; match.impact = { x: Number(e.x), y: Number(e.y) }
    if (!Number.isFinite(match.impact.x) || !Number.isFinite(match.impact.y)) { fail('Projectile ended without a resolution point'); return }
    const p = current(), tank = entity(p)
    if (p.control === 'cpu' && p.shotFrom) tank.blackboard.set('custom.aiLastShot', {
      distance: Math.abs(match.impact.x - p.shotFrom.x), power: Number(tank.blackboard.get('custom.power')) })
    record('end', { ...match.impact, owner: e.owner?.id, shooterResidency: tank.residency }); run(settle)
  })
  talus.on('death', e => {
    const p = match?.roster.find((r: any) => r.entityId === (e.entity?.id || e.stableId))
    if (p) eliminate(p, 'destroyed', e.killer?.id)
  })
  talus.on('entity.residency', e => {
    const p = match?.roster.find((r: any) => r.entityId === e.entityKey)
    if (p && e.entity.isLive) {
      talus.ui.nameplate(e.entity, { text: p.name, bar: 'health', color: p.color }); if (active() && p === current()) aim()
    }
  })
  talus.on('entity.land', e => {
    if (match?.roster.some((p: any) => p.entityId === e.entity?.id)) record('land', { id: e.entity?.id })
  })
  talus.on('tick.sim.pre', e => {
    if (!booted || booting || !match || match.phase === 'fault') return
    ticks++
    if (ticks % 6 === 0) {
      checkRoster()
      if (active() && match.roster.filter((p: any) => !p.eliminated).length <= 1) finish()
      if (!active()) publish()
    }
    if (match.phase === 'flight') {
      const s = shot?.snapshot(); if (s) talus.camera.centerOn(s.x, s.y)
      if (++match.waitTicks > 2700) fail('Projectile did not resolve within 45 seconds'); return
    }
    if (match.phase === 'firing') { if (++match.waitTicks > 180) fail('Cannon trigger produced no projectile'); return }
    if (!active()) return
    if (current().eliminated) { run(() => beginTurn(true)); return }
    const tank = entity(current()), s = tank.snapshot(); if (s) talus.camera.centerOn(s.x, s.y)
    match.remaining = Math.max(0, match.remaining - e.dt)
    if (human() && tank.isLive && s) {
      const a = talus.players.get(0)?.readInput()?.actions || {}
      tank.setVelocity((Number(!!a.tank_move_right) - Number(!!a.tank_move_left)) * arena.moveSpeed, s.vy)
      const da = Number(!!a.tank_angle_up) - Number(!!a.tank_angle_down), dp = Number(!!a.tank_power_up) - Number(!!a.tank_power_down)
      if (da || dp) adjust(da * 30 * e.dt, dp * 30 * e.dt)
    }
    if (match.remaining <= 0) { record('timeout'); run(() => beginTurn(true)); return }
    if (ticks % 6 === 0) { persist(); publish() }
  })
}
