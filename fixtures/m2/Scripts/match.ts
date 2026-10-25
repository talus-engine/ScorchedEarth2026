// Match setup owns persistent game state. Tank blackboards own per-player data.
// Turn rules and AI actions will build on the deployed roster in the next milestone.
if (!talus.editor.available) {
  let arena: any = null
  let match: any = null
  let busy = false
  let inspecting = false
  const colors = ['#bcb1ff', '#ffbd82', '#8ae0ca', '#f7a5c4', '#a4d2ff', '#ebd78a']

  function persist() { talus.state.setJson('indigo.match', match) }
  function publish(message?: string) {
    if (!match) return
    const player = match.roster[match.focusIndex] || match.roster[0]
    talus.ui.set({ biome: arena.biome.name, seed: match.seed, status: message || 'Deployment complete',
      tankCount: match.roster.length, turnSeconds: match.turnSeconds, ready: match.phase === 'ready',
      current: { name: player?.name || '', control: player?.control === 'human' ? 'Human' : 'Computer',
        angle: 45, power: 70, color: player?.color || colors[0] },
      roster: match.roster.map((p: any) => ({ name: p.name, control: p.control, color: p.color })) })
  }
  function fail(error: any) {
    talus.log('setup fault', { message: String(error), stack: error?.stack })
    talus.state.set('indigo.error', String(error))
    talus.ui.set('error', String(error))
    talus.ui.banner('Match setup stopped', { sub: String(error), ms: 10000 })
  }
  function protectedCall(fn: () => Promise<void>) { void fn().catch(fail) }
  function setupModel() {
    const saved: any = talus.installed.get('indigo') || {}
    talus.ui.set('installed.indigo', { humans: 1, computers: 1, turnSeconds: 30,
      namesText: 'Player 1\nCPU 1', ...saved })
  }
  function showSetup() {
    setupModel()
    talus.ui.set('canResume', match?.phase === 'ready')
    if (!match) talus.ui.hud(null)
    talus.ui.openMenu('Menus/setup.html')
  }
  async function inspect(index: number) {
    if (inspecting || !match || match.phase !== 'ready') return
    inspecting = true
    try {
      match.focusIndex = (index + match.roster.length) % match.roster.length
      persist()
      const p = match.roster[match.focusIndex]
      const tank = talus.entities.get(p.entityId)
      if (!tank?.exists) throw new Error('Roster tank is missing: ' + p.name)
      talus.camera.follow('off')
      talus.camera.centerOn(tank.position!)
      if (!await tank.whenLive({ timeoutTicks: 600 })) throw new Error('Tank did not become live: ' + p.name)
      tank.weapon.aim(-Math.PI / 4, 0.7)
      talus.ui.nameplate(tank, { text: p.name, bar: 'health', color: p.color })
      publish()
    } finally { inspecting = false }
  }
  function validate(params: any) {
    const humans = Number(params.humans), computers = Number(params.computers), seconds = Number(params.turnSeconds)
    if (!Number.isInteger(humans) || humans < 0 || !Number.isInteger(computers) || computers < 0
      || humans + computers < 2 || humans + computers > arena.maxPlayers)
      throw new Error('Choose between 2 and ' + arena.maxPlayers + ' tanks in total.')
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120)
      throw new Error('Turn length must be a whole number from 5 to 120 seconds.')
    const supplied = String(params.namesText || '').split(/\r?\n/).map(v => v.trim().slice(0, 32))
    const count = humans + computers
    const width = arena.tiles.width
    const span = Math.min(width - 4, (count - 1) * arena.maxStartingGapTiles)
    const left = (width - 1 - span) / 2
    const roster = Array.from({ length: count }, (_, i) => ({
      index: i, name: supplied[i] || (i < humans ? 'Player ' + (i + 1) : 'CPU ' + (i - humans + 1)),
      control: i < humans ? 'human' : 'cpu', color: colors[i % colors.length], entityId: null,
      spawnX: Math.round(left + span * i / (count - 1)) * 256 + 128,
    }))
    return { seed: talus.world.seed, biome: arena.biome.id, bounds: arena.bounds, turnSeconds: seconds,
      humans, computers, phase: 'deploying', focusIndex: 0, roster }
  }
  async function boot() {
    if (busy) return
    busy = true
    try {
      arena = JSON.parse((await talus.files.readText('Game/arena.json'))!)
      setupModel()
      talus.camera.follow('off')
      for (const p of talus.players.list()) p.inputEnabled = false
      match = talus.state.getJson('indigo.match')
      if (!match) {
        const params: any = talus.game.params
        if (!params || params.deploy !== 'yes') { showSetup(); return }
        try { match = validate(params) } catch (error) {
          talus.ui.set('error', String(error)); showSetup(); return
        }
        persist()
        const previous: any = talus.installed.get('indigo') || {}
        talus.installed.set('indigo', { ...previous, humans: match.humans, computers: match.computers,
          turnSeconds: match.turnSeconds, namesText: match.roster.map((p: any) => p.name).join('\n') })
      }
      talus.ui.closeMenu()
      talus.ui.hud('Menus/hud.html')
      for (const p of match.roster) {
        if (p.entityId) continue
        publish('Deploying ' + (p.index + 1) + ' / ' + match.roster.length)
        const ground = await talus.world.findSurface(p.spawnX, arena.surfaceBand.top, arena.surfaceBand.height)
        if (ground === null) throw new Error('WFC terrain has no surface at ' + p.spawnX)
        talus.camera.centerOn(p.spawnX, ground - 60)
        await talus.sleepTicks(90)
        const tank = await talus.entities.spawn(arena.tankTemplate, p.spawnX, ground - 48)
        if (!tank) throw new Error('Tank spawn refused for ' + p.name)
        p.entityId = tank.id
        p.surfaceY = ground
        persist()
        tank.blackboard.set('name', p.name)
        tank.blackboard.set('custom.indigoPlayer', p.index)
        tank.blackboard.set('custom.control', p.control)
        tank.blackboard.set('custom.angle', 45)
        tank.blackboard.set('custom.power', 70)
        if (!await tank.whenLive({ timeoutTicks: 600 })) throw new Error('Spawn did not become live: ' + p.name)
        await talus.sleepTicks(90)
        talus.ui.nameplate(tank, { text: p.name, bar: 'health', color: p.color })
        talus.log('deployed', { index: p.index, name: p.name, id: p.entityId, at: tank.position })
      }
      match.phase = 'ready'
      persist()
      await inspect(match.focusIndex)
      talus.state.set('indigo.error', '')
      talus.log('match ready', { seed: match.seed, players: match.roster.length })
    } finally { busy = false }
  }
  talus.on('world.game-started', () => protectedCall(boot))
  talus.on('world.game-loaded', () => protectedCall(boot))
  talus.on('menu.hud.next-tank', () => protectedCall(() => inspect(match.focusIndex + 1)))
  talus.on('menu.hud.previous-tank', () => protectedCall(() => inspect(match.focusIndex - 1)))
  talus.on('menu.hud.setup', showSetup)
  talus.on('entity.residency', e => {
    if (e.entity?.isLive && match) {
      const p = match.roster.find((p: any) => p.entityId === e.entity!.id)
      if (p) talus.ui.nameplate(e.entity, { text: p.name, bar: 'health', color: p.color })
    }
  })
  talus.after(1, () => protectedCall(boot))
}
