// Scorched Earth 2026: M9 combat plus M10 arcade presentation. Indigo save identity stays stable.
if (!talus.editor.available) {
  let arena: any, match: any, chaosCatalog: any, quipCatalog: any, quipDeck: any, market: any, bank: any
  let shopOpen = false, shopIndex = 0, shopCategory = 'All'
  let generationRecipes: any, personaCatalog: any, soundCatalog: any, childDepth = 0
  let booting = false, booted = false, ticks = 0
  let launchingChaos = false
  let supplyCatalog: any = null, supplySequence = false
  const pendingTankReady = new Set<string>()
  function refreshRestoredTanks() {
    // End-of-turn posture intent survives a save even if its restore event was
    // delivered before this script booted. A later active turn supersedes it.
    for (const p of match.roster) if (p.passivePosturePending) {
      if (p.eliminated || p === current() && !['deploying', 'ready', 'finished'].includes(match.phase)) {
        delete p.passivePosturePending; persist()
      } else pendingTankReady.add(p.entityId)
    }
    for (const id of pendingTankReady) {
      const p = match.roster.find((row: any) => row.entityId === id), tank = p ? entity(p) : null
      if (!p || tank?.residency === 'destroyed') {
        if (p?.passivePosturePending) { delete p.passivePosturePending; persist() }
        pendingTankReady.delete(id); continue
      }
      if (!tank?.isLive) continue
      if (p.passivePosturePending) passivePosture(p)
      nameplate(p)
      // A restore event can precede native frozen→live and weapon readiness.
      // That later transition has no event; keep this bounded roster queue.
      if (active() && p === current() && !aim()) continue
      pendingTankReady.delete(id)
      record('tank-restored', { owner: id, liveId: tank.liveId, health: tank.health })
    }
  }
  // Only unfinished emitters own these small native regions. The engine also
  // releases script-owned anchors on disposal; handles are never serialized.
  const emissionRegions = new Map<string, { anchor: SimulationAnchor | null, spec: string, lastClock: number,
    waited: number, retryAt: number, reason: string, ready: boolean }>()
  function releaseEmissionRegion(key: string) {
    const region = emissionRegions.get(key)
    if (region) { region.anchor?.release(); emissionRegions.delete(key) }
  }
  function releaseEmissionRegions(prefix = '') {
    for (const key of [...emissionRegions.keys()]) if (key.startsWith(prefix)) releaseEmissionRegion(key)
  }
  function emissionRegionReady(key: string, spec: AnchorSpec, particles: boolean, actorReady = true): boolean {
    const clock = talus.sim.clock, signature = JSON.stringify(spec)
    let region = emissionRegions.get(key)
    if (!region) {
      region = { anchor: null, spec: signature, lastClock: clock, waited: 0, retryAt: clock, reason: '', ready: false }
      emissionRegions.set(key, region)
    }
    const elapsed = Math.max(0, clock - region.lastClock)
    region.lastClock = clock
    if (!region.ready) region.waited += elapsed
    if (region.waited > 10) {
      const reason = region.reason || 'native region did not become ready'
      releaseEmissionRegion(key)
      throw new Error(key + ' residency timed out after 10 simulated seconds: ' + reason)
    }
    if (clock >= region.retryAt && (!region.anchor || region.spec !== signature)) {
      try {
        if (region.anchor) region.anchor.update(spec)
        else region.anchor = talus.sim.anchor(spec)
        region.spec = signature
      } catch (error) {
        if ((error as any)?.code !== 'REFUSED' && !/^Error: REFUSED:|^REFUSED:/.test(String(error))) throw error
        const reason = String(error), changed = region.reason !== reason
        region.ready = false; region.reason = reason; region.retryAt = clock + .25
        if (changed) record('emission-residency-wait', { key, reason, waited: region.waited })
        return false
      }
    }
    const anchor = region.anchor, chunks = anchor?.chunks.length || 0
    region.ready = !!anchor?.active && region.spec === signature && !anchor.refused && chunks > 0
      && anchor.loaded === chunks && (!particles || anchor.particles === 'simulated') && actorReady
    if (!region.ready) region.reason = anchor?.refused || (!anchor && region.reason) || (!actorReady ? 'actor-not-simulated'
      : particles && anchor?.particles !== 'simulated' ? 'world-particles-not-simulated' : 'native-region-loading')
    return region.ready
  }
  function chaosRegionReady(job: any, fx: any): boolean {
    const wreck = talus.entities.get(job.owner), radius = Math.max(64, Math.ceil(fx.finishBlast || 0) + 16)
    const gone = wreck?.residency === 'destroyed'
    const spec: AnchorSpec = gone
      ? { rect: { x: job.x - radius, y: job.y - radius, w: radius * 2, h: radius * 2 }, label: 'terra-death-' + job.id }
      : { follow: job.owner, halfWidth: radius, halfHeight: radius, label: 'terra-death-' + job.id }
    // World-plane particle stepping is native. This does not extend the air,
    // heat or electromagnetic field solvers beyond their camera coverage.
    return emissionRegionReady('death:' + job.id, spec, fx.mode === 'spray' || !!fx.finishBlast,
      gone || !!wreck?.isLive)
  }
  // Ephemeral exit preparation. Native menu/quit actions still own saving and
  // their actual destinations; this only lets unfinished actions reach safety.
  let exitDrain: { phase: 'closing' | 'running' | 'ready' | 'failed', elapsed: number } | null = null
  let exitView = ''
  let arcadeCard: any = null, arcadeSerial = 0, cashFrameTime = 0
  const cashPopups = new Map<string, number>()
  let walletPopup: { owner: string, amount: number, remaining: number } | null = null
  const damageTextStyle: TransientTextStyle = {
    fontSize: 36, ms: 1500, outline: { color: '#080810', width: 3 },
    shadow: { color: '#080810', x: 3, y: 3 }, velocity: { x: 0, y: -180 },
    spread: { x: 55, y: 22 }, gravity: 190, rotationSpread: .18, angularVelocity: .16,
    squash: { x: .75, y: 1.6, seconds: .22 }, fadeStart: .68,
  }
  let shot: Projectile | null = null
  let utilityGeneration = 0, digging = false, nextDigAt = 0
  type SupplyReading = { jet: number, shield: number, magnet: number, groundSpent: number }
  const colors = ['#bcb1ff', '#ffbd82', '#8ae0ca', '#f7a5c4', '#a4d2ff', '#ebd78a']
  const entity = (p: any): Entity => talus.entities.get(p.entityId)!
  const current = () => match.roster[match.focusIndex]
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const presenting = () => !!match?.presentation.active || !!match?.presentation.queue.length
  const active = () => booted && !booting && !exitDrain && match?.phase === 'turn' && !current().cpuStalled && !presenting()
  const human = () => active() && current().control === 'human'
  function showArcadeCard(eyebrow: string, title: string, sub: string, seconds = 1, color = '#ffd447', score = ''): Promise<boolean> {
    if (arcadeCard) throw new Error('An arcade transition is already active')
    input(false)
    return new Promise(resolve => {
      const view = { id: ++arcadeSerial, eyebrow, title, sub, color, score, long: seconds > 1, radar: seconds === 1 && arcadeSerial % 2 === 0, receipt: eyebrow.includes('COMPLETE') }
      arcadeCard = { view, seconds, elapsed: 0, visible: false, resolve }
      persist(); record('arcade-start', { ...view, seconds })
    })
  }
  function cancelArcade() {
    const card = arcadeCard; arcadeCard = null
    talus.ui.set('arcadeCards', [])
    if (card) card.resolve(false)
  }
  async function turnScoreCard() {
    if (!match.turnNumber || match.lastCardTurn === match.turnNumber) return
    const p = current()
    if (await showArcadeCard('TURN ' + match.turnNumber + ' COMPLETE', p.name,
      'Every crater counts.', 1, p.color, p.kills + ' kills (+' + (p.kills-(p.turnStartKills||0)) + ') · Turn cash +$' + (p.cashEarned-(p.turnStartCash||0)).toFixed(2))) {
      match.lastCardTurn = match.turnNumber; persist()
    }
  }
  // Native frame events drive the sequence clock; CSS animates the authored
  // card at render rate. Simulation and ongoing material effects keep running.
  talus.on('tick.frame', e => {
    const dt = Math.max(0, Number(e.dt) || 0)
    if (walletPopup) {
      walletPopup.remaining -= dt
      if (walletPopup.remaining <= 0 || walletPopup.owner !== match?.roster[match.focusIndex]?.entityId) {
        walletPopup = null; talus.ui.set('walletPopups', [])
      }
    }
    cashFrameTime += dt
    if (cashFrameTime >= .25) {
      cashFrameTime = 0
      const owner = match?.roster[match.focusIndex]?.entityId, amount = cashPopups.get(owner)
      // Only the displayed wallet gets a badge. Other players retain every
      // award in their account/round ledger without cluttering the battlefield.
      if (amount) {
        walletPopup = { owner, amount: amount + (walletPopup?.amount || 0), remaining: 1.5 }
        talus.ui.set('walletPopups', [{ text: '+$' + walletPopup.amount.toFixed(2) }])
      }
      cashPopups.clear()
    }
    const card = arcadeCard
    if (!card) return
    if (!match || match.phase === 'fault') { cancelArcade(); return }
    // Last words own the reading area. Pause/menu interruptions restart a full
    // readable card, rather than completing a hidden transition.
    if (presenting() || talus.sim.paused || shopOpen) {
      if (card.visible) { talus.ui.set('arcadeCards', []); card.visible = false }
      card.elapsed = 0; return
    }
    if (!card.visible) { talus.ui.set('arcadeCards', [card.view]); card.visible = true; return }
    card.elapsed += dt
    if (card.elapsed < card.seconds) return
    arcadeCard = null; talus.ui.set('arcadeCards', [])
    record('arcade-ended', { id: card.view.id, elapsed: card.elapsed })
    persist(); card.resolve(true)
  })
  type SpeechKind = 'shooting' | 'death'
  function dialogueDeck() {
    if (!quipDeck) quipDeck = talus.installed.get('indigo.dialogue') || {
      version: 1, rng: chaosSeed(talus.world.id + ':dialogue'), bags: { shooting: [], death: [] }, last: {} }
    if (quipDeck.version !== 1) throw new Error('Unsupported dialogue deck')
    return quipDeck
  }
  function nextPersonaShout(p: any, type: string): ShoutLine | null {
    const persona = personaCatalog?.personas.find((v: any) => v.id === p.personaId)
    if (!persona) return null
    const pool = talus.factions.pool({ factionId: persona.factionId, type, fallback: 'default' })
    if (pool.status !== 'ready' || !pool.lines.length) return null // Explicit missing-type silence.
    const deck = dialogueDeck()
    deck.personas ||= {}
    const key = persona.id + ':' + type, ids = pool.lines.map(line => line.id)
    const state = deck.personas[key] ||= { rng: chaosSeed(talus.world.id + ':voice:' + key), bag: [], last: null }
    state.bag = state.bag.filter((id: string) => ids.includes(id))
    if (!state.bag.length) {
      state.bag = [...ids]
      for (let i = state.bag.length - 1; i > 0; i--) {
        let x = state.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; state.rng = x >>> 0
        const j = Math.floor((x >>> 0) / 4294967296 * (i + 1))
        ;[state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]]
      }
      if (state.bag.length > 1 && state.bag[state.bag.length - 1] === state.last)
        [state.bag[0], state.bag[state.bag.length - 1]] = [state.bag[state.bag.length - 1], state.bag[0]]
    }
    state.last = state.bag.pop(); talus.installed.set('indigo.dialogue', deck)
    return pool.lines.find(line => line.id === state.last)!
  }
  function nextQuip(kind: SpeechKind) {
    // One installation-wide deck continues across rounds and old-save reloads.
    // A unique world id seeds the first shuffle; terrain seeds never reset it.
    // Dialogue must not consume the combat/death-effect random stream.
    dialogueDeck()
    const pool = quipCatalog[kind], bag: number[] = quipDeck.bags[kind]
    if (!bag.length) {
      for (let i = 0; i < pool.length; i++) bag.push(i)
      for (let i = bag.length - 1; i > 0; i--) {
        let x = quipDeck.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5
        quipDeck.rng = x >>> 0
        const j = Math.floor((x >>> 0) / 4294967296 * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      if (pool[bag[bag.length - 1]].id === quipDeck.last[kind])
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]]
    }
    const line = pool[bag.pop()!]
    quipDeck.last[kind] = line.id; talus.installed.set('indigo.dialogue', quipDeck)
    return line
  }
  function nameplate(p: any) {
    const tank = entity(p)
    if (tank?.isLive) talus.ui.nameplate(tank, { text: p.name, color: p.color, bar: 'health', offsetY: 80, showWhenDead: true })
  }
  function speech(p: any, text: string | null) {
    if (p.personaId) talus.factions.holdSpeech(p.entityId, text !== null)
    const tank = entity(p), cue = match.presentation.active
    const at = tank?.position || (cue?.owner === p.entityId ? { x: cue.x, y: cue.y } : p.lastKnownPosition)
    talus.ui.worldText('speech:' + p.entityId, text === null ? null : {
      entity: tank?.position ? tank : null, ...(at ? { at } : {}), text, offset: { x: 0, y: -110 }, size: 36,
      maxWidth: 720, lineHeight: 1.2, color: '#ffffff', outline: '#151120',
      background: '#151120d9', unavailable: 'retain',
    })
  }
  function say(p: any, kind: SpeechKind) {
    const line = p.personaId ? nextPersonaShout(p, kind === 'shooting' ? 'taunt' : 'death') : nextQuip(kind)
    if (!line) return ''
    const tank = entity(p)
    if (tank?.can('blackboard.set')) tank.blackboard.set('custom.lastQuip', { id: line.id, text: line.text, kind, turn: match.turnNumber })
    speech(p, line.text)
    record('quip', { owner: p.entityId, name: p.name, speechKind: kind, ...line })
    return line.text
  }
  const deathPoseHolds = new Map<string, { liveId: number | null, until: number }>()
  function holdDeathPose(cue: any) {
    if (cue.kind !== 'death' || cue.stage === 'effect' || cue.resumeStage === 'effect') return
    const tank = talus.entities.get(cue.owner)
    if (!tank?.isLive && !tank?.isFrozen) return // Stored hulls already wait in native serialization.
    const previous = deathPoseHolds.get(cue.owner)
    if (previous?.liveId === tank.liveId && previous.until > talus.sim.clock + 10) return
    // Native finite holds survive park/restore. Renew only while the queued
    // presentation still owns the wreck; a stopped script cannot hold forever.
    const held = tank.controller.holdPose(120)
    if (!held.accepted) throw new Error('Native death pose refused for ' + cue.owner + ': ' + held.reason)
    deathPoseHolds.set(cue.owner, { liveId: tank.liveId, until: talus.sim.clock + held.seconds })
    const at = tank.position
    if (at) { cue.x = at.x; cue.y = at.y }
    record('death-pose-held', { owner: cue.owner, seconds: held.seconds })
  }
  function queuePresentation(p: any, kind: SpeechKind, at?: { x: number | null, y: number | null }) {
    const position = at?.x != null && at.y != null ? at : entity(p)?.position || p.lastKnownPosition
    if (!position) throw new Error('No position for ' + p.name + ' last words')
    if (kind === 'death') {
      // Cancel only this tank's unlaunched shot, never another tank's projectile.
      match.presentation.queue = match.presentation.queue.filter((v: any) => v.owner !== p.entityId)
      if (match.presentation.active?.owner === p.entityId) { speech(p, null); match.presentation.active = null }
      if (p === current() && ['telegraph', 'firing'].includes(match.phase) && !match.attack?.rootId) {
        match.phase = 'turn'; match.attack = null; match.pendingTurn = true
      }
    }
    p.lastKnownPosition = { x: Number(position.x), y: Number(position.y) }
    const cue = { owner: p.entityId, kind, ...p.lastKnownPosition, stage: 'centering', started: null, elapsed: 0 }
    match.presentation.queue.push(cue)
    holdDeathPose(cue)
    input(false); persist()
  }
  function tickPresentation() {
    if (talus.sim.paused) return presenting()
    for (const queued of match.presentation.queue) holdDeathPose(queued)
    let cue = match.presentation.active
    if (!cue) {
      cue = match.presentation.queue.shift()
      if (!cue) return false
      const p = match.roster.find((r: any) => r.entityId === cue.owner)
      if (cue.kind === 'shooting' && p.eliminated) return true
      cue.stage = 'centering'; cue.centerStarted = talus.sim.clock; cue.elapsed = 0
      match.presentation.active = cue
      match.message = 'Following ' + p.name
      record('presentation-centering', { owner: p.entityId, speechKind: cue.kind })
    }
    const p = match.roster.find((r: any) => r.entityId === cue.owner), tank = entity(p)
    holdDeathPose(cue)
    const at = tank?.position
    if (at && cue.stage !== 'effect' && cue.resumeStage !== 'effect') { cue.x = at.x; cue.y = at.y }
    const state = cue.kind === 'shooting' || cue.stage === 'centering' && at && cue.resumeStage !== 'effect'
      ? cameraTank(p) : cameraPoint(cue, 'death:' + cue.owner)
    if (cue.stage === 'centering') {
      const bodyReady = cue.kind === 'shooting' ? tank?.isLive : !at || tank?.isLive || tank?.isFrozen
      if (!cameraArrived(state) || !bodyReady) {
        if (talus.sim.clock - cue.centerStarted > 30) throw new Error('Presentation camera did not arrive: ' + p.name + ' / ' + state.reason)
        if (ticks % 6 === 0) persist()
        return true
      }
      record('presentation-centered', { owner: p.entityId, speechKind: cue.kind, x: cue.x, y: cue.y,
        tracking: state.id, center: state.center, ready: state.ready })
      if (cue.resumeStage === 'effect') {
        cue.stage = 'effect'; cue.started = talus.sim.clock - (cue.elapsed || 0)
      } else {
        cue.stage = 'speech'; cue.started = talus.sim.clock; cue.elapsed = 0
        if (cue.text === undefined) cue.text = say(p, cue.kind)
        else speech(p, cue.text)
        match.message = p.name + (cue.kind === 'death' ? ' has a few last words…' : ' takes aim…')
      }
      delete cue.resumeStage
      persist(); publish(); return true
    }
    cue.elapsed = talus.sim.clock - cue.started
    if (cue.stage === 'effect') {
      if (cue.elapsed < (chaosCatalog.deathWatchSeconds ?? 2.5)) { if (ticks % 6 === 0) persist(); return true }
      record('death-watch-ended', { owner: p.entityId, elapsed: cue.elapsed })
      match.presentation.active = null
      persist(); resumeAfterPresentation()
      return true
    }
    if (cue.elapsed < 3) { if (ticks % 6 === 0) persist(); return true }
    speech(p, null)
    record('presentation-ended', { owner: p.entityId, speechKind: cue.kind, elapsed: cue.elapsed })
    if (cue.kind === 'death') {
      if (tank?.isLive || tank?.isFrozen) {
        const released = tank.controller.holdPose(0)
        if (!released.accepted) throw new Error('Native death pose release refused for ' + p.name)
        record('death-pose-released', { owner: p.entityId })
      }
      deathPoseHolds.delete(p.entityId)
      queueChaos(p, at || cue)
      // The native simulation can continue; this finite observation interval
      // alone retains presentation ownership before the next tank's turn.
      cue.stage = 'effect'; cue.started = talus.sim.clock; cue.elapsed = 0
      record('death-watch-started', { owner: p.entityId, seconds: chaosCatalog.deathWatchSeconds ?? 2.5 })
    }
    else { match.presentation.active = null; if (!p.eliminated) performAttack(p) }
    persist(); resumeAfterPresentation()
    return true
  }
  function resumeAfterPresentation() {
    if (!presenting() && match.phase === 'turn' && match.pendingTurn === null) {
      match.phase = 'refocusing'; match.message = 'Returning to ' + current().name
      input(false); persist(); publish()
      run(resumeCurrentTurn)
    }
  }
  async function resumeCurrentTurn() {
    const p = current(), turn = match.turnNumber
    const ready = await focus()
    if (match.phase !== 'refocusing' || current() !== p || match.turnNumber !== turn) return
    match.phase = 'turn'; match.message = p.control === 'human' ? 'Position, aim and fire' : 'Computer is choosing its shot'
    persist(); publish()
    if (!ready || p.eliminated) { run(() => beginTurn(true)); return }
    input(p.control === 'human')
    if (p.control === 'cpu') run(() => prepareCpuTurn(p, turn))
  }
  async function restoreFocusAfterBoot() {
    if (match.phase === 'refocusing') { await resumeCurrentTurn(); return }
    const phase = match.phase
    const pendingDrop = match.supplies?.crates.find((c: any) => c.id === match.supplies.active)
    if (phase === 'focusing' && pendingDrop && supplyCatalog) await watchSupply(pendingDrop)
    const ready = await focus()
    if (match.phase !== phase) return
    if (phase === 'ready') {
      // A pre-round casualty must not silently press Begin for the player.
      if (!ready) {
        const survivor = match.roster.findIndex((p: any) => !p.eliminated)
        if (survivor >= 0 && survivor !== match.focusIndex) {
          match.focusIndex = survivor; persist(); await restoreFocusAfterBoot(); return
        }
      }
      openShop(); return
    }
    if (!ready) { match.phase = 'turn'; run(() => beginTurn(true)); return }
    if (phase === 'focusing') startTurn()
  }
  function input(enabled: boolean) {
    enabled = enabled && !exitDrain
    for (const p of talus.players.list()) p.inputEnabled = enabled && p.slot === 0
    if (!enabled) {
      utilityGeneration++; if (digging) talus.world.cancelTerrainWork()
      for (const p of match?.roster || []) {
        const e = p.entityId ? entity(p) : null
        if (e?.isLive && e.controller.state?.enabled) e.controller.levitate(false)
        if (e?.isLive && e.controller.groundDrive) e.controller.drive(0)
      }
    }
  }
  function sequencePending() {
    return !!(match && (supplySequence || arcadeCard || match.attack || presenting() || match.chaos.jobs.length || launchingChaos || digging
      || ['deploying', 'telegraph', 'firing', 'flight', 'settling', 'focusing', 'refocusing', 'positioning', 'aftermath'].includes(match.phase)))
  }
  function updateExitView() {
    const status = talus.game.saveStatus
    const blocked = !status.allowed || sequencePending() || booting
    const waiting = exitDrain?.phase === 'running' || exitDrain?.phase === 'closing'
    const stalled = match?.roster[match.focusIndex]?.cpuStalled
    const message = exitDrain?.phase === 'failed'
      ? 'The action could not finish. Return to battle to inspect it; your save has not been replaced.'
      : waiting ? 'Finishing the current action. New shots will wait. Resume battle cancels exit preparation.'
      : exitDrain?.phase === 'ready' ? 'Action complete. Your battle is paused and ready to save.'
      : blocked ? 'A shot, death effect or terrain job is still running. Finish the action before saving or leaving.'
      : stalled ? 'CPU blocked: ' + stalled.reason + '. Resume battle retries its available actions; you can also save and leave.'
      : 'The battlefield can wait. Leaving will save your progress.'
    const view = JSON.stringify({ exitBlocked: blocked, exitDraining: !!exitDrain, exitStatus: message,
      exitFinishLabel: waiting ? 'Resume finishing action' : 'Finish action, then pause' })
    if (view !== exitView) { exitView = view; talus.ui.set(JSON.parse(view)) }
  }
  function prepareExitBoundary() {
    if (!match || exitDrain?.phase === 'ready') return
    // The button uses the native resume verb. Its close event arrives after
    // the page has dismissed the pause overlay, avoiding private pause hooks.
    exitDrain = { phase: 'closing', elapsed: 0 }
    input(false); updateExitView()
  }
  function resumeAfterExitPreparation() {
    // The explicit simulation pause survives save/reload; the transient drain
    // does not. Resume must also release that saved pause. Only restart CPU
    // planning when this session inhibited it; boot already starts resumed work.
    const inhibited = !!exitDrain
    exitDrain = null; talus.sim.resume(); updateExitView()
    if (inhibited && active()) {
      input(current().control === 'human')
      if (current().control === 'cpu') run(() => prepareCpuTurn(current(), match.turnNumber))
    }
  }
  function exitMenuClosed(e: { file: string, reason: string }) {
    if (e.file !== 'Menus/pause.html' || !exitDrain) return
    if (exitDrain.phase === 'closing') {
      exitDrain.phase = 'running'
      // An explicit P-pause can predate the menu. This user-selected action
      // explicitly authorizes resuming it; later pauses remain respected.
      talus.sim.resume()
    } else if (['back', 'close', 'script'].includes(e.reason)) resumeAfterExitPreparation()
  }
  function tickExitPreparation(dt: number) {
    updateExitView()
    if (exitDrain?.phase !== 'running') return
    if (talus.sim.paused) return // Never fight a new user pause or native dialog.
    exitDrain.elapsed += Math.max(0, dt)
    if (match?.phase === 'fault' || exitDrain.elapsed > 180) {
      exitDrain.phase = 'failed'; talus.sim.pause(); updateExitView()
      talus.ui.openMenu('Menus/pause.html'); return
    }
    if (!booted || booting || sequencePending() || !talus.game.saveStatus.allowed) return
    // Freeze only after all native AND script barriers clear. Do not clear
    // somebody else's barrier, cancel paid projectiles, or serialize a volley.
    exitDrain.phase = 'ready'; talus.sim.pause(); updateExitView()
    talus.ui.openMenu('Menus/pause.html')
  }
  talus.on('tick.frame', e => tickExitPreparation(Number(e.dt) || 0))
  talus.on('menu.pause.finish-action', prepareExitBoundary)
  talus.on('menu.custom.finish-action', prepareExitBoundary)
  talus.on('menu.pause.cancel-exit', resumeAfterExitPreparation)
  talus.on('menu.custom.cancel-exit', resumeAfterExitPreparation)
  talus.on('menu.pause.resume', resumeAfterExitPreparation)
  talus.on('menu.custom.resume', resumeAfterExitPreparation)
  talus.on('menu.closed', exitMenuClosed)
  function persist() {
    // Native flights/jobs hold their own save barriers. This one covers the
    // gaps between children and the authored presentation/effect queues.
    const pending = sequencePending()
    talus.game.setSaveBarrier('match-sequence', pending ? 'Finish deployment, volley and death effects before saving' : null)
    talus.state.setJson('indigo.match', match)
  }
  function record(kind: string, detail: any = {}) {
    const rows: any = talus.state.getJson('indigo.events') || []
    const sound = ({turn:'turn','fire-request':'fire','chaos-started':'death',finished:'victory',purchase:'buy'} as Record<string,string>)[kind]
    if(soundCatalog?.[sound])talus.audio.play({sfxId:soundCatalog[sound],volume:kind==='fire-request'?.4:.25,throttleKey:'terra-'+sound,maxPerSecond:4})
    rows.push({ ...detail, kind, turn: match?.turnNumber, clock: talus.sim.clock })
    talus.state.setJson('indigo.events', rows.slice(-600)); talus.log(kind, detail)
  }
  const playerKey = (p: any) => p.name.toLowerCase()
  const wallet = (p: any) => Object.hasOwn(bank.players, playerKey(p)) ? bank.players[playerKey(p)] : undefined
  const itemById = (id: string) => market.items.find((i: any) => i.id === id)
  const unlimited = (id: string) => id === 'standard' || itemById(id)?.unlimited === true
  const owned = (p: any, id: string) => unlimited(id) ? Infinity : Number(wallet(p).stock[id] || 0)
  function saveBank() { talus.installed.set('indigo.economy', bank) }
  function ensureWallets() {
    bank = talus.installed.get('indigo.economy') || { version: 1, players: {}, rounds: {}, cpuShops: {} }
    if (bank.version !== 1) throw new Error('Unsupported armory save')
    for (const p of match.roster) if (!wallet(p)) bank.players = { ...bank.players, [playerKey(p)]: {
      name: p.name, cash: market.startingCash, earned: 0, spent: 0, stock: {}, selected: 'standard', revision: 0 } }
    saveBank()
  }
  function reward(p: any, action: string, units = 1) {
    if (!p || !match || ['ready', 'deploying', 'finished', 'fault'].includes(match.phase)) return
    const amount = Math.max(0, Math.round(Number(market.awards[action] || 0) * units))
    if (!amount) return
    p.cashEarned += amount; p.cashBreakdown[action] = (p.cashBreakdown[action] || 0) + amount
    match.cashNotice = p.name + ' +$' + amount + ' · ' + action
    if (p.entityId) cashPopups.set(p.entityId, (cashPopups.get(p.entityId) || 0) + amount)
    record('cash', { name: p.name, action, amount, total: p.cashEarned })
  }
  function settleWallets() {
    // One installed-state write commits every player's payout and its receipt.
    // Reopening an old result cannot pay the same world a second time.
    if (bank.rounds[talus.world.id]) return
    const paid: any = Object.create(null)
    for (const p of match.roster) {
      const w = wallet(p); w.cash += p.cashEarned; w.earned += p.cashEarned; w.revision++
      paid[playerKey(p)] = p.cashEarned
    }
    bank.rounds[talus.world.id] = { paid, seed: match.seed, round: match.round }
    saveBank(); record('cash-settled', { paid })
  }
  // The installed stock is total unused supply, including energy in a live
  // component. Reconcile restored bodies against that balance before arming.
  // Native consumption is the only source of a debit; no wall-clock estimate.
  function tankUtilityLedger(p: any): { supplySeen?: SupplyReading, autoDefenseChecked?: boolean } {
    // Keep the observation and its stock debit in the same installed write.
    // Durable entity IDs survive parking; world IDs separate successive rounds.
    bank.tankUtilities ||= {}
    const world = bank.tankUtilities[talus.world.id] ||= {}
    return world[p.entityId] ||= {}
  }
  function rememberSupply(p: any, now: SupplyReading): boolean {
    const ledger = tankUtilityLedger(p), before = ledger.supplySeen
    if (before && (Object.keys(now) as Array<keyof SupplyReading>).every(key => before[key] === now[key])) return false
    ledger.supplySeen = now
    return true
  }
  function readSupply(p: any) {
    const e = entity(p), state = e.controller.state, defense = e.defenses.state
    return { jet: state?.fuel || 0, shield: defense?.shield?.remaining || 0,
      magnet: defense?.deflector?.remaining || 0, groundSpent: e.controller.groundDrive?.spent || 0 }
  }
  function accountSupply(p: any) {
    if (!bank || !p.entityId || !entity(p)?.isLive) return
    const now = readSupply(p), before = tankUtilityLedger(p).supplySeen
    let changed = false
    if (before) {
      for (const [key, id, rate] of [['jet','jetpack',1],['shield','shield',itemById('shield').charge],['magnet','magnet',itemById('magnet').charge]] as const) {
        const spent = Math.max(0, before[key] - now[key]) / Number(rate)
        if (spent > 1e-9) { wallet(p).stock[id] = Math.max(0, owned(p,id) - spent); changed = true }
      }
      const groundSpent = Math.max(0, now.groundSpent - before.groundSpent)
      if (groundSpent > 1e-9) { wallet(p).stock['fuel-tank'] = Math.max(0, owned(p,'fuel-tank') - groundSpent); changed = true }
      if (changed) wallet(p).revision++
    }
    const observed = rememberSupply(p, now)
    if (changed || observed) saveBank()
  }
  function syncUtilities(p: any) {
    const e = entity(p); if (!e?.isLive || !e.alive) return
    accountSupply(p)
    const jet = itemById('jetpack'), c = e.controller.state
    if (jet.enabled && c?.enabled && c.capacity !== null && c.fuel !== null) {
      const target = Math.min(c.capacity, owned(p,'jetpack'))
      if (target > c.fuel + 1e-9) e.controller.addFuel(target - c.fuel)
      else if (target < c.fuel - 1e-9) e.controller.removeFuel(c.fuel - target)
    }
    const ground = itemById('fuel-tank')
    if (ground.enabled) {
      let state = e.controller.groundDrive
      if (!state) {
        const configured = e.controller.configureGroundDrive(ground.controller)
        if (!configured.accepted) throw new Error('ground drive: ' + configured.reason)
        state = e.controller.groundDrive!
      }
      const target = Math.min(state.config.capacity, owned(p,'fuel-tank'))
      if (target > state.fuel + 1e-9) e.controller.addGroundFuel(target-state.fuel)
      else if (target < state.fuel - 1e-9) e.controller.removeGroundFuel(state.fuel-target)
    }
    const chute = itemById('parachute')
    if (chute.enabled) {
      let state = e.controller.fallBrake
      if (!state) {
        const receipt = e.controller.configureFallBrake(chute.controller)
        if (!receipt.accepted) throw new Error('parachute: ' + receipt.reason)
        state = e.controller.fallBrake!
      }
      const target = Math.min(state.config.capacity, Math.floor(owned(p,'parachute')))
      if (target > state.charges) e.controller.chargeFallBrake(target-state.charges)
      else if (target < state.charges) e.controller.removeFallBrakeCharges(state.charges-target)
    }
    for (const [id, kind] of [['shield','shield'],['magnet','deflector']] as const) {
      const item = itemById(id); if (!item.enabled) continue
      let component = e.defenses.state?.[kind]
      if (!component) {
        const settings = { ...item.field }
        if (kind === 'deflector') settings.elements = item.materialNames.map((name: string) => talus.elements.get(name)?.id).filter((id: any) => id !== undefined)
        const configured = e.defenses.configure(kind, settings)
        if (!configured.accepted) throw new Error(id + ': ' + configured.reason)
        component = e.defenses.state![kind]!
      }
      const target = Math.min(component.spec.capacity, owned(p,id) * item.charge)
      if (target > component.remaining + 1e-9) e.defenses.charge(kind, target - component.remaining)
      else if (target < component.remaining - 1e-9) e.defenses.discharge(kind, component.remaining - target)
    }
    if (rememberSupply(p, readSupply(p))) saveBank()
  }
  function useDefense(p: any, id: 'shield' | 'magnet') {
    if (!active() || p !== current() || p.eliminated || !itemById(id).enabled) return false
    syncUtilities(p)
    const e=entity(p), kind=id==='shield'?'shield':'deflector', state=e.defenses.state?.[kind]
    if (!state) return false
    const receipt=e.defenses.activate(kind,!state.active)
    if (receipt.accepted) { record('utility',{name:p.name,item:id,active:!state.active,remaining:state.remaining}); persist();publish() }
    return receipt.accepted
  }
  function useParachute(p: any) {
    const item = itemById('parachute'), e = entity(p)
    if (!item.enabled || p.eliminated || !e?.isLive || !e.alive || !bank || owned(p,'parachute')<1) return false
    syncUtilities(p)
    const receipt = e.controller.deployFallBrake(true)
    if (!receipt.accepted) return false
    if (receipt.consumed) {
      wallet(p).stock.parachute = Math.max(0, owned(p,'parachute')-receipt.consumed)
      wallet(p).revision++; saveBank()
      record('utility',{name:p.name,item:'parachute',receipt,state:e.controller.fallBrake})
      persist(); publish()
    }
    return true
  }
  async function dig(p: any, direction: number) {
    const item=itemById('digger'), fuel=owned(p,'digger')
    if (!active() || p!==current() || p.eliminated || !item.enabled || fuel<=0 || !direction || digging || talus.sim.clock<nextDigAt) return
    const e=entity(p), at=e.position; if(!e.isLive || !at)return
    const tool=item.tool, maxHard=Math.max(...tool.materials.map((m:any)=>m.hardness))
    const width=Math.min(tool.width,Math.floor(fuel*tool.workPerSecond/(tool.height*maxHard)))
    if(width<1)return
    const x=Math.floor(direction>0?at.x+arena.combat.tankHalfWidth:at.x-arena.combat.tankHalfWidth-width)
    const y=Math.floor(at.y-tool.height/2), shape={x,y,w:width,h:tool.height}
    digging=true;nextDigAt=talus.sim.clock+tool.interval
    try {
      const receipt=await talus.world.terrainWork({kind:'excavate',shape,
        bounds:{...arena.bounds,h:arena.terrain.solidBottomTileRow*arena.tiles.chunksPerTile*64},
        replacement:'eligible',materials:tool.materials.map((m:any)=>({element:talus.elements.get(m.name)!.id,hardness:m.hardness})),
        budget:{cells:width*tool.height,particles:width*tool.height,work:Math.min(fuel,tool.interval)*tool.workPerSecond},actor:{entity:e,reach:tool.reach}})
      if(receipt.status==='completed' && receipt.work>0) {
        const spent=receipt.work/tool.workPerSecond;wallet(p).stock.digger=Math.max(0,owned(p,'digger')-spent);wallet(p).revision++;saveBank()
        record('utility',{name:p.name,item:'digger',seconds:spent,remaining:owned(p,'digger'),receipt})
      } else if(receipt.status==='refused') record('dig-refused',{name:p.name,receipt})
    } finally {digging=false}
  }
  function driveTank(p:any, velocity:number) {
    const e=entity(p), s=e.snapshot(); if(!e.isLive||!s)return
    const requested=movementVelocity(s.x,velocity,1/60)
    if(itemById('fuel-tank').enabled) {
      const state=e.controller.groundDrive
      if(state)e.controller.drive(clamp(requested/state.config.speed,-1,1))
    } else e.setVelocity(requested,s.vy)
  }
  function personaFor(p: any) {
    return personaCatalog?.personas.find((v: any) => v.id === p.personaId) || personaCatalog?.personas[0]
  }
  function doctrine(p: any) {
    const profile = personaFor(p)?.strategy || { risk: .5, saveFraction: .2, weaponPreferences: ['heavy', 'standard'],
      utilityPreferences: ['battery'], impactMemory: 2, candidateBudget: 24, angleErrorDegrees: 2, powerErrorPercent: 3 }
    const skill = personaCatalog?.personas.find((v: any) => v.skill === match?.cpuSkill)?.strategy
    return skill ? { ...profile, ...Object.fromEntries(['impactMemory', 'candidateBudget', 'angleErrorDegrees', 'powerErrorPercent'].map(k => [k, skill[k]])) } : profile
  }
  function aiRandom(p: any) {
    // Combat decisions never draw from terrain, dialogue or death-effect RNG.
    let x = p.aiRng || chaosSeed(String(match.seed) + ':ai:' + p.index)
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    p.aiRng = x >>> 0; return p.aiRng / 4294967296
  }
  function targetSnapshot(p: any): EntitySnapshot | null {
    if (!p?.entityId || p.eliminated) return null
    const state = entity(p)?.snapshot()
    return state && state.alive !== false && Number.isFinite(state.x) && Number.isFinite(state.y) ? state : null
  }
  function targetReference(p: any, at: Vec2, terrain = false) {
    // Native E53 shares this durable identity with the behavior graph. Do not
    // cache numeric roots: normal park/restore changes them.
    return { x: at.x, y: at.y, entityId: terrain ? null : p.entityId, bodyId: null }
  }
  function selectTarget(p: any, id: string) {
    const target = match.roster.find((r: any) => r.entityId === id && r !== p && !r.eliminated)
    const at = targetSnapshot(target)
    if (!at) return false
    p.targetId = id
    entity(p).blackboard.set('custom.indigoTarget', targetReference(target, at))
    persist(); publish(); return true
  }
  function cpuWeaponUnavailable(item: any): string | null {
    if (!item?.enabled || item.kind !== 'weapon') return 'unavailable-item'
    if (item.id === 'escape-charge') return 'local-terrain-tactic'
    const s = item.projectile
    if (!s || s.kind !== 'rigid-body') return 'native-forecast-non-rigid'
    if (s.homing || item.behavior?.mode === 'homing') return 'native-forecast-homing'
    if (s.bouncing) return 'native-forecast-bouncing'
    if (s.spread || s.projectilesPerShot > 1) return 'native-forecast-multicast'
    if (!(s.speed > 0)) return 'native-forecast-stationary-cast'
    return null
  }
  async function planCpuShot(p: any, turn: number): Promise<boolean> {
    const tank = entity(p), token = utilityGeneration, d = doctrine(p)
    const valid = () => active() && current() === p && !p.eliminated && match.turnNumber === turn && token === utilityGeneration
    const origin = tank.position!, trials: any[] = [], blocked: { target: any, at: BallisticObstruction }[] = []
    const snapshots = new Map<string, EntitySnapshot>()
    const targets = match.roster.filter((r: any) => {
      const at = r !== p ? targetSnapshot(r) : null
      if (at) snapshots.set(r.entityId, at)
      return !!at
    })
    const snapshot = (r: any) => snapshots.get(r.entityId)!
    const distance = (r: any) => Math.hypot(snapshot(r).x - origin.x, snapshot(r).y - origin.y)
    const cluster = (r: any) => targets.filter((v: any) => v !== r && Math.hypot(snapshot(v).x - snapshot(r).x, snapshot(v).y - snapshot(r).y) < 200).length
    targets.sort((a: any, b: any) => (distance(a) + (snapshot(a).health ?? 100) * 2 - cluster(a) * (p.personaId === 'domino' ? 180 : 30))
      - (distance(b) + (snapshot(b).health ?? 100) * 2 - cluster(b) * (p.personaId === 'domino' ? 180 : 30)))
    if (!targets.length) return false
    if ((tank.health ?? 100) <= 70) useBattery(p)
    syncLoadout(p)
    let budget = d.candidateBudget
    const angleError = (aiRandom(p) * 2 - 1) * d.angleErrorDegrees * Math.PI / 180
    const powerError = (aiRandom(p) * 2 - 1) * d.powerErrorPercent / 100
    const ownedWeapons = market.items.filter((i: any) => i.enabled && i.kind === 'weapon' && owned(p, i.id) > 0)
    const skipped = ownedWeapons.map((item: any) => ({ item: item.id, reason: cpuWeaponUnavailable(item) })).filter((v: any) => v.reason)
    // Capability filtering precedes ranking. A paid but unsupported forecast
    // cannot occupy a shortlist slot and hide a usable third/fourth weapon.
    const weapons = ownedWeapons.filter((item: any) => !cpuWeaponUnavailable(item))
    const ranked = (target: any) => weapons.map((item: any) => {
      const pref = d.weaponPreferences.indexOf(item.id), radius = item.projectile?.aoeRadius || 0
      const collateral = Math.max(0, radius + 50 - distance(target)) * (1 - d.risk) * 3
      const previous = (p.impacts || []).filter((m: any) => m.weapon === item.id && m.targetId === target.entityId
        && m.turn >= turn - match.roster.length * 2 && Math.hypot(m.origin.x - origin.x, m.origin.y - origin.y) < 48).at(-1)
      // A recent miss changes tactics; it must not permanently mothball paid
      // inventory or penalize a shot at an entirely different opponent.
      const ineffective = previous && p.damage - (previous.damageBefore || 0) < 12 ? 30 : 0
      const closeRapid = item.id === 'machine-gun' && distance(target) < 400 ? 80 : 0
      const benefit = (item.projectile?.damage || item.behavior?.childDamage || 0) * .25 + cluster(target) * radius * .15
      const paid = item.id !== 'standard' ? 80 : 0
      return { item, score: (pref >= 0 ? 140 - pref * 25 : -80) + paid + benefit + closeRapid - collateral - ineffective }
    }).sort((a: any, b: any) => b.score - a.score)
    const candidateTargets = targets.slice(0, 2)
    const corridors = candidateTargets.map((target: any) => {
      const at = snapshot(target), from = { x: origin.x + Math.sign(at.x - origin.x) * 40, y: origin.y - 12 }
      return { target, obstruction: talus.world.raycast(from, at) }
    })
    // Keep some of the same total work budget for an intentional terrain hit
    // if the target corridors are blocked. This is native re-planning, not an
    // invented trajectory or a claim that a rejected shot will reach a tank.
    const reserve = corridors.some((c: any) => c.obstruction && c.obstruction.entity?.id !== c.target.entityId)
      ? Math.max(2, Math.floor(budget / 4)) : 0
    let attackBudget = budget - reserve
    const dragProbes: { target: any, item: any, point: Vec2, owner: EntitySnapshot, targetPose: EntitySnapshot,
      plan: BallisticPlan, candidate: BallisticPlan['candidates'][number], score: number }[] = []
    let dragProbeInvalidated = false
    const accept = (target: any, item: any, point: Vec2, plan: BallisticPlan, tactic: string, terrain: boolean, memory: number) => {
      p.weaponId = item.id; wallet(p).selected = item.id; wallet(p).revision++; saveBank()
      p.targetId = target.entityId; p.plannedTurn = turn; p.tactic = tactic
      tank.blackboard.set('custom.indigoTarget', targetReference(target, point, terrain))
      tank.blackboard.set('custom.aimPlan', JSON.parse(JSON.stringify(plan))); tank.blackboard.set('custom.aimRefusal', null)
      tank.blackboard.set('custom.aimAngle', plan.solution!.angle); tank.blackboard.set('custom.aimPower', plan.solution!.power)
      tank.blackboard.set('custom.decisionTurn', turn)
      tank.blackboard.set('custom.aiDecision', { turn, persona: p.personaId, skill: match.cpuSkill === 'persona' ? personaFor(p)?.skill : match.cpuSkill || personaFor(p)?.skill,
        tactic, target: p.targetId, item: item.id, budgetRemaining: budget, trials, skipped, risk: d.risk, memory })
      persist(); publish(); record('cpu-decision', tank.blackboard.get('custom.aiDecision')); return true
    }
    const survey = async (target: any, item: any, request: BallisticPlanRequest, goal: string) => {
      tank.weapon.equip(item.template)
      const ownerPose = tank.snapshot(), targetPose = targetSnapshot(target), equipped = tank.weapon.state?.equipped
      const plan = await tank.weapon.plan(request)
      while (valid() && talus.sim.paused) await talus.sleepTicks(1)
      if (!valid() || !targetSnapshot(target)) return null
      budget -= Math.max(1, plan.work.candidates)
      trials.push({ weapon: item.id, target: target.name, goal, reason: plan.reason, work: plan.work, warnings: plan.warnings, obstruction: plan.obstruction })
      if (plan.status !== 'clear' && plan.obstruction?.kind === 'terrain') blocked.push({ target, at: plan.obstruction })
      // A liquid/powder drag uncertainty is different from unavailable world
      // geometry, a cancelled survey or exhausted work. Never guess around
      // those hard refusals, even if an earlier survey proposed a fluid arc.
      if (plan.status !== 'clear' && !['material-drag-not-supported', 'obstructed', 'unreachable', 'deflection-fields'].includes(plan.reason))
        dragProbeInvalidated = true
      if (goal === 'tank' && plan.status === 'refused' && plan.solution === null && plan.reason === 'material-drag-not-supported'
        && ownerPose?.residency === 'live' && targetPose && equipped === item.template) {
        const candidates = (Array.isArray(plan.candidates) ? plan.candidates : []).filter(candidate => {
          if (!candidate || typeof candidate !== 'object') return false
          const at = candidate.obstruction
          return candidate.reason === 'material-drag-not-supported' && at?.kind === 'unknown'
            && at.reason === 'material-drag-not-supported' && [candidate.angle, candidate.power, at.x, at.y, at.time].every(Number.isFinite)
            && Math.abs(candidate.angle) <= Math.PI * 2 && candidate.power >= 0 && candidate.power <= 1 && at.time >= 0 && at.time <= 30
        }).sort((a, b) => Math.hypot(a.obstruction!.x - request.target.x, a.obstruction!.y - request.target.y)
          - Math.hypot(b.obstruction!.x - request.target.x, b.obstruction!.y - request.target.y))
        const candidate = candidates[0]
        if (candidate) dragProbes.push({ target, item, point: { ...request.target }, owner: ownerPose, targetPose, plan, candidate,
          score: Math.hypot(candidate.obstruction!.x - request.target.x, candidate.obstruction!.y - request.target.y)
            / Math.max(1, Math.hypot(ownerPose.x - request.target.x, ownerPose.y - request.target.y)) })
      }
      return plan
    }
    surveyTargets: for (let targetIndex = 0; targetIndex < candidateTargets.length; targetIndex++) {
      const target = candidateTargets[targetIndex]
      const options = ranked(target).map((v: any) => v.item)
      // All supported inventory is ranked. Within a small skill budget reserve
      // a fallback cannon request, instead of spending everything on one gun.
      const maximum = Math.max(2, Math.floor(attackBudget / Math.max(1, candidateTargets.length - targetIndex)))
      const selected = options.slice(0, maximum)
      if (!selected.some((i: any) => i.id === 'standard')) {
        if (selected.length >= maximum) selected.pop()
        selected.push(itemById('standard'))
      }
      for (let optionIndex = 0; optionIndex < selected.length; optionIndex++) {
        const item = selected[optionIndex]
        if (!valid()) return false
        if (attackBudget < 1) break surveyTargets
        const spec = item.projectile, at = targetSnapshot(target), carrier = item.behavior?.mode === 'apex'
        if (!at) continue surveyTargets
        let point = { x: at.x, y: at.y }, support = false
        if ((['mole', 'faultline'].includes(p.personaId) || spec.damage === 0) && (spec.carveRadius > 60 || item.behavior?.operation === 'fracture')) {
          const x = at.x + (origin.x < at.x ? -24 : 24), y = talus.world.groundY(x, at.y + 8, 36)
          if (y !== null) { point = { x, y: y - 2 }; support = true }
        }
        if (!support && !carrier && spec.damage === 0 && (spec.carveRadius > 0 || item.behavior?.operation === 'fracture')) continue
        const memory = (p.impacts || []).filter((m: any) => m.targetId === target.entityId && m.weapon === item.id
          && Math.hypot(m.origin.x - origin.x, m.origin.y - origin.y) < 48 && Math.hypot(m.target.x - at.x, m.target.y - at.y) < 48).slice(-d.impactMemory)
        const last = memory[memory.length - 1]
        if (!support && !carrier && last && Math.abs(last.dx) < 128 && Math.abs(last.dy) < 96)
          point.x -= clamp(memory.reduce((sum: number, m: any) => sum + m.dx, 0) / memory.length * .35, -40, 40)
        const obstruction = corridors[targetIndex].obstruction
        const high = carrier || at.y < origin.y - 48 || !!(obstruction && obstruction.entity?.id !== target.entityId) || !!(last && Math.abs(last.dx) >= 128)
        const remaining = selected.length - optionIndex + (candidateTargets.length - targetIndex - 1) * selected.length
        const allowance = Math.max(1, Math.floor(attackBudget / remaining))
        const request: BallisticPlanRequest = { target: point, ...(support ? {} : { targetEntityId: target.entityId }),
          goal: carrier ? 'apex' : 'impact', preferHighArc: high, minElevation: 5, maxElevation: 89,
          angleStep: clamp(Math.ceil(84 / allowance), 2, 30), maxCandidates: allowance,
          maxSteps: 500000, maxCells: 1000000, terrain: 'materialize', tolerance: support ? 18 : Math.min(80, 28 + d.angleErrorDegrees * 8),
          ...(spec.speedAtMinPower === spec.speed ? { fixedAngle: Math.atan2(point.y - origin.y, point.x - origin.x) } : {}),
          angleOffset: angleError, powerOffset: powerError }
        const plan = await survey(target, item, request, support ? 'support' : carrier ? 'apex' : 'tank')
        if (!plan) return false
        attackBudget -= Math.max(1, plan.work.candidates)
        if (plan.status !== 'clear' || !plan.solution) continue
        return accept(target, item, point, plan, support ? 'Remove observed support' : carrier ? 'Clear carrier to apex'
          : cluster(target) && p.personaId === 'domino' ? 'Cluster / chain opportunity' : high ? 'High arc over obstruction'
          : last ? 'Observed-miss correction' : 'Surveyed firing corridor', support, memory.length)
      }
    }
    // Intentional demolition is useful even when no enemy is directly hittable.
    // The obstruction came from the native sweep, and the new sweep must agree
    // that the terrain point itself is reachable. Unknown fields/bodies refuse.
    const demolition = ranked(targets[0]).map((v: any) => v.item).filter((item: any) => item.projectile.carveRadius >= 24 || item.behavior?.operation === 'fracture')
    for (const obstruction of [...blocked]) for (const item of demolition) {
      if (!valid()) return false
      if (budget < 1) break
      const point = { x: obstruction.at.x, y: obstruction.at.y }, separation = Math.hypot(point.x - origin.x, point.y - origin.y)
      const danger = item.projectile.damage > 0 ? (item.projectile.aoeRadius || 0) * (1 - d.risk * .45) + 40 : 36
      if (separation < danger || point.y >= arena.terrain.solidBottomTileRow * arena.tiles.chunksPerTile * 64) continue
      const allowance = Math.min(budget, Math.max(2, Math.floor(d.candidateBudget / 4)))
      const plan = await survey(obstruction.target, item, { target: point, goal: 'impact', preferHighArc: true,
        minElevation: 5, maxElevation: 89, angleStep: clamp(Math.ceil(84 / allowance), 2, 30), maxCandidates: allowance,
        maxSteps: 500000, maxCells: 1000000, terrain: 'materialize', tolerance: 18,
        angleOffset: angleError, powerOffset: powerError }, 'demolition')
      if (!plan) return false
      if (plan.status === 'clear' && plan.solution)
        return accept(obstruction.target, item, point, plan, 'Open an observed firing lane', true, 0)
    }
    if (valid()) {
      syncLoadout(p)
      // All clear impact/support/demolition plans had priority. These are the
      // native planner's feasible angle/power pairs, not a script trajectory or
      // a claim of clearance beyond the first drag-affected material.
      if (!dragProbeInvalidated) for (const probe of dragProbes.sort((a, b) => a.score - b.score)) {
        const now = tank.snapshot(), target = targetSnapshot(probe.target), before = probe.owner
        if (!valid() || !tank.isLive || !now || !target || now.liveId !== before.liveId
          || Math.hypot(now.x - before.x, now.y - before.y) > 1
          || Math.abs(Math.atan2(Math.sin(now.angle - before.angle), Math.cos(now.angle - before.angle))) > .01
          || Math.hypot(now.vx - before.vx, now.vy - before.vy) > 1
          || Math.hypot(target.x - probe.targetPose.x, target.y - probe.targetPose.y) > 4
          || owned(p, probe.item.id) <= 0) continue
        if (!tank.weapon.equip(probe.item.template) || tank.weapon.state?.equipped !== probe.item.template) continue
        p.weaponId = probe.item.id; wallet(p).selected = probe.item.id; wallet(p).revision++; saveBank()
        p.targetId = probe.target.entityId; p.plannedTurn = turn; p.tactic = 'Exploratory native arc · liquid drag uncertain'
        tank.blackboard.set('custom.indigoTarget', targetReference(probe.target, probe.point))
        tank.blackboard.set('custom.aimAngle', probe.candidate.angle); tank.blackboard.set('custom.aimPower', probe.candidate.power)
        tank.blackboard.set('custom.decisionTurn', turn)
        tank.blackboard.set('custom.aimPlan', JSON.parse(JSON.stringify(probe.plan)))
        tank.blackboard.set('custom.aimRefusal', 'material-drag-not-supported')
        tank.blackboard.set('custom.aiDecision', { turn, status: 'uncertain', reason: 'material-drag-not-supported',
          tactic: p.tactic, target: p.targetId, item: probe.item.id, candidate: JSON.parse(JSON.stringify(probe.candidate)),
          budgetRemaining: budget, trials, skipped })
        record('cpu-drag-probe', { name: p.name, decision: tank.blackboard.get('custom.aiDecision') })
        persist(); publish(); return true
      }
      if (trials.some(t => t.reason === 'deflection-fields')) {
        const target = targets.find((r: any) => targetSnapshot(r)), at = targetSnapshot(target), trial = p.fieldProbeCount || 0
        if (!at) return false
        p.fieldProbeCount = trial + 1; p.targetId = target.entityId; p.weaponId = 'standard'; p.plannedTurn = turn
        wallet(p).selected = 'standard'; wallet(p).revision++; saveBank(); tank.weapon.equip(itemById('standard').template)
        const powers = [.25, .4, .55, .7, .85], elevation = trial % 2 ? 72 : 83
        tank.blackboard.set('custom.indigoTarget', targetReference(target, at))
        tank.blackboard.set('custom.aimAngle', -(at.x < origin.x ? 180 - elevation : elevation) * Math.PI / 180)
        tank.blackboard.set('custom.aimPower', powers[trial % powers.length]); tank.blackboard.set('custom.decisionTurn', turn)
        tank.blackboard.set('custom.aimPlan', null); tank.blackboard.set('custom.aimRefusal', 'deflection-fields')
        p.tactic = 'Exploratory high arc through magnetic field'
        record('cpu-field-probe', { name: p.name, trial, trials, skipped }); persist(); publish(); return true
      }
      tank.blackboard.set('custom.aiDecision', { turn, status: 'refused', trials, skipped, budgetRemaining: budget })
      record('cpu-decision-refused', { name: p.name, trials, skipped })
    }
    return false
  }
  function cpuProgress(p: any, action: string, detail: any = {}) {
    if (p.control !== 'cpu') return
    const previous = p.consecutivePasses || 0
    p.consecutivePasses = 0; p.cpuStalled = null
    record('cpu-progress', { name: p.name, action, previousPasses: previous, ...detail })
  }
  function cpuNoAction(p: any, reason: string) {
    if (!active() || p !== current()) return
    const limit = market.cpu.maxConsecutivePasses ?? 2, count = p.consecutivePasses || 0
    if (count < limit) {
      p.consecutivePasses = count + 1
      p.tactic = 'Blocked corridor · pass ' + p.consecutivePasses + '/' + limit
      record('cpu-pass', { name: p.name, reason, count: p.consecutivePasses, limit,
        decision: entity(p).blackboard.get('custom.aiDecision') })
      reward(p, 'pass'); run(() => beginTurn(true)); return
    }
    p.cpuStalled = { turn: match.turnNumber, reason, clock: talus.sim.clock }
    p.tactic = 'Blocked: no useful legal action; inspection needed'
    match.message = p.name + ' is blocked. No safe shot or eligible escape terrain. Resume retries; Game menu saves.'
    record('cpu-stalled', { name: p.name, reason, count, limit,
      position: entity(p).position, decision: entity(p).blackboard.get('custom.aiDecision') })
    input(false); persist(); publish(); talus.sim.pause(); talus.ui.openMenu('Menus/pause.html')
  }
  function retryStalledCpu() {
    if (!match || match.phase !== 'turn' || !current().cpuStalled) return
    const p = current(); p.cpuStalled = null
    talus.sim.resume(); record('cpu-retry', { name: p.name, count: p.consecutivePasses || 0 })
    run(() => prepareCpuTurn(p, match.turnNumber))
  }
  talus.on('menu.pause.resume', retryStalledCpu)
  talus.on('menu.custom.resume', retryStalledCpu)
  function prepareCpuEscape(p: any, turn: number): boolean {
    if (!active() || current() !== p || match.turnNumber !== turn) return false
    const item = itemById('escape-charge'), tank = entity(p), at = tank.position
    if (!item?.enabled || !item.template || !at) {
      record('cpu-escape-refused', { name: p.name, reason: 'escape-template-unavailable' }); return false
    }
    const b = item.behavior, floor = arena.terrain.solidBottomTileRow * arena.tiles.chunksPerTile * 64
    const names = new Set(b.materials.map((m: any) => m.name)), others = match.roster.filter((r: any) => r !== p && targetSnapshot(r))
    const toward = others.length ? Math.sign(entity(others[0]).x! - at.x) || 1 : 1
    const angles = toward > 0 ? [-.35, -.8, -1.2, -Math.PI / 2, -2, -2.5, -2.8] : [-2.8, -2.5, -2, -Math.PI / 2, -1.2, -.8, -.35]
    const candidates: any[] = []
    for (const angle of angles) {
      const dx = Math.cos(angle), dy = Math.sin(angle), origin = { x: at.x + dx * item.projectile.spawnOffset, y: at.y + dy * item.projectile.spawnOffset }
      const cells: any[] = []
      for (const fraction of [.25, .5, .85]) for (const across of [-.65, 0, .65]) {
        const advance = b.length * fraction, half = b.width * fraction / 2
        const x = Math.round(origin.x + dx * advance - dy * half * across), y = Math.round(origin.y + dy * advance + dx * half * across)
        if (x < arena.bounds.x || x >= arena.bounds.x + arena.bounds.w || y < arena.bounds.y || y >= floor) continue
        const cell = talus.world.cell(x, y)
        if (cell?.element && !cell.body && !cell.entity && names.has(cell.element.name)) cells.push({ x, y, element: cell.element.name })
      }
      if (cells.length) candidates.push({ angle, cells })
    }
    const choice = candidates.sort((a, b) => b.cells.length - a.cells.length)[0]
    if (!choice) { record('cpu-escape-refused', { name: p.name, reason: 'no-observed-eligible-terrain', samples: angles.length * 9 }); return false }
    if (!chooseWeapon(p, item.id)) { record('cpu-escape-refused', { name: p.name, reason: 'equip-refused' }); return false }
    tank.blackboard.set('custom.angle', -choice.angle * 180 / Math.PI); tank.blackboard.set('custom.power', 100)
    tank.blackboard.set('custom.aimPlan', null); tank.blackboard.set('custom.aimRefusal', null)
    p.plannedTurn = turn; p.aimedTurn = turn; p.tactic = 'Free Riot Charge · clear nearby terrain'
    tank.blackboard.set('custom.aiDecision', { turn, item: item.id, template: item.template, tactic: p.tactic,
      coverage: 'observed-local-terrain-only', eligibleSamples: choice.cells, angle: choice.angle, consecutivePasses: p.consecutivePasses || 0 })
    record('cpu-escape-selected', { name: p.name, decision: tank.blackboard.get('custom.aiDecision') })
    persist(); publish(); return true
  }
  function explorationPath(p: any, direction: number) {
    const at = entity(p)?.snapshot(), half = arena.combat.tankHalfWidth
    if (!at || !direction) return null
    const x = at.x + direction * (half + 24)
    if (x < match.bounds.x + half || x > match.bounds.x + match.bounds.w - half) return null
    // Resident observations are only a local safety estimate. Recheck while
    // driving; native collision and fuel telemetry remain authoritative.
    const ground = talus.world.groundY(x, at.y - 18, 66)
    if (ground === null || ground < at.y - 16 || ground > at.y + 42) return null
    if (talus.world.raycast({ x: at.x + direction * (half + 3), y: at.y - 10 }, { x, y: at.y - 10 })) return null
    if (match.roster.some((r: any) => { const other = r !== p && targetSnapshot(r); return other && Math.hypot(other.x - x, other.y - at.y) < 58 })) return null
    return { x, y: ground }
  }
  async function exploreCpu(p: any, turn: number, valid: () => boolean) {
    const style = doctrine(p).exploration
    if (!style || p.exploredTurn === turn || !valid() || owned(p, 'fuel-tank') <= 0 || match.remaining <= 4) return
    p.exploredTurn = turn
    const roll = aiRandom(p); persist()
    if (roll >= style.chance) return
    const e = entity(p), origin = e.position!, visits = p.exploredPositions || []
    const crates = (match.supplies?.crates || []).filter((c: any) => c.state === 'available')
      .map((c: any) => talus.bodies.get(c.bodyId)?.snapshot()).filter((c: any) => c && Math.abs(c.x - origin.x) < 600)
    const candidates = [-1, 1].map(direction => {
      const at = explorationPath(p, direction); if (!at) return null
      const novelty = visits.length ? Math.min(...visits.map((v: any) => Math.abs(v.x - at.x))) : 30
      const supply = crates.length ? Math.min(...crates.map((c: any) => Math.abs(c.x - origin.x))) - Math.min(...crates.map((c: any) => Math.abs(c.x - at.x))) : 0
      const score = Math.min(80, novelty) + (origin.y - at.y) * (style.preference === 'high-ground' ? 3 : 1)
        + supply * (style.preference === 'supplies' ? 3 : 1.5) + aiRandom(p) * 30
      return { direction, at, score }
    }).filter(Boolean).sort((a: any, b: any) => b.score - a.score)
    const choice = candidates[0]; if (!choice) return
    const seconds = Math.min(style.seconds, match.remaining - 3)
    p.tactic = crates.length ? 'Investigating nearby supplies' : style.preference === 'high-ground' ? 'Scouting higher ground' : 'Exploring a fresh firing position'
    e.blackboard.set('custom.exploration', { turn, direction: choice.direction, from: { ...origin }, seconds, tactic: p.tactic })
    record('cpu-explore-start', { name: p.name, direction: choice.direction, from: origin, seconds, roll }); publish()
    const until = talus.sim.clock + seconds
    try {
      while (valid() && talus.sim.clock < until && match.remaining > 3 && owned(p, 'fuel-tank') > 0) {
        if (!explorationPath(p, choice.direction)) break
        driveTank(p, choice.direction * arena.moveSpeed)
        await talus.sleepTicks(3)
      }
    } finally { driveTank(p, 0) }
    const at = e.position
    if (at) { p.exploredPositions = [...visits, { x: at.x, y: at.y }].slice(-8); record('cpu-explore-end', { name: p.name, from: origin, to: at }) }
    persist()
  }
  async function prepareCpuTurn(p:any,turn:number) {
    if (!active() || p.eliminated || current() !== p || match.turnNumber !== turn) return
    const token=utilityGeneration,e=entity(p),d=doctrine(p), beforePosition={...entity(p).position!}, beforeDig=owned(p,'digger')
    const valid=()=>active() && !p.eliminated && current()===p && match.turnNumber===turn && token===utilityGeneration
    if(p.preparedTurn!==turn) {
      p.preparedTurn=turn;syncUtilities(p)
      for(const id of ['shield','magnet'] as const)if(owned(p,id)>0 && !e.defenses.state?.[id==='shield'?'shield':'deflector']?.active)useDefense(p,id)
      const others=match.roster.filter((r:any)=>r!==p&&targetSnapshot(r))
      const target=others.sort((a:any,b:any)=>Math.abs(entity(a).x!-e.x!)-Math.abs(entity(b).x!-e.x!))[0]
      const direction=target?Math.sign(entity(target).x!-e.x!):1
      // Escape nearby hazards first; clear terrain also allows a short scout.
      const close=target && Math.abs(entity(target).x!-e.x!)<100
      const wall=talus.world.raycast({x:e.x!+direction*28,y:e.y!-8},{x:e.x!+direction*70,y:e.y!-8})
      const burrow=!!wall && (p.personaId==='mole'||p.personaId==='faultline') && owned(p,'digger')>0
      if(burrow) {
        record('cpu-utility-attempt',{name:p.name,item:'digger',reason:'observed-obstruction',stock:owned(p,'digger'),from:e.position})
        const until=talus.sim.clock+market.cpu.digSeconds
        while(valid()&&talus.sim.clock<until&&owned(p,'digger')>0) {await dig(p,direction);if(!valid())return;driveTank(p,direction*arena.moveSpeed);await talus.sleepTicks(1)}
      } else if((close || wall) && owned(p,'fuel-tank')>0) {
        record('cpu-utility-attempt',{name:p.name,item:'fuel-tank',reason:close?'close-opponent':'observed-obstruction',stock:owned(p,'fuel-tank'),from:e.position})
        const until=talus.sim.clock+market.cpu.driveSeconds
        while(valid()&&talus.sim.clock<until) {driveTank(p,-direction*arena.moveSpeed);await talus.sleepTicks(1)}
      }
      if (valid() && !wall && !close) await exploreCpu(p, turn, valid)
      if(valid()&&wall&&!burrow&&owned(p,'jetpack')>0&&itemById('jetpack').enabled) {
        const held=e.controller.levitate(true)
        record('cpu-utility-attempt',{name:p.name,item:'jetpack',reason:'observed-obstruction',stock:owned(p,'jetpack'),receipt:held,from:e.position})
        if(held.accepted) {
          const until=talus.sim.clock+market.cpu.jetSeconds
          while(valid()&&talus.sim.clock<until)await talus.sleepTicks(1)
          if(e.isLive)e.controller.levitate(false)
        }
      }
    }
    if(!valid())return
    driveTank(p,0)
    const afterPosition=e.position!
    if (Math.hypot(afterPosition.x-beforePosition.x,afterPosition.y-beforePosition.y)>=4) cpuProgress(p,'movement',{from:beforePosition,to:afterPosition})
    else if (owned(p,'digger')<beforeDig) cpuProgress(p,'dig',{spent:beforeDig-owned(p,'digger')})
    if ((p.consecutivePasses||0)>=(market.cpu.maxConsecutivePasses??2) && prepareCpuEscape(p,turn)) { await fire(); return }
    const tilt=Math.abs(Math.atan2(Math.sin(e.snapshot()!.angle),Math.cos(e.snapshot()!.angle)))
    if(tilt>=arena.posture.cpuTiltRadians&&flipUpright(p)) {
      for(let waited=0;valid()&&waited<arena.posture.cpuFlipWaitTicks;waited+=6) {
        if(!['moving','pending'].includes(e.controller.posture?.status||''))break
        await talus.sleepTicks(6)
      }
    }
    if(!valid())return
    const solved=await planCpuShot(p,turn)
    while(valid() && talus.sim.paused)await talus.sleepTicks(1)
    if(solved) { if(valid())e.runGraph(arena.cpuGraph,{turn}) }
    else if(valid()) cpuNoAction(p,'No supported clear shot after bounded movement, escape and demolition alternatives')
  }
  function syncLoadout(p: any) {
    const tank = entity(p); if (!tank?.isLive) return
    syncUtilities(p)
    for (const item of market.items) if (item.enabled && item.kind === 'weapon')
      tank.weapon.setAmmo(item.template, unlimited(item.id) ? null : owned(p, item.id))
    const selected = itemById(wallet(p).selected)
    p.weaponId = selected?.enabled && selected.kind === 'weapon' && owned(p, selected.id) > 0 ? selected.id : 'standard'
    if (!tank.weapon.equip(itemById(p.weaponId).template)) throw new Error('Tank cannot equip ' + p.weaponId)
    tank.blackboard.set('custom.weaponId', p.weaponId)
    tank.blackboard.set('custom.wallet', { cash: wallet(p).cash, earned: p.cashEarned })
  }
  function chooseWeapon(p: any, id: string) {
    const item = itemById(id)
    if (!item?.enabled || item.kind !== 'weapon' || owned(p, id) <= 0) return false
    const previous = p.weaponId
    wallet(p).selected = id; wallet(p).revision++; saveBank(); syncLoadout(p)
    if (previous !== id && !item.noCombatRewards) reward(p, 'equip')
    aim(); persist(); publish(); return true
  }
  function purchase(p: any, id: string, expectedRevision?: number) {
    const item = itemById(id), w = wallet(p)
    if (!['ready', 'finished'].includes(match.phase) || !item?.enabled || item.price <= 0
      || !Number.isSafeInteger(item.price) || !Number.isSafeInteger(item.bundle) || item.bundle <= 0) return false
    if (expectedRevision !== undefined && expectedRevision !== w.revision) {
      talus.ui.set('shop.message', 'The basket changed. Please try again.'); return false
    }
    if (w.cash < item.price) { talus.ui.set('shop.message', 'Not enough cash for that bundle.'); return false }
    w.cash -= item.price; w.spent += item.price
    const supply = item.grants?.item || id, units = item.bundle * (item.grants?.units || 1)
    w.stock[supply] = owned(p, supply) + units; w.revision++
    if (item.kind === 'weapon') w.selected = id
    saveBank(); record('purchase', { name: p.name, item: id, price: item.price, quantity: item.bundle, cash: w.cash })
    if (match.phase === 'ready') syncLoadout(p)
    persist(); return true
  }
  function cpuShopping() {
    const stage = talus.world.id + ':' + match.phase
    const bought: any = bank.cpuShops[stage] || {}
    for (const p of match.roster) {
      if (p.control !== 'cpu' || Object.hasOwn(bought, playerKey(p))) continue
      const d = doctrine(p), w = wallet(p), reserve = Math.floor(w.cash * d.saveFraction), purchases: string[] = [], skipped: any[] = []
      const buy = (id: string, cap: number) => {
        const item = itemById(id), stock = item?.grants?.item || id
        if (!item?.enabled || owned(p, stock) >= cap || w.cash - item.price < reserve) return false
        if (!purchase(p, id)) return false
        purchases.push(id); return true
      }
      // One affordable preferred weapon bundle; keep savings for the expensive
      // favorite and consume existing stock before replenishing it.
      for (const id of d.weaponPreferences) {
        if (id === 'standard') continue
        const reason = cpuWeaponUnavailable(itemById(id))
        if (reason) { skipped.push({ item: id, reason }); continue }
        if (owned(p,id) >= 2 || buy(id,2)) break
      }
      // Explorers reserve a small tank of drive fuel before optional defenses.
      if (d.exploration) buy('fuel-tank', 2)
      for (const id of d.utilityPreferences.slice(0,3)) buy(id, id==='battery'?2:1)
      // The receipt shares the same bank object as purchases; later visits do not buy again.
      Object.defineProperty(bought, playerKey(p), { value: true, enumerable: true, configurable: true, writable: true })
      bank.cpuShops[stage] = bought; saveBank()
      record('cpu-shopping', { name: p.name, stage, purchases, skipped, reserve, cash: w.cash,
        stock: { ...w.stock }, selected: w.selected })
    }
  }
  function publishShop() {
    if (!shopOpen) return
    const p = match.roster[shopIndex], w = wallet(p)
    talus.ui.set('shop', { name: p.name, persona: p.control==='cpu' ? (personaFor(p)?.factionName||'CPU')+' · '+(match.cpuSkill==='persona'?personaFor(p)?.skill:match.cpuSkill||personaFor(p)?.skill) : 'Local hotseat', color: p.color, cash: w.cash, earned: p.cashEarned,
      revision: w.revision, account: playerKey(p), index: shopIndex + 1, count: match.roster.length,
      title: match.phase === 'finished' ? 'Between rounds' : 'Opening armory',
      result: match.phase === 'finished' ? match.message : 'New pilots get $' + market.startingCash + '. Cash and supplies carry between rounds.',
      finished: match.phase === 'finished', ready: match.phase === 'ready',
      seriesLength: match.seriesLength || 1, seriesId: match.series?.complete ? '' : match.seriesId,
      biomeCycle: match.biomeCycle ? 'cycle' : 'random', biomeRounds: match.biomeRounds || 1, baseGeneration: match.baseGeneration,
      seriesStatus: match.series?.complete ? 'Series complete · ' + match.series.champion : 'Best of ' + (match.seriesLength || 1),
      nextLabel: match.series?.complete ? 'Start new series' : 'Deploy next round',
      round: match.series?.complete ? 1 : match.round + 1, humans: match.humans, computers: match.computers,
      turnSeconds: match.turnSeconds, personaSeed: match.personaSeed, cpuSkill: match.cpuSkill, generation: nextGeneration(), namesText: match.roster.map((r: any) => r.name).join('\n'),
      message: p.control === 'cpu' ? 'Computer pilot: purchases made automatically. You can inspect or add supplies.' : 'Your wallet and unused supplies carry into the next round.',
      receipts: Object.entries(p.cashBreakdown).map(([action, amount]) => ({ action, amount: Number(amount) })),
      categories: market.categories.map((name: string, index: number) => ({ name, action: 'category-' + index, selected: name === shopCategory })),
      items: market.items.filter((item: any) => shopCategory === 'All' || item.category === shopCategory).map((item: any) => ({ id: item.id, name: item.name, description: item.description,
        category: item.category.toUpperCase(), icon: item.kind==='weapon'?'✦':'◆',
        comparison: item.projectile ? 'Damage '+item.projectile.damage+' / Blast '+item.projectile.aoeRadius+'px / Crater '+item.projectile.carveRadius+'px'+(item.behavior?.count?' / '+item.behavior.count+' stages':'') : 'Utility · '+item.bundle+' per bundle',
        price: !item.enabled ? 'Not available yet' : item.price ? '$' + item.price + ' / ' + item.bundle : 'Always available',
        stock: unlimited(item.id) ? 'Unlimited' : item.grants ? owned(p, item.grants.item) + ' reserve charges' : String(owned(p, item.id)),
        action: 'buy-' + item.id, disabled: !item.enabled || item.price === 0 || w.cash < item.price,
        button: !item.enabled ? 'In development' : item.price === 0 ? 'Included' : w.cash < item.price ? 'Need more cash' : 'Buy bundle' })) })
  }
  function openShop() {
    if (!match || arcadeCard || !['ready', 'finished'].includes(match.phase)) return
    input(false); cpuShopping()
    // Spectators have no purchase decisions. Use the same idempotent CPU
    // shopping receipts, then enter the normal camera/card/turn sequence.
    if (match.phase === 'ready' && match.roster.length > 0 && match.roster.every((p: any) => p.control === 'cpu')) {
      shopOpen = false; talus.ui.closeMenu()
      record('cpu-armory-complete', { round: match.round, players: match.roster.length })
      run(() => beginTurn(false)); return
    }
    shopOpen = true
    shopIndex = Math.max(0, match.roster.findIndex((p: any) => p.control === 'human'))
    publishShop(); publish()
    talus.ui.openMenu('Menus/shop.html')
  }
  function closeShop() { shopOpen = false; talus.ui.closeMenu(); publish() }
  function useBattery(p: any) {
    if (!active() || p !== current() || p.eliminated || owned(p, 'battery') <= 0) return false
    const tank = entity(p), health = tank?.health, max = tank?.maxHealth
    if (!tank?.isLive || health == null || max == null || health >= max) return false
    const after = tank.heal(itemById('battery').heal)
    if (after == null || after <= health) return false
    wallet(p).stock.battery--; wallet(p).revision++; saveBank()
    reward(p, 'utility'); record('utility', { name: p.name, item: 'battery', healed: after - health })
    persist(); publish(); return true
  }
  function useAutoAim(p: any) {
    if (!active() || p !== current() || p.eliminated || owned(p, 'lazy-boy') <= 0 || p.autoAimTurn === match.turnNumber) return false
    p.autoAimTurn = match.turnNumber; p.plannedTurn = null; p.aimedTurn = null
    match.message = 'Lazy Boy is calculating a shot'; persist(); publish()
    entity(p).runGraph(arena.cpuGraph, { turn: match.turnNumber })
    return true
  }
  function shotReward(e: any, action: 'launch' | 'landing' | 'bounce' | 'end') {
    if (!match || !market || ['deploying', 'ready', 'finished', 'fault'].includes(match.phase)) return
    const id = String(e.projectileId)
    if (action === 'launch' && match.attack?.owner === (e.owner?.id || e.ownerEntityId) && itemById(match.attack.item)?.noCombatRewards) return
    if (action === 'launch') {
      if (match.cashShots[id]) return
      const p = match.roster.find((r: any) => r.entityId === (e.owner?.id || e.ownerEntityId))
      if (!p) return
      match.cashShots[id] = { owner: p.entityId, landed: false }; reward(p, 'shoot')
    } else {
      const credit = match.cashShots[id]; if (!credit) return
      const p = match.roster.find((r: any) => r.entityId === credit.owner)
      if (action === 'landing' && !credit.landed) { credit.landed = true; reward(p, 'landing') }
      if (action === 'bounce') reward(p, 'bounce')
      if (action === 'end') {
        if (!credit.landed) reward(p, 'resolution')
        delete match.cashShots[id]
      }
    }
    persist()
  }
  function fail(error: any) {
    releaseEmissionRegions(); holdCamera()
    const message = String(error); record('fault', { message })
    input(false); cancelArcade(); cashPopups.clear()
    if (match) { match.phase = 'fault'; match.message = message; persist(); publish() }
    talus.state.set('indigo.error', message)
    talus.ui.banner('Match stopped', { sub: message, ms: 10000 })
  }
  function run(fn: () => Promise<void>) { void fn().catch(fail) }
  function publish() {
    if (!match) return
    const p = match.phase === 'finished' ? match.roster.find((r: any) => r.name === match.winner) || current() : current()
    const e = p.entityId ? entity(p) : null
    talus.ui.set({ biome: arena.biome.name, seed: match.seed, tankCount: match.roster.length,
      seriesStatus: match.series?.complete ? 'Champion · ' + match.series.champion : 'Round ' + match.round + ' / Best of ' + (match.seriesLength || 1),
      roundStats: match.roster.map((r:any)=>({name:r.name,kills:r.kills,damage:Math.round(r.damage||0),accuracy:(r.shots?Math.round((r.hits||0)/r.shots*100):0)+'%',shots:r.shots||0,earned:r.cashEarned.toFixed(2)})),
      standings: match.series?.standings || [],
      phase: match.phase, status: match.message, turnNumber: match.turnNumber,
      persona: p.control==='cpu' ? (personaFor(p)?.factionName || 'CPU') + ' · ' + (match.cpuSkill==='persona' ? personaFor(p)?.skill : match.cpuSkill || personaFor(p)?.skill) : 'Local hotseat',
      targets: match.roster.filter((r:any)=>r!==p&&!r.eliminated).map((r:any)=>({name:r.name,action:'target-'+r.index,selected:r.entityId===p.targetId})),
      tactic: p.tactic || '', target: match.roster.find((r: any) => r.entityId === p.targetId)?.name || '',
      shotDirection: Math.cos(Number(e?.blackboard.get('custom.angle') ?? 45) * Math.PI / 180) < 0 ? '← LEFT' : 'RIGHT →',
      aimRotation: 'rotate(' + -Number(e?.blackboard.get('custom.angle') ?? 45) + 'deg)',
      lastHit: match.lastHit || '', frameNotice: match.frameNotice || '',
      cashNotice: match.cashNotice || '', round: match.round,
      cash: bank ? wallet(p).cash : 0, roundCash: p.cashEarned || 0,
      weaponName: market ? itemById(p.weaponId || 'standard').name : 'Field cannon',
      weaponAmmo: bank && p.weaponId && !unlimited(p.weaponId) ? owned(p, p.weaponId) : '∞',
      batteries: bank ? owned(p, 'battery') : 0,
      autoAimCharges: bank ? owned(p, 'lazy-boy') : 0,
      groundFuel: e?.isLive?(e.controller.groundDrive?.fuel??0).toFixed(1):'0',
      groundFuelStock: bank ? owned(p,'fuel-tank').toFixed(1) : '0',
      groundFuelEnabled: !!market?.items.find((i:any)=>i.id==='fuel-tank')?.enabled,
      parachuteCharges: bank ? owned(p, 'parachute') : 0,
      parachuteEnabled: !!market?.items.find((i:any)=>i.id==='parachute')?.enabled,
      parachuteOn: !!e?.isLive && !!e.controller.fallBrake?.deployed,
      supplies: bank ? {jet:e?.isLive?(e.controller.state?.fuel??0).toFixed(1):'0',jetStock:owned(p,'jetpack').toFixed(1),dig:owned(p,'digger').toFixed(1),jetCapacity:e?.isLive?(e.controller.state?.capacity??null):null,
        shield:e?.isLive?Math.round(e.defenses.state?.shield?.remaining||0):0,shieldCapacity:e?.isLive?(e.defenses.state?.shield?.spec.capacity??0):0,magnetCapacity:e?.isLive?(e.defenses.state?.deflector?.spec.capacity??0):0,magnet:e?.isLive?(e.defenses.state?.deflector?.remaining||0).toFixed(1):'0',
        shieldOn:!!e?.isLive&&!!e.defenses.state?.shield?.active,magnetOn:!!e?.isLive&&!!e.defenses.state?.deflector?.active}:null,
      canEquip: !shopOpen && (human() || match.phase === 'ready'),
      loadout: market && bank ? market.items.filter((i: any) => i.enabled && i.kind === 'weapon' && owned(p, i.id) > 0).map((i: any) => ({
        name: i.name, stock: unlimited(i.id) ? '∞' : owned(p, i.id), action: 'equip-' + i.id,
        disabled: owned(p, i.id) <= 0, selected: p.weaponId === i.id })) : [],
      chaosNotice: match.chaos?.notice || '', chaosCount: match.chaos?.jobs.length || 0,
      remaining: Math.max(0, Math.ceil(match.remaining)), turnSeconds: match.turnSeconds,
      ready: match.phase === 'ready', human: human(),
      canSetup: !arcadeCard && ['ready', 'finished', 'fault'].includes(match.phase), canShop: !arcadeCard && ['ready', 'finished'].includes(match.phase), finished: match.phase === 'finished' && !arcadeCard,
      winner: match.winner || 'Draw',
      current: { name: p.name, color: p.color, control: p.control === 'human' ? 'Human' : 'Computer',
        angle: Number(e?.blackboard.get('custom.angle') ?? 45),
        power: Number(e?.blackboard.get('custom.power') ?? 70), health: e?.health == null ? '…' : Math.round(e.health) },
      roster: match.roster.map((r: any) => ({ name: r.name, color: r.color,
        health: r.eliminated ? 0 : !r.entityId ? 100 : entity(r)?.health == null ? '…' : Math.max(0, Math.round(entity(r).health!)),
        status: r.eliminated ? 'OUT' : match.phase === 'finished' ? 'WINNER' : r.index === match.focusIndex ? 'CURRENT' : 'WAITING', kills: r.kills,
        cash: bank ? wallet(r).cash : 0, earned: r.cashEarned || 0 })),
    })
  }
  function showSetup() {
    if (match && !['ready', 'finished', 'fault'].includes(match.phase)) return
    const saved: any = talus.installed.get('indigo') || {}
    talus.ui.set('installed.indigo', { generation: 'wfc', humans: 0, computers: 4, turnSeconds: 30,
      namesText: 'CPU 1\nCPU 2\nCPU 3\nCPU 4', ...saved })
    talus.ui.set('canResume', !!match)
    if (!match) talus.ui.hud(null)
    talus.ui.openMenu('Menus/setup.html')
  }
  function generationRequest(params: any) {
    // Carry the immutable launch request, including scoped parameters/weights,
    // rather than the single recipe selected for this round.
    return typeof params?.generation === 'object' && params.generation !== null
      ? params.generation : { recipe: params?.['generation.recipe'] || talus.world.generation.status().recipeId || 'random' }
  }
  function nextGeneration() {
    const request = match.baseGeneration || generationRequest(talus.game.params)
    if (!match.biomeCycle) return request
    const cycle = ['wfc', 'brush', 'dune-sea', 'bunker-grid', 'shattered-highlands', 'rat-run', 'bramble-badlands', 'cavern-war', 'crater-country', 'terrace-siege', 'verdant-reach']
    const nextRound = match.series?.complete ? 1 : match.round + 1
    const recipe = cycle[Math.floor((nextRound - 1) / (match.biomeRounds || 1)) % cycle.length]
    return { ...request, recipe, parameters: recipe === request.recipe ? request.parameters : undefined }
  }
  function scoreSeries(scores: any) {
    scores.series ||= {}
    const id = match.seriesId || talus.world.id
    const series = (Object.hasOwn(scores.series,id) ? scores.series[id] : null) || { length: match.seriesLength || 1, rounds: {}, players: {} }
    if (!series.rounds[talus.world.id]) {
      for (const p of match.roster) {
        const key = playerKey(p), row = Object.hasOwn(series.players,key) ? series.players[key] : {name:p.name,wins:0,kills:0,damage:0,earned:0,shots:0,hits:0}
        row.wins += p.name === match.winner ? 1 : 0
        for (const k of ['kills','damage','shots','hits']) row[k] += p[k] || 0
        row.earned += p.cashEarned
        series.players = {...series.players,[key]:row}
      }
      series.rounds[talus.world.id] = {winner:match.winner,seed:match.seed,recipe:match.generation}
    }
    const standings = Object.values(series.players).sort((a:any,b:any)=>b.wins-a.wins || b.kills-a.kills || b.damage-a.damage) as any[]
    const leader=standings[0], complete=Object.keys(series.rounds).length>=series.length || leader?.wins>=Math.floor(series.length/2)+1
    const tied=standings.filter((r:any)=>r.wins===leader?.wins)
    series.complete=complete; series.champion=complete ? (tied.length===1 ? leader.name : 'Draw: '+tied.map((r:any)=>r.name).join(' / ')) : null
    scores.series={...scores.series,[id]:series}
    // Series history has a bounded footprint; lifetime per-player scores remain.
    const keys=Object.keys(scores.series);for(const old of keys.slice(0,Math.max(0,keys.length-50)))if(old!==id)delete scores.series[old]
    match.series={complete,champion:series.champion,standings}
  }
  function validate(params: any) {
    const source = talus.world.generation?.status()
    const humans = Number(params.humans), computers = Number(params.computers), seconds = Number(params.turnSeconds)
    if (!Number.isInteger(humans) || humans < 0 || !Number.isInteger(computers) || computers < 0
      || humans + computers < 2 || humans + computers > arena.maxPlayers)
      throw new Error('Choose between 2 and ' + arena.maxPlayers + ' tanks in total.')
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120)
      throw new Error('Choose a turn length from 5 to 120 whole seconds.')
    const supplied = String(params.namesText || '').split(/\r?\n/).map(v => v.trim().slice(0, 32))
    const count = humans + computers, span = arena.combat.w - arena.combat.spawnInset * 2
    const left = arena.combat.x + arena.combat.spawnInset
    const paletteOrder = Array.from({length: arena.maxPlayers}, (_, i) => i)
    let rosterRng = chaosSeed(String(params.personaSeed || talus.world.seed) + ':roster')
    for(let i=paletteOrder.length-1;i>0;i--) {rosterRng^=rosterRng<<13;rosterRng^=rosterRng>>>17;rosterRng^=rosterRng<<5;const j=(rosterRng>>>0)%(i+1);[paletteOrder[i],paletteOrder[j]]=[paletteOrder[j],paletteOrder[i]]}
    const roster = Array.from({ length: count }, (_, i) => ({ index: i,
      name: supplied[i] || (i < humans ? 'Player ' + (i + 1) : 'CPU ' + (i - humans + 1)),
      control: i < humans ? 'human' : 'cpu', color: arena.tankPalettes?.[paletteOrder[i]]?.color || colors[i % colors.length],
      templateId: arena.tankPalettes?.[paletteOrder[i]]?.templateId || arena.tankTemplate, entityId: null,
      personaId: i < humans ? null : personaCatalog?.personas[paletteOrder[i] % personaCatalog.personas.length]?.id || null,
      spawnX: Math.round(left + span * i / (count - 1)), eliminated: false, kills: 0,
      shots: 0, hits: 0, damage: 0, damageTaken: 0, cashEarned: 0, cashBreakdown: {}, weaponId: 'standard', moveDistance: 0,
    }))
    if (new Set(roster.map(p => p.name.toLowerCase())).size !== count)
      throw new Error('Use a different name for each tank so scores stay distinct.')
    return { version: 9, presentation: { active: null, queue: [] }, pendingTurn: null, attack: null,
      generation: source?.recipeId || (params.generation === 'brush' ? 'brush' : 'wfc'),
      generationChoice: params.generation?.recipe || params['generation.recipe'] || source?.recipeId || 'wfc',
      terrainSource: source || null, generationVersion: generationRecipes?.catalog ? 12 : 11,
      generated: 0, details: 0, livingSites: 0, seed: talus.world.seed, biome: arena.biome.id,
      seriesId: String(params.seriesId || talus.world.id), seriesLength: [1,3,5,7,9].includes(Number(params.seriesLength)) ? Number(params.seriesLength) : 1,
      biomeCycle: params.biomeCycle === 'cycle', biomeRounds: clamp(Math.floor(Number(params.biomeRounds)||1),1,9), baseGeneration: params.baseGeneration || generationRequest(params),
      round: Math.max(1, Math.floor(Number(params.round) || 1)), cashShots: {}, cashNotice: '',
      bounds: { ...arena.bounds }, cameraPolicyVersion: 1,
      personaSeed: String(params.personaSeed || talus.world.seed), cpuSkill: ['rookie','easy','regular','hard','expert'].includes(params.cpuSkill) ? params.cpuSkill : 'persona',
      humans, computers, turnSeconds: seconds, remaining: seconds, phase: 'deploying', focusIndex: 0,
      turnNumber: 0, shotId: null, impact: null, roster, winner: null, message: 'Deploying tanks',
      chaos: { rng: chaosSeed(String(talus.world.seed)), serial: 0, jobs: [], quiet: 0, notice: '' } }
  }
  function chaosSeed(seed: string) {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
    return h >>> 0 || 1
  }
  function chaosRandom() {
    let x = match.chaos.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    match.chaos.rng = x >>> 0; return (x >>> 0) / 4294967296
  }
  function queueChaos(p: any, at?: { x: number | null, y: number | null }) {
    if (p.chaosId || match.phase === 'finished') return
    const tank = entity(p), position = at?.x != null && at.y != null ? at : tank?.position
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new Error('Death effect has no physical position: ' + p.name)
    const pool = chaosCatalog.effects.filter((fx: any) => fx.enabled)
    const fx = pool[Math.floor(chaosRandom() * pool.length)]
    p.chaosId = ++match.chaos.serial; p.deathEffect = fx.id
    const job = { id: p.chaosId, owner: p.entityId, name: p.name, effect: fx.id,
      x: Number(position.x), y: Number(position.y), elapsed: 0, emitted: 0, particles: 0, livePulses: 0,
      projectileIds: [], launched: 0, ended: 0, started: false, emissionDone: false }
    match.chaos.jobs.push(job); match.chaos.quiet = 0
    match.chaos.notice = p.name + ': ' + fx.name + '!'
    if (tank?.can('blackboard.set')) tank.blackboard.set('custom.deathChaos', { id: job.id, effect: fx.id })
    record('chaos-queued', { id: job.id, owner: job.owner, effect: fx.id, x: job.x, y: job.y })
    talus.ui.floatText({ x: job.x, y: job.y - 30 }, fx.name + '!', { color: '#ffbd82', ms: 2500, size: 1.3 })
  }
  function chaosShell(job: any, spec: any, instant = false) {
    // launch dispatches synchronously. Secondary shells must never take over
    // the active turn's projectile, even if its owner died during a cast.
    launchingChaos = true
    try {
      const shell = talus.projectiles.launch({ kind: 'rigid-body', element: 'IRON',
        owner: job.owner, x: job.x, y: job.y, vx: 0, vy: 0,
        bodySizePx: 4, gravityScale: 1, drag: 0, lifetime: 6, independent: true,
        damage: 55, damageType: 'blast', aoeRadius: 72, carveRadius: 28, carveMode: 'erase',
        ...spec, detonate: { ...(spec.detonate ?? { onBody: true, onTerrain: true, atLifetime: true }), looseMatter: market.looseMatter } })
      if (!shell) throw new Error('Death shell refused: ' + job.effect + ' #' + job.launched)
      job.projectileIds.push(shell.id); job.launched++
      if (instant) shell.detonate()
    } finally { launchingChaos = false }
  }
  function finishEmission(job: any, fx: any) {
    if (!match || match.phase === 'fault') { releaseEmissionRegion('death:' + job.id); return false }
    if (job.emissionDone) { releaseEmissionRegion('death:' + job.id); return true }
    if (fx.finishBlast) {
      if (!chaosRegionReady(job, fx)) return false
      const result = talus.world.explode({ x: job.x, y: job.y, radius: fx.finishBlast,
        damage: 45, carveRadius: Math.round(fx.finishBlast * .6), carve: 'erase', source: job.owner })
      if (!result) throw new Error('Death finale refused: ' + job.effect)
    }
    job.emissionDone = true
    // The geyser remains attached to the wreck until its finale. Burst deaths
    // consume their wreck immediately; this is not a material-conversion path.
    const corpse = talus.entities.get(job.owner)
    if (corpse?.exists) corpse.despawn()
    releaseEmissionRegion('death:' + job.id)
    record('chaos-emission-ended', { id: job.id, effect: job.effect, elapsed: job.elapsed,
      launched: job.launched, particles: job.particles, livePulses: job.livePulses })
    return true
  }
  async function deathBrush(job: any, fx: any) {
    const radius = fx.radiusMin + Math.floor(chaosRandom() * (fx.radiusMax - fx.radiusMin + 1))
    const x = Math.round(job.x), y = Math.round(job.y), cells = radius * radius * 4
    // This is actual hot material, not an explosion recolored to look nuclear.
    // Native terrain work owns its bounded simulation region, even off-camera.
    const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius },
      bounds: { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 }, replacement: 'empty',
      budget: { cells, particles: cells, work: cells }, recipe: materialRecipe(fx.element) as TerrainRecipe,
      seed: chaosSeed(match.seed + ':death-brush:' + job.id) })
    record('chaos-material', { id: job.id, effect: fx.id, element: fx.element, radius, x, y, receipt })
    if (receipt.status !== 'completed') throw new Error('Death brush: ' + receipt.reason)
    job.particles = receipt.added; job.workPending = false
    finishEmission(job, fx); persist()
  }
  function tickChaos(dt: number) {
    if (talus.sim.paused || match.phase === 'fault') return
    for (const key of [...emissionRegions.keys()]) if (key.startsWith('death:')
      && !match.chaos.jobs.some((job: any) => key === 'death:' + job.id && !job.emissionDone)) releaseEmissionRegion(key)
    if (!match.chaos.jobs.length) { match.chaos.quiet += dt; return }
    match.chaos.quiet = 0
    // Work on a snapshot: blasts may enqueue another death during this pass.
    for (const job of [...match.chaos.jobs]) {
      const fx = chaosCatalog.effects.find((v: any) => v.id === job.effect)
      if (!fx?.enabled) throw new Error('Death effect needs engine support: ' + job.effect)
      const wreck = talus.entities.get(job.owner)?.position
      if (!job.emissionDone && wreck) { job.x = wreck.x; job.y = wreck.y }
      // A stored wreck is not a completed emitter. Only ready native regions
      // advance the finite schedule, draw RNG or consume an emission slot.
      if (!job.emissionDone && ['spray', 'shells', 'magazine'].includes(fx.mode) && !chaosRegionReady(job, fx)) continue
      job.elapsed += dt
      if (!job.started) {
        job.started = true
        record('chaos-started', { id: job.id, effect: fx.id, x: job.x, y: job.y })
        if (fx.mode === 'brush') {
          job.workPending = true; run(() => deathBrush(job, fx))
        }
        if (fx.mode === 'magazine') {
          // One hundred real projectile launches and detonations, in one tick.
          for (let n = 0; n < fx.count; n++) chaosShell(job, {}, true)
          finishEmission(job, fx)
        }
      }
      if (!job.emissionDone && !job.workPending) {
        const total = fx.mode === 'shells' ? fx.count : Math.ceil(fx.duration / fx.interval)
        while (job.emitted < total && job.emitted * fx.interval <= job.elapsed) {
          const n = job.emitted
          if (fx.mode === 'spray') {
            const placed = talus.world.spawnParticles({ element: fx.element,
              x: job.x, y: job.y - 26, count: fx.count, vx: 0, vy: -fx.speed,
              spread: fx.spread, speedJitter: .3 })
            if (!(placed > 0)) throw new Error('Death spray placed no particles: ' + job.effect + ' pulse ' + n)
            job.particles += placed; if (placed > 0) job.livePulses++
            if (fx.ignite && n % 3 === 0) job.particles += talus.world.spawnParticles({
              element: 'FIRE', x: job.x, y: job.y - 30, count: 8, vx: 0, vy: -80, spread: 1 })
          } else {
            const angle = fx.pattern === 'radial' ? n * Math.PI * 2 / total : -Math.PI + chaosRandom() * Math.PI
            const rain = fx.pattern === 'rain', bounce = fx.pattern === 'bounce'
            chaosShell(job, { x: rain ? job.x + (chaosRandom() - .5) * 360 : job.x,
              y: rain ? Math.max(40, job.y - 300) : job.y - 26,
              vx: rain ? (chaosRandom() - .5) * 60 : Math.cos(angle) * fx.speed,
              vy: rain ? fx.speed : Math.sin(angle) * fx.speed,
              independent: true,
              ...(bounce ? { bouncing: 6, detonate: { fuse: 2.5, atLifetime: true } } : {}) })
          }
          job.emitted++
        }
        if (job.elapsed >= fx.duration || fx.mode === 'shells' && job.emitted >= total && !fx.finishBlast) finishEmission(job, fx)
      }
      if (job.emissionDone && job.projectileIds.length === 0) {
        record('chaos-ended', { id: job.id, effect: job.effect, elapsed: job.elapsed,
          launched: job.launched, ended: job.ended, particles: job.particles, livePulses: job.livePulses })
        match.chaos.jobs = match.chaos.jobs.filter((v: any) => v.id !== job.id)
      } else if (job.elapsed > fx.duration + 12) {
        throw new Error('Death projectile did not resolve: ' + job.effect)
      }
    }
    persist()
  }
  function aim(): boolean {
    const e = entity(current())
    return !!e?.isLive && e.weapon.aim(-Number(e.blackboard.get('custom.angle')) * Math.PI / 180,
      Number(e.blackboard.get('custom.power')) / 100)
  }
  function adjust(angle: number, power: number) {
    if (!human()) return
    const e = entity(current())
    const oldAngle = Number(e.blackboard.get('custom.angle')), oldPower = Number(e.blackboard.get('custom.power'))
    const newAngle = Math.round(clamp(oldAngle + angle, -90, 270) * 10) / 10
    const newPower = Math.round(clamp(oldPower + power, 1, 100) * 10) / 10
    e.blackboard.set('custom.angle', newAngle); e.blackboard.set('custom.power', newPower)
    if (!itemById(current().weaponId)?.noCombatRewards) {
      if (oldAngle !== newAngle) reward(current(), 'aim')
      if (oldPower !== newPower) reward(current(), 'power')
    }
    aim()
  }
  let cameraIntent: { key: string, id: number, x?: number, y?: number } | null = null
  function trackCamera(target: { entity: EntityLike } | { point: Vec2 }, key: string): CameraTracking {
    const state = talus.camera.tracking, point = 'point' in target ? target.point : null
    if (cameraIntent?.key === key && state?.id === cameraIntent.id && state.phase !== 'held'
      && (!point || point.x === cameraIntent.x && point.y === cameraIntent.y)) return state
    const next = talus.camera.track(target, { tolerance: 12, maxSpeed: 2400, smoothSeconds: .32, whilePaused: false })
    cameraIntent = { key, id: next.id, ...(point ? { x: point.x, y: point.y } : {}) }
    return next
  }
  function cameraTank(p: any): CameraTracking {
    return trackCamera({ entity: p.entityId }, 'tank:' + p.entityId)
  }
  function cameraPoint(point: Vec2, key: string): CameraTracking {
    return trackCamera({ point: { x: point.x, y: point.y } }, key)
  }
  const cameraArrived = (state: CameraTracking) => state.phase === 'arrived' && state.ready
  function holdCamera() {
    if (cameraIntent) talus.camera.hold()
    cameraIntent = null
  }
  function applyBattlefieldPolicy() {
    if (match.cameraPolicyVersion === 1) return
    const before = match.bounds
    match.bounds = { ...arena.bounds }; match.cameraPolicyVersion = 1
    // M5's compact spawn strip was also the kill/movement rectangle. Expand
    // only the rules; saved positions, terrain and elimination history survive.
    match.frameNotice = ''
    talus.ui.set('frameNotice', '')
    record('battlefield-expanded', { before, bounds: match.bounds })
    persist()
  }
  function movementVelocity(x: number, requested: number, dt: number) {
    const left = match.bounds.x + arena.combat.tankHalfWidth
    const right = match.bounds.x + match.bounds.w - arena.combat.tankHalfWidth
    if (dt <= 0) return 0
    // Stop the hull at the map boundary; permit inward movement from an edge.
    return requested < 0 ? Math.max(requested, Math.min(0, (left - x) / dt))
      : Math.min(requested, Math.max(0, (right - x) / dt))
  }
  async function focus() {
    const p = current(), tank = entity(p)
    let preparedLiveId: number | null = null, waitingTicks = 0
    while (waitingTicks < 1800) {
      if (p !== current() || p.eliminated || match.phase === 'fault') return false
      // Death presentations temporarily own the camera. Resume this journey
      // afterward rather than fighting them with per-tick center commands.
      if (!presenting()) {
        waitingTicks++
        const state = cameraTank(p)
        if (tank?.isLive && cameraArrived(state)) {
          if (preparedLiveId !== tank.liveId) { syncLoadout(p); preparedLiveId = tank.liveId }
          if (aim()) {
            nameplate(p); autoDefend(p)
            record('turn-camera-arrived', { owner: p.entityId, tracking: state.id, center: state.center, liveId: tank.liveId })
            return true
          }
        }
      }
      await talus.sleepTicks(1)
    }
    throw new Error('Camera, terrain or tank weapon did not become ready: ' + p.name)
  }
  function eliminate(p: any, reason: string, killerId?: string | null, at?: { x: number | null, y: number | null }) {
    if (p.eliminated || match.phase === 'finished') return
    accountSupply(p)
    p.eliminated = true
    const killer = match.roster.find((r: any) => r.entityId === killerId)
    if (killer && killer !== p) killer.kills++
    reward(p, 'death'); if (killer) reward(killer, 'kill')
    queuePresentation(p, 'death', at)
    // A killed tank cannot complete a queued weapon cast. Advance its turn;
    // a shell already in flight still owns its normal impact/settle path.
    if (p === current() && match.phase === 'firing') {
      match.phase = 'turn'; match.waitTicks = 0
    }
    record('eliminated', { name: p.name, reason, killer: killer?.name || null }); persist(); publish()
  }
  function checkRoster() {
    if (!match || match.phase === 'deploying') return
    const b = match.bounds
    for (const p of match.roster) {
      if (p.eliminated || !p.entityId) continue
      const e = entity(p), s = e?.snapshot()
      if (e?.residency === 'destroyed' || s?.alive === false) { eliminate(p, 'destroyed'); continue }
      // Unresolved is missing data, not a death. Normal stored snapshots still
      // carry the authoritative parked pose/vitals and follow the same bounds.
      if (!s) continue
      p.lastKnownPosition = { x: s.x, y: s.y }
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
    if (match.phase === 'finished') return true
    const alive = match.roster.filter((p: any) => !p.eliminated)
    if (alive.length > 1) return false
    if (presenting() || match.attack || match.chaos.jobs.length || match.chaos.quiet < chaosCatalog.resultQuietSeconds) {
      match.phase = 'aftermath'; input(false)
      match.message = 'Last tank standing… waiting for the chain reaction'
      persist(); publish(); return true
    }
    if (alive[0]) reward(alive[0], 'win')
    match.phase = 'finished'; match.winner = alive[0]?.name || null
    settleWallets()
    input(false)
    match.message = match.winner ? match.winner + ' wins the match' : 'No tanks remain — draw'
    const scores: any = talus.installed.get('indigo.scores') || { players: {}, matches: {} }
    if (!scores.matches[talus.world.id]) {
      for (const p of match.roster) {
        const key = p.name.toLowerCase(), s = (Object.hasOwn(scores.players, key) ? scores.players[key] : null) || { name: p.name, games: 0, wins: 0, kills: 0 }
        s.games++; s.kills += p.kills; if (p.name === match.winner) s.wins++
        for(const field of ['shots','hits','damage','damageTaken'])s[field]=(s[field]||0)+(p[field]||0)
        s.earned=(s.earned||0)+p.cashEarned
        scores.players = { ...scores.players, [key]: s }
      }
      scores.matches[talus.world.id] = { winner: match.winner, seed: match.seed }
      scoreSeries(scores)
      talus.installed.set('indigo.scores', scores)
    }
    talus.ui.set('scores', Object.values(scores.players))
    persist(); publish(); record('finished', { winner: match.winner })
    run(async () => {
      await turnScoreCard()
      if (match.phase !== 'finished') return
      await showArcadeCard(match.winner ? 'VICTORY OVERDRIVE' : 'MUTUALLY ASSURED NONSENSE',
        match.series?.complete ? match.series.champion : match.winner || 'NO SURVIVORS', 'Round ' + match.round + ' · Seed ' + match.seed, 3)
      publish()
    })
    return true
  }
  function passivePosture(p: any) {
    const e = entity(p)
    if (p.eliminated || e?.residency === 'destroyed') return
    if (!e?.isLive) {
      if (!p.passivePosturePending) { p.passivePosturePending = true; persist() }
      pendingTankReady.add(p.entityId)
      return
    }
    const receipt = e.controller.setPosture({ ...arena.posture.controller, mode: 'passive' })
    // Native rejection is explicit (unsupported/dead/invalid), not a reason to
    // keep resetting the same posture every tick. Only residency is deferred.
    if (p.passivePosturePending) { delete p.passivePosturePending; persist() }
    if (!receipt.accepted) record('posture-refused', { owner: p.entityId, mode: 'passive', receipt })
  }
  function flipUpright(p: any): boolean {
    const e = entity(p)
    if (!active() || p !== current() || p.eliminated || !e?.isLive || !e.alive) return false
    if (talus.sim.clock - (p.lastFlipAt ?? -Infinity) < arena.posture.flipCooldownSeconds) return false
    const receipt = e.controller.setPosture({ ...arena.posture.controller, mode: 'upright' })
    record('flip-upright', { owner: p.entityId, control: p.control, receipt, pose: e.snapshot() })
    if (receipt.accepted) {
      p.lastFlipAt = talus.sim.clock
      match.message = p.name + ' is righting — movement and firing remain available'
      persist(); publish()
    }
    return receipt.accepted
  }
  async function preparePlacement(p: any): Promise<void> {
    const e = entity(p)
    if (match.phase !== 'deploying' || p.eliminated || !e?.isLive || !e.alive) return
    const receipt = e.controller.setPosture({ ...arena.posture.controller, mode: 'upright' })
    // Best effort only. A slope, blocked pose or unsupported controller must
    // never make deployment wait forever or prevent a tank from playing.
    let waited = 0
    while (receipt.accepted && waited < arena.posture.placementWaitTicks
      && match.phase === 'deploying' && !p.eliminated && e.isLive && e.alive) {
      const status = e.controller.posture?.status
      if (status !== 'moving' && status !== 'pending') break
      await talus.sleepTicks(6); waited += 6
    }
    p.placementReady = true
    record('placement-ready', { owner: p.entityId, receipt, waited, pose: e.snapshot(), posture: e.controller.posture })
    passivePosture(p)
    persist()
  }
  function supplyState() {
    return match.supplies ||= { rng: chaosSeed(String(match.seed) + ':supplies'), checked: null, active: null, crates: [] }
  }
  function supplyRandom() {
    const state = supplyState(); let x = state.rng
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    state.rng = x >>> 0; return state.rng / 4294967296
  }
  function supplyLabel(crate: any, at: Vec2 | null) {
    talus.ui.worldText('supply:' + crate.id, at ? { at, text: '↓ ' + itemById(crate.item).name,
      offset: { x: 0, y: -38 }, size: 18, color: '#70f8a0', outline: '#10102a', background: '#10102acc', maxWidth: 280 } : null)
  }
  function claimSupply(crate: any, p: any) {
    bank.supplyClaims ||= {}; const claims = bank.supplyClaims[talus.world.id] ||= {}
    if (!Object.hasOwn(claims, crate.id)) {
      const w = wallet(p), item = itemById(crate.item), supply = item.grants?.item || item.id
      w.stock[supply] = owned(p, supply) + crate.units; w.revision++
      // Grant and receipt share one installed write, including across an old
      // save being reopened. Selection and paid ammunition are left untouched.
      claims[crate.id] = { player: playerKey(p), item: supply, units: crate.units }
      saveBank()
      record('supply-collected', { id: crate.id, name: p.name, item: supply, units: crate.units })
      match.message = p.name + ' recovered ' + crate.units + ' × ' + item.name
      syncLoadout(p)
    }
    crate.state = 'collected'; supplyLabel(crate, null); persist()
    const body = talus.bodies.get(crate.bodyId)
    if (body?.exists) body.destroy()
  }
  function tickSupplies() {
    if (!supplyCatalog || !match.supplies) return
    let changed = false
    for (const crate of match.supplies.crates) {
      if (!crate.bodyId) continue
      const body = talus.bodies.get(crate.bodyId), at = body?.snapshot()
      if (crate.state === 'collected') { if (body?.exists) body.destroy(); continue }
      if (crate.state === 'lost') continue
      if (!at || at.y > match.bounds.y + match.bounds.h || at.x < match.bounds.x || at.x > match.bounds.x + match.bounds.w) {
        crate.state = 'lost'; supplyLabel(crate, null); if (body?.exists) body.destroy()
        record('supply-lost', { id: crate.id }); changed = true; continue
      }
      // Parked bodies retain their position but are not collectible until the
      // real tank/body are resident together. Never pull remote inventory in.
      supplyLabel(crate, body!.isLive ? at : null)
      if (supplySequence || presenting() || !['turn', 'ready', 'settling'].includes(match.phase) || !body!.isLive || Math.abs(at.vy) > 45) continue
      const nearby = match.roster.filter((p: any) => !p.eliminated && entity(p)?.isLive)
        .map((p: any) => ({ p, at: entity(p).snapshot()! }))
        .filter((v: any) => Math.hypot(v.at.x - at.x, v.at.y - at.y) <= supplyCatalog.pickupRadius)
        .sort((a: any, b: any) => Math.hypot(a.at.x - at.x, a.at.y - at.y) - Math.hypot(b.at.x - at.x, b.at.y - at.y) || a.p.index - b.p.index)
      if (nearby[0]) { claimSupply(crate, nearby[0].p); changed = true }
    }
    // Keep the last few terminal receipts for diagnosis, not every crate in a
    // long match. The installed claim ledger still protects older saved games.
    const live = match.supplies.crates.filter((c: any) => !['collected', 'lost'].includes(c.state))
    const done = match.supplies.crates.filter((c: any) => ['collected', 'lost'].includes(c.state)).slice(-8)
    match.supplies.crates = [...live, ...done]
    if (changed) { persist(); publish() }
  }
  async function watchSupply(crate: any) {
    if (supplySequence) return
    supplySequence = true; input(false); persist()
    try {
      match.message = 'SUPPLY DROP · ' + itemById(crate.item).name; publish()
      if (!crate.bodyId) {
        let ready = false
        for (let n = 0; n < supplyCatalog.cameraWaitTicks && match.phase === 'focusing'; n++) {
          if (!presenting() && cameraArrived(cameraPoint(crate.spawn, 'supply-arrival'))) { ready = true; break }
          await talus.sleepTicks(1)
        }
        if (!ready) { crate.state = 'lost'; record('supply-cancelled', { id: crate.id, reason: 'camera-region-not-ready' }); return }
        // Recover an already-created authored body if an interrupted script
        // retained the native body but not the immediately following state write.
        const name = 'Supply ' + crate.id
        let body = talus.bodies.find({ includeStored: true }).find(b => b.name === name)
        if (!body) {
          const cells: Array<{ x: number; y: number; element: string }> = []
          for (let y = 0; y < supplyCatalog.crateHeight; y++) for (let x = 0; x < supplyCatalog.crateWidth; x++) {
            const band = y < 2 || y >= supplyCatalog.crateHeight - 2 || x < 2 || x >= supplyCatalog.crateWidth - 2 || Math.abs(x - supplyCatalog.crateWidth / 2) < 2
            cells.push({ x: Math.round(crate.spawn.x + x - supplyCatalog.crateWidth / 2), y: Math.round(crate.spawn.y + y - supplyCatalog.crateHeight / 2), element: band ? 'IRON' : 'WOOD' })
          }
          body = await talus.bodies.create({ cells, name, kind: 'dynamic' }) || undefined
        }
        if (!body) { crate.state = 'lost'; record('supply-cancelled', { id: crate.id, reason: 'native-body-empty' }); return }
        crate.bodyId = body.id; crate.state = 'falling'; crate.watchStarted = talus.sim.clock; persist()
        record('supply-spawned', { id: crate.id, bodyId: body.id, item: crate.item, units: crate.units, at: crate.spawn })
      }
      const until = talus.sim.clock + supplyCatalog.maxFlightSeconds
      while (match.phase === 'focusing' && talus.sim.clock < until) {
        const body = talus.bodies.get(crate.bodyId), at = body?.snapshot()
        if (!at || ['lost', 'collected'].includes(crate.state)) break
        if (!presenting()) cameraPoint(at, 'supply-flight')
        supplyLabel(crate, at)
        if (talus.sim.clock - (crate.watchStarted || 0) > .6 && (at.sleeping || Math.abs(at.vy) < 6 && talus.world.groundY(at.x, at.y + supplyCatalog.crateHeight / 2, 8) !== null)) break
        await talus.sleepTicks(1)
      }
      if (!['lost', 'collected'].includes(crate.state)) crate.state = 'available'
      record('supply-watch-ended', { id: crate.id, state: crate.state })
    } finally {
      supplyState().active = null; supplySequence = false; persist()
    }
  }
  async function maybeSupplyDrop(boundary: 'round' | 'turn') {
    if (!supplyCatalog || supplySequence || match.phase !== 'focusing') return
    const state = supplyState(), key = boundary + ':' + (boundary === 'round' ? match.round : match.turnNumber)
    if (state.checked === key) return
    state.checked = key
    const roll = supplyRandom(), chance = boundary === 'round' ? supplyCatalog.roundChance : supplyCatalog.turnChance
    persist()
    if (roll >= chance || state.crates.filter((c: any) => !['lost', 'collected'].includes(c.state)).length >= supplyCatalog.maxActive) return
    const options = supplyCatalog.contents.filter((c: any) => itemById(c.item)?.enabled && !unlimited(c.item))
    if (!options.length) return
    let draw = supplyRandom() * options.reduce((sum: number, c: any) => sum + c.weight, 0)
    const content = options.find((c: any) => (draw -= c.weight) < 0) || options[options.length - 1]
    const anchor = targetSnapshot(current()); if (!anchor) return
    // Candidate columns are near the next pilot, not on top of a tank. The
    // native durable surface query sees saved terrain beyond the current view.
    let spawn: Vec2 | null = null
    for (let n = 0; n < 6 && !spawn; n++) {
      const x = Math.round(clamp(anchor.x + (supplyRandom() < .5 ? -1 : 1) * (100 + supplyRandom() * 220), match.bounds.x + 48, match.bounds.x + match.bounds.w - 48))
      if (match.roster.some((p: any) => { const at = targetSnapshot(p); return at && Math.abs(at.x - x) < 70 })) continue
      const ground = await talus.world.findSurface(x, match.bounds.y, match.bounds.h)
      if (ground === null || ground < match.bounds.y + 70) continue
      spawn = { x, y: Math.max(match.bounds.y + 24, ground - supplyCatalog.height) }
    }
    if (match.phase !== 'focusing') { persist(); return }
    if (!spawn) { record('supply-cancelled', { boundary, reason: 'no-safe-column' }); persist(); return }
    const crate = { id: key, item: content.item, units: content.units, spawn, bodyId: null, state: 'incoming' }
    state.crates.push(crate); state.active = crate.id; persist()
    record('supply-selected', { id: crate.id, roll, chance, item: crate.item, at: spawn })
    await watchSupply(crate)
  }
  async function beginTurn(next: boolean) {
    if (['focusing', 'refocusing', 'positioning', 'deploying', 'finished', 'fault'].includes(match.phase)) return
    if (presenting()) { match.pendingTurn = next; return }
    match.pendingTurn = null
    input(false); match.phase = 'focusing'; persist(); checkRoster()
    if (finish()) return
    const previous = current()
    if (next) await turnScoreCard()
    else if (!match.turnNumber) await showArcadeCard('SCORCHED EARTH 2026', 'BATTLE STATIONS', 'Round ' + match.round + ' · Seed ' + match.seed, 2.5)
    if (match.phase !== 'focusing') return
    checkRoster(); if (finish()) return
    if (next && !previous.eliminated) passivePosture(previous)
    if (next) do { match.focusIndex = (match.focusIndex + 1) % match.roster.length } while (current().eliminated)
    autoDefend()
    match.turnNumber++; match.remaining = match.turnSeconds; match.shotId = null; match.impact = null
    match.message = 'Loading ' + current().name; persist(); publish()
    await maybeSupplyDrop(next ? 'turn' : 'round')
    if (match.phase !== 'focusing' || finish()) return
    const ready = await focus()
    if (match.phase !== 'focusing') return
    if (ready && !current().eliminated) {
      await showArcadeCard('TURN ' + match.turnNumber + ' / COMMAND CARTRIDGE', current().name, current().control==='cpu' ? (personaFor(current())?.factionName || 'CPU')+' · '+(match.cpuSkill==='persona'?personaFor(current())?.skill:match.cpuSkill||personaFor(current())?.skill) : 'Your controller. Your crater.', 1, current().color)
      // A death can borrow the camera while this card is hidden. Its earlier
      // arrival is no longer sufficient to hand input/CPU work to this tank.
      if (match.phase !== 'focusing') return
      checkRoster(); if (finish()) return
      const restored = await focus()
      if (match.phase !== 'focusing' || finish()) return
      if (!restored || current().eliminated) { match.phase = 'turn'; run(() => beginTurn(true)); return }
      if (match.phase === 'focusing') startTurn()
    }
    else { match.phase = 'turn'; run(() => beginTurn(true)) }
  }
  function autoDefend(player?: any) {
    if (!match || !bank) return
    for (const p of player ? [player] : match.roster) {
      if (p.eliminated || !p.entityId) continue
      const ledger = tankUtilityLedger(p)
      // Old saves used one global receipt. They must never replay a round's
      // activation, even if a component is now empty or manually switched off.
      if (match.autoDefenseChecked === true || p.autoDefenseChecked || ledger.autoDefenseChecked) {
        if (!ledger.autoDefenseChecked) { ledger.autoDefenseChecked = true; saveBank() }
        p.autoDefenseChecked = true
        continue
      }
      const e = entity(p)
      if (!e?.isLive || !e.alive) continue
      syncUtilities(p)
      let activated = false, refused = false
      for (const kind of owned(p, 'auto-defense') >= 1 ? ['shield', 'deflector'] as const : []) {
        const state = e.defenses.state?.[kind]
        if (state && !state.active && state.remaining > 0) {
          const accepted = e.defenses.activate(kind, true).accepted
          activated = accepted || activated; refused = !accepted || refused
        }
      }
      if (!activated && refused) continue // Native readiness refusal spends nothing.
      ledger.autoDefenseChecked = true; p.autoDefenseChecked = true
      if (activated) {
        wallet(p).stock['auto-defense']--; wallet(p).revision++
      }
      saveBank(); persist()
      if (activated) record('utility', { name: p.name, item: 'auto-defense' })
    }
  }
  function startTurn() {
    match.phase = 'turn'; match.message = current().control === 'human' ? 'Position, aim and fire' : 'Computer is choosing its shot'
    current().turnStartCash = current().cashEarned; current().turnStartKills = current().kills
    reward(current(), 'turn'); current().lastMoveX = entity(current()).x
    input(current().control === 'human')
    entity(current()).blackboard.set('custom.turn', match.turnNumber)
    if(current().control==='human'&&!match.roster.some((r:any)=>r.entityId===current().targetId&&!r.eliminated)) { const target=match.roster.find((r:any)=>r!==current()&&!r.eliminated);if(target)selectTarget(current(),target.entityId) }
    persist(); publish(); record('turn', { name: current().name, id: current().entityId })
    if (!exitDrain && current().control === 'cpu') run(()=>prepareCpuTurn(current(),match.turnNumber))
  }
  async function fire() {
    if (!active() || current().eliminated) return
    const p = current(), e = entity(p); if (!e.isLive) return
    const item = itemById(p.weaponId)
    if (item.behavior?.mode.startsWith('battery') && owned(p, 'battery') < 1) {
      if (p.control === 'cpu') chooseWeapon(p, 'standard')
      else { match.message = 'This weapon also needs one Battery'; publish(); return }
    }
    input(false)
    aim(); match.phase = 'telegraph'; match.waitTicks = 0
    const s = e.snapshot()!; e.setVelocity(0, s.vy)
    queuePresentation(p, 'shooting'); persist(); publish()
  }
  function performAttack(p: any) {
    const e = entity(p), s = e.snapshot()!
    if (!e.isLive || !s?.alive) { checkRoster(); return }
    aim(); p.shotFrom = { x: s.x, y: s.y }
    match.phase = 'firing'; match.waitTicks = 0; match.message = 'Firing'
    match.attack = { owner: p.entityId, item: p.weaponId, damageBefore: p.damage || 0, rootId: null, ids: {},
      launched: 0, ended: 0, emitted: 1, tasks: 0, pending: [], launchClock: null, spent: false, lastPoint: null,
      angle: e.weapon.state!.angle, power: Number(e.blackboard.get('custom.power')), origin: null }
    record('fire-request', { owner: e.id, item: itemById(p.weaponId).id, template: itemById(p.weaponId).template, actualEquipped: e.weapon.state?.equipped, stock: unlimited(p.weaponId) ? 'unlimited' : owned(p,p.weaponId), angle: e.blackboard.get('custom.angle'), power: e.blackboard.get('custom.power') })
    if (!e.weapon.fire()) fail('Cannon did not accept the trigger')
  }
  function attackShell(at: any, spec: any, depth = 1) {
    const a = match.attack
    if (!a) throw new Error('No attack for secondary warhead')
    childDepth = depth
    try {
      const shell = talus.projectiles.launch({ kind: 'rigid-body', element: 'IRON', owner: a.owner,
        x: at.x, y: at.y, vx: at.vx || 0, vy: at.vy || 0,
        bodySizePx: 4, gravityScale: 1, drag: 0, lifetime: 8, independent: true,
        damage: 55, damageType: 'blast', aoeRadius: 80, carveRadius: 32, carveMode: 'erase',
        ...spec, detonate: { ...(spec.detonate ?? { onBody: true, onTerrain: true, atLifetime: true }), looseMatter: market.looseMatter } })
      if (!shell) throw new Error('Secondary projectile launch refused')
      return shell
    } finally { childDepth = 0 }
  }
  function splitAttack(entry: any, position: any, behavior: any) {
    const a = match.attack
    entry.split = true
    for (let n = 0; n < behavior.count; n++) {
      const apex = behavior.mode === 'apex'
      const angle = -Math.PI + chaosRandom() * Math.PI
      const vx = apex ? Number(position.vx ?? entry.vx ?? 0) + (n - (behavior.count - 1) / 2) * behavior.spread : Math.cos(angle) * behavior.speed
      const vy = apex ? 40 + Math.abs(n - (behavior.count - 1) / 2) * 12 : Math.sin(angle) * behavior.speed
      attackShell({ x: position.x, y: position.y - 8, vx, vy }, { damage: behavior.childDamage,
        aoeRadius: behavior.childRadius, carveRadius: behavior.childCarve }, 1)
    }
    record('warheads-split', { weapon: a.item, count: behavior.count, mode: behavior.mode, x: position.x, y: position.y })
  }
  function materialRecipe(element: string) {
    return { id: 'indigo-payload-' + element.toLowerCase(), name: element + ' payload', description: 'Native material payload', tags: ['payload'],
      macro: { mode: 'volumetric', support: 'none', strata: [{ element, thickness: [1, 1] }] },
      micro: { noise: { algorithm: 'simplex', frequency: .08, octaves: 3, persistence: .5, lacunarity: 2 } } }
  }
  async function deposit(a: any, at: any, behavior: any) {
    a.tasks++
    try {
      const radius = behavior.radius, x = Math.round(at.x), y = Math.round(at.y - radius / 2)
      const cells = radius * radius * 4
      const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius },
        simulationRegion: { x: x - radius - 32, y: y - radius - 32, w: radius * 2 + 64, h: radius * 2 + 256 },
        bounds: { ...arena.bounds, h: 1024 }, replacement: 'empty', budget: { cells, particles: cells, work: cells },
        recipe: materialRecipe(behavior.element) as TerrainRecipe, seed: chaosSeed(match.seed + ':' + a.rootId), holdSeconds: 1 })
      record('material-payload', { weapon: a.item, element: behavior.element, x, y, receipt })
      if (receipt.status !== 'completed') throw new Error(a.item + ' payload: ' + receipt.reason)
      if (behavior.ignite) {
        const fire = await talus.world.terrainWork({ kind: 'recipe', shape: { x: x - 8, y: y - radius - 5, w: 16, h: 4 },
          bounds: arena.bounds, replacement: 'empty', budget: { cells: 64, particles: 64, work: 64 },
          recipe: materialRecipe('FIRE') as TerrainRecipe, seed: chaosSeed(match.seed + ':ignition:' + a.rootId), holdSeconds: .25 })
        record('payload-ignited', { weapon: a.item, receipt: fire })
        if (fire.status !== 'completed') throw new Error('Ignition: ' + fire.reason)
      }
    } finally { a.tasks-- }
  }
  async function terrainPayload(a: any, at: any, b: any) {
    a.tasks++
    try {
      const origin = b.origin === 'launch' ? a.origin : at
      const x = Math.round(origin.x), y = Math.round(origin.y)
      const direction = { x: Math.cos(a.angle), y: Math.sin(a.angle) }
      const tip = { x: x + direction.x * b.length, y: y + direction.y * b.length }
      const shape: TerrainShape = b.shape === 'wedge' ? { kind: 'polygon', points: [
        { x, y }, { x: tip.x - direction.y * b.width / 2, y: tip.y + direction.x * b.width / 2 },
        { x: tip.x + direction.y * b.width / 2, y: tip.y - direction.x * b.width / 2 },
      ] } : { x, y, radius: b.radius }
      const points = 'points' in shape ? shape.points : [{ x:x-b.radius,y:y-b.radius },{ x:x+b.radius,y:y+b.radius }]
      const x0=Math.floor(Math.min(...points.map(p=>p.x))),y0=Math.floor(Math.min(...points.map(p=>p.y)))
      const w=Math.ceil(Math.max(...points.map(p=>p.x)))-x0,h=Math.ceil(Math.max(...points.map(p=>p.y)))-y0
      const halo=b.operation==='fracture'?1:0,cells=(w+halo*2)*(h+halo*2)
      const floorY=arena.terrain.solidBottomTileRow*arena.tiles.chunksPerTile*64
      const bounds={...arena.bounds,h:floorY}
      const receipt=await talus.world.terrainWork({kind:b.operation,shape,bounds,
        simulationRegion:{x:x0-halo,y:y0-halo,w:w+halo*2,h:h+halo*2+128},
        replacement:b.replacement,
        materials:b.materials.map((m:any)=>{
          const element = talus.elements.get(m.name)
          if (!element) throw new Error('Terrain material is missing: ' + m.name)
          return {element:element.id,hardness:m.hardness}
        }),
        budget:{cells,particles:cells,work:cells*Math.max(1,...b.materials.map((m:any)=>m.hardness))},
        ...(b.operation==='recipe'?{recipe:materialRecipe(b.element) as TerrainRecipe}:{}),
        ...(b.operation==='fracture'?{fracture:b.fracture}:{}),
        seed:chaosSeed(match.seed+':terrain:'+a.rootId),holdSeconds:b.holdSeconds})
      record('terrain-payload',{weapon:a.item,template:itemById(a.item).template,owner:a.owner,origin,angle:a.angle,shape,receipt})
      const owner=match.roster.find((p:any)=>p.entityId===a.owner)
      if(receipt.status==='completed' && receipt.accepted>0 && owner) cpuProgress(owner,'terrain-work',{item:a.item,accepted:receipt.accepted,work:receipt.work})
      else record('terrain-no-progress',{weapon:a.item,owner:a.owner,status:receipt.status,reason:receipt.reason,accepted:receipt.accepted||0})
      if(receipt.status!=='completed') {match.message='Terrain work refused: '+receipt.reason;publish()}
    } finally {a.tasks--}
  }
  function tickAttack() {
    if (talus.sim.paused || match.phase === 'fault') return
    const a = match.attack
    if (!a || a.rootId == null) { releaseEmissionRegions('burst:'); return }
    const item = itemById(a.item), b = item.behavior
    const burstKey = 'burst:' + a.rootId
    for (const key of [...emissionRegions.keys()]) if (key.startsWith('burst:') && key !== burstKey) releaseEmissionRegion(key)
    if (b?.mode === 'burst' && a.emitted < b.count) {
      const p = match.roster.find((r: any) => r.entityId === a.owner), tank = entity(p)
      const clock = talus.sim.clock, elapsed = Math.max(0, clock - (a.burstClock ?? a.launchClock))
      a.burstClock = clock
      if (p.eliminated || tank?.alive === false || tank?.residency === 'destroyed') {
        record('burst-cancelled', { owner: a.owner, remaining: b.count - a.emitted, reason: 'shooter-died' })
        a.emitted = b.count; releaseEmissionRegion(burstKey)
      } else if (emissionRegionReady(burstKey, { follow: tank, halfWidth: 64, halfHeight: 64,
        label: 'terra-burst-' + a.rootId }, false, !!tank?.isLive)) {
        a.burstElapsed = (a.burstElapsed || 0) + elapsed
        if (a.burstElapsed >= a.emitted * b.interval) {
          const angle = -Number(tank.blackboard.get('custom.angle')) * Math.PI / 180 + (chaosRandom() - .5) * b.jitter * 2
          const spec = item.projectile, pos = tank.position!, count = spec.projectilesPerShot || 1
          for (let n = 0; n < count; n++) attackShell({ x: pos.x + Math.cos(angle) * spec.spawnOffset,
            y: pos.y + Math.sin(angle) * spec.spawnOffset, vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed },
            { ...spec, projectilesPerShot: 1, element: spec.material || 'IRON' }, 1)
          a.emitted++
        }
      }
    }
    if (b?.mode !== 'burst' || a.emitted >= b.count) releaseEmissionRegion(burstKey)
    if (b?.mode === 'apex') {
      const entry = a.ids[a.rootId], projectile = talus.projectiles.get(a.rootId), s = projectile?.snapshot()
      if (entry && s && !entry.split) {
        if (entry.vy < 0 && s.vy >= 0) { splitAttack(entry, s, b); projectile!.remove() }
        else entry.vy = s.vy
      }
    }
    for (const job of a.pending.splice(0)) {
      if (job.kind === 'cluster') splitAttack(job.entry, job.at, b)
      if (job.kind === 'leap') attackShell({ x: job.at.x, y: job.at.y - 12, vx: job.vx, vy: -260 },
        { damage: 70, aoeRadius: 95, carveRadius: 42 }, job.depth + 1)
      if (job.kind === 'deposit') run(() => deposit(a, job.at, b))
      if (job.kind === 'terrain') run(() => terrainPayload(a, job.at, b))
      if (job.kind === 'sand') run(() => deposit(a, job.at, { element: 'SAND', radius: 64 }))
    }
    const emitting = b?.mode === 'burst' && a.emitted < b.count
    if (!emitting && !Object.keys(a.ids).length && !a.pending.length && !a.tasks) {
      record('attack-resolved', { weapon: a.item, launched: a.launched, ended: a.ended })
      match.impact = a.lastPoint; match.attack = null; shot = null; match.shotId = null
      run(settle)
    } else {
      const id = Object.keys(a.ids).map(Number).find(id => talus.projectiles.get(id)?.exists)
      if (id !== undefined) { shot = talus.projectiles.get(id); match.shotId = id }
    }
  }
  function cpuPlan(e: any) {
    if (!active() || (current().control !== 'cpu' && current().autoAimTurn !== match.turnNumber) || e.id !== current().entityId || e.turn !== match.turnNumber) return
    const p = current(), tank = entity(p), origin = tank.position!
    if (p.plannedTurn === match.turnNumber) return
    p.plannedTurn = match.turnNumber
    if (p.control === 'cpu' && (tank.health ?? 100) <= 70) useBattery(p)
    syncLoadout(p)
    const targets = match.roster.filter((r: any) => r !== p && targetSnapshot(r))
    // Nearby weak opponents take priority; a new target never inherits the previous target's range error.
    const priority = (r: any) => { const s = targetSnapshot(r)!; return Math.abs(s.x - origin.x) + (s.health ?? 100) * 3 }
    targets.sort((a: any, b: any) => (p.control==='human'&&a.entityId===p.targetId?-Infinity:priority(a)) - (p.control==='human'&&b.entityId===p.targetId?-Infinity:priority(b)))
    if (!targets.length) { checkRoster(); finish(); return }
    const target = targetSnapshot(targets[0])!
    const carrier = itemById(p.weaponId).behavior?.mode === 'apex'
    p.targetId = targets[0].entityId; p.tactic = carrier ? 'Surveyed carrier clearance to apex' : 'Surveyed ballistic corridor'
    tank.blackboard.set('custom.indigoTarget', targetReference(targets[0], target))
    tank.blackboard.set('custom.carrierToApex', carrier)
    persist(); publish(); record('cpu-plan', { name: p.name, target: targets[0].name, distance: Math.abs(target.x - origin.x), elevation: origin.y - target.y, carrier })
  }
  function cpuAimed(e: any) {
    if (!active() || (current().control !== 'cpu' && current().autoAimTurn !== match.turnNumber) || e.id !== current().entityId || e.turn !== match.turnNumber) return
    const p = current(), tank = entity(p)
    if (p.aimedTurn === match.turnNumber) return
    const angle = Number(tank.blackboard.get('custom.aimAngle')), power = Number(tank.blackboard.get('custom.aimPower'))
    if (!Number.isFinite(angle) || !Number.isFinite(power)) throw new Error('Ballistic graph returned invalid aim')
    tank.blackboard.set('custom.angle', -angle * 180 / Math.PI)
    tank.blackboard.set('custom.power', clamp(power * 100, 1, 100))
    if (p.autoAimTurn === match.turnNumber) {
      p.autoAimTurn = null
      wallet(p).stock['lazy-boy'] = Math.max(0, owned(p, 'lazy-boy') - 1); wallet(p).revision++; saveBank()
      reward(p, 'utility'); record('utility', { name: p.name, item: 'lazy-boy', angle, power })
      match.message = 'Lazy Boy set your angle and power. Fire when ready.'
    }
    p.aimedTurn = match.turnNumber; aim(); persist(); publish()
    reward(p, 'aim'); reward(p, 'power')
    record('cpu-aimed', { name: p.name, angle: tank.blackboard.get('custom.angle'), power: tank.blackboard.get('custom.power'), tactic: p.tactic,
      origin: tank.position, target: tank.blackboard.get('custom.indigoTarget'), weapon: tank.weapon.state, plan: tank.blackboard.get('custom.aimPlan') })
  }
  async function settle() {
    const p = match.impact; if (!p) throw new Error('Missing impact resolution point')
    match.phase = 'settling'; match.message = 'Letting the impact settle'; persist(); publish()
    if (!presenting()) cameraPoint(p, 'impact')
    // Powders can remain active indefinitely. End the presentation wait after
    // a bounded interval; the terrain continues simulating on the next turn.
    const result = await talus.world.watchSettle({ x: p.x - 192, y: p.y - 128, w: 384, h: 384 },
      { minTicks: 60, maxTicks: arena.impactWaitTicks ?? 180 }).done
    record('settled', result)
    checkRoster(); if (!finish()) await beginTurn(true)
  }
  function configureGeneration(mode: string) {
    if (mode !== 'brush') {
      if (mode !== 'wfc') {
        arena.surfaceBand = { top: 256, height: 800 }
        arena.biome = { id: mode, name: mode.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '), areaId: null }
      }
      return
    }
    const offset = arena.generation.brushOriginX
    arena.bounds.x += offset; arena.combat.x += offset
    arena.biome = { id: 'brush-reach', name: 'Brush Reach', areaId: null }
    arena.surfaceBand = { top: 384, height: 512 }
  }
  function generationChoices(ids: string[], count: number, label: string, weights?: Record<string, number>): string[] {
    if (!ids.length) throw new Error('Empty project preset family: ' + label)
    const out: string[] = []
    for (let cycle = 0; out.length < count; cycle++) {
      const bag = [...ids].sort()
      let rng = chaosSeed(match.seed + ':' + label + ':' + cycle)
      if (weights) {
        // Exponential ranks give a weighted permutation without replacement.
        // Every family member stays in every full bag; affinities only affect
        // which members are likely to appear in this round's bounded prefix.
        const ranked = bag.map(id => {
          const weight = Object.hasOwn(weights, id) ? weights[id] : 1
          if (!Number.isFinite(weight) || weight <= 0) throw new Error('Preset weight must be positive: ' + label + '/' + id)
          rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5
          return { id, rank: -Math.log(((rng >>> 0) + .5) / 4294967296) / weight }
        }).sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        bag.splice(0, bag.length, ...ranked.map(r => r.id))
      } else {
        // Preserve the exact pre-story sequence for saves/configurations that
        // did not opt into authored landscape stories.
        for (let i = bag.length - 1; i > 0; i--) {
          rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5
          const j = (rng >>> 0) % (i + 1); [bag[i], bag[j]] = [bag[j], bag[i]]
        }
      }
      if (out.length && bag.length > 1 && bag[0] === out[out.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]]
      out.push(...bag.slice(0, count - out.length))
    }
    return out
  }
  async function prepareProcedural() {
    if (match.generationVersion !== 12) return
    const config = generationRecipes.catalog
    const catalog = (await talus.world.resources.catalogs()).find(c => c.id === config.id)
    if (!catalog || catalog.hash !== (match.procedural?.hash || config.hash))
      throw new Error('The saved procedural catalog is missing or changed; restore its pinned resources')
    if (match.procedural) return
    const checks = await talus.world.resources.validate(catalog.id)
    const failures = checks.filter(c => !c.ok || c.runtime?.supported === false)
    if (failures.length) throw new Error('Project preset preflight: ' + failures.map(c => c.id + ': ' + (c.error || c.runtime?.reason)).join('; '))
    const ids = (kind: ResourceKind) => catalog.manifest.entries.filter(e => e.kind === kind).map(e => e.id)
    let story: any = null
    const storyWeights: Record<string, Record<string, number>> = {}
    if (config.storyFile) {
      const document: any = JSON.parse(await talus.files.readText(config.storyFile) || 'null')
      if (!document || document.version !== 1 || !Array.isArray(document.themes) || !document.themes.length)
        throw new Error('Invalid landscape story document: ' + config.storyFile)
      const baseWeight = Number(document.selection?.baseWeight), affinityBonus = Number(document.selection?.affinityBonus)
      if (!Number.isFinite(baseWeight) || baseWeight <= 0 || !Number.isFinite(affinityBonus) || affinityBonus < 0)
        throw new Error('Landscape stories require positive baseline and nonnegative affinity weights')
      const themeIds = document.themes.map((t: any) => t.id)
      if (themeIds.some((id: any) => typeof id !== 'string' || !id) || new Set(themeIds).size !== themeIds.length)
        throw new Error('Landscape story IDs must be unique nonempty strings')
      const label = 'landscape-story:' + document.version
      const themeId = generationChoices(themeIds, 1, label)[0]
      const theme = document.themes.find((t: any) => t.id === themeId)
      const sites = Number(document.placement?.sitesPerMap), central = Number(document.placement?.centralSites)
      if (!Number.isInteger(sites) || sites < 1 || sites > 16 || !Number.isInteger(central) || central < 0 || central > sites)
        throw new Error('Landscape story placement must use 1..16 bounded sites')
      if (!Array.isArray(theme.motifs) || !theme.motifs.length
        || new Set(theme.motifs.map((m: any) => m.id)).size !== theme.motifs.length
        || theme.motifs.some((m: any) => typeof m.id !== 'string' || !m.id
          || !['counterweight', 'spillway', 'fuel-cell'].includes(m.kind) || !m.parameters))
        throw new Error('Invalid native motif definitions for landscape story ' + themeId)
      const affinities: Record<string, string[]> = {}
      // These are immutable world-file snapshots copied into this game, not
      // editor/global defaults. Read metadata once, then retain only selected
      // IDs and compact policy. Pinned catalogs remain the native payload source.
      const documents = [
        ['noise', 'Game/Presets/noise.json', 'presets'], ['semantic', 'Game/Presets/semantic.json', 'recipes'],
        ['growth', 'Game/Presets/living.json', 'presets'], ['vector', 'Game/Presets/vectors.json', 'shapes'],
        ['neural', 'Game/Presets/neural.json', 'models'],
      ] as const
      for (const [kind, path, key] of documents) {
        const snapshot: any = JSON.parse(await talus.files.readText(path) || 'null')
        if (!Array.isArray(snapshot?.[key])) throw new Error('Missing story preset metadata: ' + path)
        const records = new Map<string, any>(snapshot[key].map((r: any) => [r.id, r]))
        const words = theme.affinities?.[kind] ?? []
        if (!Array.isArray(words) || words.some((w: any) => typeof w !== 'string'))
          throw new Error('Invalid story affinities: ' + themeId + '/' + kind)
        const keywords = [...new Set<string>(words.map((w: string) => w.trim().toLowerCase()).filter(Boolean))]
        if (kind !== 'neural') affinities[kind] = keywords
        const weights: Record<string, number> = {}
        for (const id of ids(kind)) {
          const record = records.get(id)
          if (!record) throw new Error('Story metadata lacks pinned resource: ' + kind + '/' + id)
          const text = [record.id, record.name, record.description, record.group, ...(record.tags || [])].join(' ').toLowerCase()
          weights[id] = baseWeight + affinityBonus * keywords.filter(word => text.includes(word)).length
        }
        if (keywords.length) storyWeights[kind] = weights
      }
      const motifIds = generationChoices(theme.motifs.map((m: any) => m.id), sites, 'story-motifs:' + themeId)
      story = { id: themeId, name: theme.name, description: theme.description, version: document.version,
        sourceFile: config.storyFile, seed: chaosSeed(match.seed + ':' + label + ':0'),
        selection: { baseWeight, affinityBonus }, affinities, placement: { sitesPerMap: sites, centralSites: central },
        motifs: motifIds.map((id, siteIndex) => {
          const motif = theme.motifs.find((m: any) => m.id === id)
          return { id, name: motif.name, kind: motif.kind, parameters: JSON.parse(JSON.stringify(motif.parameters)),
            requires: [...(motif.requires || [])], siteIndex, central: siteIndex < central,
            seed: chaosSeed(match.seed + ':story-motif:' + themeId + ':' + siteIndex) }
        }) }
    }
    const choices: Record<string, string[]> = {}
    for (const kind of ['noise', 'semantic', 'neural', 'growth', 'vector'] as const)
      choices[kind] = generationChoices(ids(kind), kind === 'neural' ? 17 : kind === 'vector' ? config.structures : 50, kind, storyWeights[kind])
    const modelAnchors: Record<string, string[]> = {}
    for (const id of ids('neural')) {
      const model: any = await talus.world.resources.read(catalog.id, 'neural', id)
      const anchors = model.architecture.anchors.map((a: any) => a.id).filter((id: string) => ids('semantic').includes(id))
      modelAnchors[id] = generationChoices(anchors, 17, 'neural-anchor:' + id, storyWeights.semantic)
    }
    choices.neuralRecipe = choices.neural.map((id, n) => modelAnchors[id][n])
    const growthPolicies: Record<string, any> = {}
    for (const id of ids('growth')) {
      const preset: any = await talus.world.resources.read(catalog.id, 'growth', id)
      growthPolicies[id] = { stroke: preset.stroke, startTubes: preset.sheet.startTubes,
        tubesPerStep: preset.sheet.tubesPerStep, lengthMax: preset.sheet.lengthMax, timed: preset.sheet.timeClip,
        endTime: preset.sheet.endTime, flowing: preset.sheet.flowSpeed > 0 }
    }
    if (!ids('vector').includes('builtin:flower')) throw new Error('The project flower mask is missing')
    const structures = ids('noise').filter(id => /(wood|plank|crate|concrete|brick|metal|steel|stone|rock|marble|tarmac|corrugat)/i.test(id))
    choices.structureTexture = generationChoices(structures, config.structures, 'structure-texture', storyWeights.noise)
    match.procedural = { version: 1, detailMaterialPolicy: 1, catalog: catalog.id, hash: catalog.hash, choices, growthPolicies, sites: [], completed: {}, receipts: [], ...(story ? { story } : {}) }
    persist(); record('generation-catalog', { catalog: catalog.id, hash: catalog.hash, choices, ...(story ? { story: { id: story.id, version: story.version } } : {}) })
  }
  function storyMacroPlan() {
    const plan = match.procedural, story = plan?.story
    if (!story) return null
    if (plan.macro) {
      if (plan.macro.version !== 1 || plan.macro.storyId !== story.id) throw new Error('Unsupported saved story geometry')
      return plan.macro
    }
    if (plan.sites.length || Object.values(plan.completed).some(n => Number(n) > 0))
      throw new Error('Start a new match to adopt story geometry; this saved map already has decoration')
    // These are authored game silhouettes. Native polygon/line kernels do the
    // rasterization and material work; the script only supplies control points.
    const styles: Record<string, { material: string, loose: string, levels: number[], forms: string[] }> = {
      'last-pumping-station': { material: 'CONCRETE', loose: 'GRAVEL', levels: [768, 768, 608, 608, 816, 832, 688, 704], forms: ['reservoir', 'ruin', 'trench'] },
      'nine-floors-below': { material: 'BASALT', loose: 'ASH', levels: [464, 464, 568, 568, 680, 696, 816, 832], forms: ['cave', 'bench', 'crevasse'] },
      'drowned-cathedral': { material: 'LIMESTONE', loose: 'SAND', levels: [528, 584, 784, 816, 656, 512, 608, 800], forms: ['vault', 'cave', 'basin'] },
      'black-gold-graveyard': { material: 'CONCRETE', loose: 'GRAVEL', levels: [704, 704, 816, 800, 608, 608, 768, 832], forms: ['reservoir', 'trench', 'ruin'] },
      'city-that-fell-sideways': { material: 'CONCRETE', loose: 'DIRT', levels: [480, 496, 768, 624, 640, 832, 560, 736], forms: ['ruin', 'ruin', 'bench'] },
      'furnace-garden': { material: 'STONE', loose: 'DIRT', levels: [688, 592, 512, 608, 736, 816, 752, 656], forms: ['vault', 'basin', 'ruin'] },
      'glacier-boiler-room': { material: 'ICE', loose: 'SNOW', levels: [768, 576, 432, 624, 816, 704, 480, 592], forms: ['crevasse', 'cave', 'basin'] },
      'hanging-quarry': { material: 'GRANITE', loose: 'GRAVEL', levels: [448, 448, 576, 576, 704, 704, 832, 832], forms: ['bench', 'cave', 'bench'] },
      'storm-collector': { material: 'STONE', loose: 'GRAVEL', levels: [448, 512, 576, 608, 704, 752, 816, 736], forms: ['reservoir', 'basin', 'trench'] },
      'world-beneath-landfill': { material: 'STONE', loose: 'DIRT', levels: [656, 704, 608, 736, 688, 768, 624, 720], forms: ['cave', 'ruin', 'cave'] },
    }
    const style = styles[story.id]
    if (!style) throw new Error('Missing macro geometry for landscape story ' + story.id)
    const left = arena.bounds.x, right = left + arena.bounds.w, start = arena.combat.x, end = start + arena.combat.w
    const seed = story.seed, phase = (seed % 628) / 100
    const xs = [left, right, start - 128, start, start + 256, start + 512, start + 768, end, end + 128]
    for (let x = left, n = 0; x < right; n++) {
      x = Math.min(right, x + 192 + chaosSeed(seed + ':macro-width:' + n) % 161)
      xs.push(x)
    }
    const nodes = [...new Set<number>(xs.filter(x => x >= left && x <= right))].sort((a, b) => a - b).map((x, n) => {
      const hash = chaosSeed(seed + ':macro-height:' + x)
      const broad = style.levels[(Math.floor(n / 2) + seed % style.levels.length) % style.levels.length]
      const outer = broad + hash % 33 - 16
      // Keep a broad connected air band over the central action, with actual
      // unequal ground heights rather than flattening a perfect firing tunnel.
      const central = 744 + Math.sin((x - start) / 190 + phase) * 26 + Math.cos((x - start) / 310 + phase) * 14
      const distance = x < start - 64 ? start - 64 - x : x > end + 64 ? x - end - 64 : 0
      const blend = clamp(distance / 256, 0, 1)
      return { x, y: Math.round(clamp(central * (1 - blend) + outer * blend, 416, 864)) }
    })
    const surfaceAt = (x: number) => {
      const i = Math.max(0, nodes.findIndex((p, n) => n < nodes.length - 1 && p.x <= x && nodes[n + 1].x >= x))
      const a = nodes[i], b = nodes[i + 1]
      return Math.round(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x))
    }
    const centers = [.075, .22, .36, null, null, .66, .81, .935].map((fraction, n) => {
      const hash = chaosSeed(seed + ':macro-form:' + n), shoulder = fraction === null
      const x = shoulder ? (n === 3 ? start - 180 : end + 180) + hash % 17 - 8
        : left + Math.floor(arena.bounds.w * fraction!) + hash % 129 - 64
      return { x, ground: surfaceAt(x), kind: style.forms[n % style.forms.length], seed: hash,
        width: shoulder ? 192 + hash % 25 : 256 + hash % 129, depth: 80 + (hash >>> 8) % 113 }
    })
    plan.macro = { version: 1, storyId: story.id, seed, material: style.material, loose: style.loose, nodes, forms: centers }
    persist()
    return plan.macro
  }
  function storyMacroJobs() {
    const macro = storyMacroPlan()
    if (!macro) return []
    const jobs: Array<{ shape: TerrainShape, element: string, mixed: boolean, form: string }> = []
    const add = (shape: TerrainShape, element: string, form: string, mixed = false) => jobs.push({ shape, element, mixed, form })
    const polygon = (points: Vec2[], element: string, form: string, mixed = false) => add({ kind: 'polygon', points }, element, form, mixed)
    for (let x = arena.bounds.x; x < arena.bounds.x + arena.bounds.w; x += 512) {
      const w = Math.min(512, arena.bounds.x + arena.bounds.w - x)
      add({ x, y: 896, w, h: 128 }, macro.material, 'substrate', true)
      add({ x, y: 0, w, h: 384 }, 'EMPTY', 'upper-sky')
    }
    for (let i = 0; i < macro.nodes.length - 1; i++) {
      const a = macro.nodes[i], b = macro.nodes[i + 1]
      polygon([a, b, { x: b.x, y: 896 }, { x: a.x, y: 896 }], macro.material, 'profile-fill', true)
      polygon([{ x: a.x, y: 384 }, { x: b.x, y: 384 }, b, a], 'EMPTY', 'profile-air')
    }
    for (const f of macro.forms) {
      const x = f.x, ground = f.ground, half = Math.floor(f.width / 2), material = macro.material
      const floor = Math.min(976, ground + f.depth), roof = Math.min(floor - 40, ground + 40)
      if (f.kind === 'cave') {
        // An irregular buried chamber, open only through later excavation.
        polygon([{ x: x - half, y: roof + 20 }, { x: x - half + 40, y: roof }, { x: x + half - 32, y: roof + 12 },
          { x: x + half, y: floor - 20 }, { x: x + half - 48, y: floor }, { x: x - half + 24, y: floor - 8 }], 'EMPTY', 'buried-void')
      } else if (f.kind === 'crevasse') {
        add({ kind: 'polyline', points: [{ x: x - 24, y: ground - 20 }, { x: x + 18, y: ground + 52 },
          { x: x - 8, y: Math.min(952, ground + f.depth + 52) }], width: 22 + f.seed % 21 }, 'EMPTY', 'ice-rock-fissure')
      } else if (f.kind === 'basin' || f.kind === 'trench') {
        const depth = Math.min(f.depth, 944 - ground)
        polygon([{ x: x - half, y: ground - 24 }, { x: x + half, y: ground - 16 },
          { x: x + half - 44, y: ground + depth }, { x: x - half + 36, y: ground + depth - 12 }], 'EMPTY', f.kind)
      } else if (f.kind === 'bench') {
        polygon([{ x: x - half, y: ground - 28 }, { x: x + half, y: ground - 8 },
          { x: x + half, y: ground + 64 }, { x: x - half, y: ground + 64 }], 'EMPTY', 'quarry-bench')
      } else {
        const height = Math.min(112 + f.seed % 97, Math.max(32, ground - 400)), top = ground - height
        const lean = f.kind === 'ruin' ? (f.seed & 1 ? 24 : -24) : 0
        polygon([{ x: x - half, y: ground + 24 }, { x: x + half, y: ground + 24 },
          { x: x + half + lean, y: top }, { x: x - half + lean, y: top }], material, f.kind + '-shell')
        if (f.kind === 'reservoir') {
          polygon([{ x: x - half + 20, y: top - 2 }, { x: x + half - 20, y: top - 2 },
            { x: x + half - 28, y: ground - 16 }, { x: x - half + 28, y: ground - 16 }], 'EMPTY', 'reservoir-bowl')
        } else if (f.kind === 'vault') {
          const spring = top + Math.min(60, Math.floor(height * .55)), crown = top + Math.min(24, Math.floor(height * .2))
          polygon([{ x: x - half + 24, y: ground + 8 }, { x: x - half + 24, y: spring },
            { x: x - 32, y: crown }, { x: x + 40, y: crown },
            { x: x + half - 24, y: spring }, { x: x + half - 24, y: ground + 8 }], 'EMPTY', 'masonry-vault')
        } else {
          const sill = top + Math.max(6, Math.floor(height / 3))
          polygon([{ x: x - half + 24 + lean, y: sill }, { x: x + half - 28 + lean, y: sill + Math.min(8, Math.floor(height / 8)) },
            { x: x + half - 32, y: ground - Math.min(20, Math.floor(height / 4)) },
            { x: x - half + 28, y: ground - Math.min(12, Math.floor(height / 5)) }], 'EMPTY', 'ruin-opening')
        }
      }
    }
    return jobs
  }
  async function generateStoryMacro() {
    if (!match.procedural?.story) return
    const plan = match.procedural, jobs = storyMacroJobs(), macro = plan.macro
    const signature = chaosSeed(JSON.stringify(jobs))
    if (macro.signature !== undefined && macro.signature !== signature) throw new Error('Saved macro geometry no longer matches its generation version')
    if (macro.signature === undefined) { macro.signature = signature; macro.jobs = jobs.length; persist() }
    const materials = talus.elements.list().filter(e => e.id > 0).map(e => ({ element: e.id, hardness: 1 }))
    for (let n = plan.completed.macro || 0; n < jobs.length; n++) {
      const job = jobs[n], shape = job.shape
      const points = 'points' in shape ? shape.points : null
      const pad = 'width' in shape ? Math.ceil(shape.width / 2) + 1 : points ? 1 : 0
      const box = points ? { w: Math.ceil(Math.max(...points.map(p => p.x))) - Math.floor(Math.min(...points.map(p => p.x))) + pad * 2,
        h: Math.ceil(Math.max(...points.map(p => p.y))) - Math.floor(Math.min(...points.map(p => p.y))) + pad * 2 } : shape as Rect
      if (box.w > 512 || box.h > 512) throw new Error('Story macro exceeds a native job region: ' + job.form)
      const cells = box.w * box.h
      const recipe = materialRecipe(job.element)
      if (job.mixed) recipe.micro.noise = { algorithm: 'simplex', frequency: .023, octaves: 3, persistence: .5, lacunarity: 2,
        bands: [{ element: macro.material, endPos: .72 }, { element: macro.loose, endPos: .9 }, { element: macro.loose === 'SNOW' ? 'SNOW' : 'SAND', endPos: 1 }] } as any
      await commitProcedural('macro', n, { kind: 'recipe', catalog: plan.catalog, shape,
        bounds: { ...arena.bounds, h: 1024 }, targetLayer: 'world', layerPolicy: 'active-only',
        replacement: job.element === 'EMPTY' ? 'matching' : 'eligible', materials,
        recipe: recipe as TerrainRecipe, geometry: { origin: { x: arena.bounds.x + arena.bounds.w / 2, y: 640 }, radius: arena.bounds.w / 2 },
        seed: macro.seed, budget: { cells, particles: cells, work: cells } }, { story: macro.storyId, form: job.form })
    }
    record('generation-story-macro', { story: macro.storyId, jobs: jobs.length, profilePoints: macro.nodes.length })
  }
  async function prepareProceduralSites() {
    const plan = match.procedural
    if (plan.sites.length) return
    // Survey once before decoration. Later families use the same actual base
    // surface, not the canopy or boulder deposited by an earlier pass.
    const sites = []
    for (let n = 0; n < 50; n++) {
      const hash = chaosSeed(match.seed + ':site:' + n)
      const x = Math.floor(arena.bounds.x + 128 + n * 256 + (hash % 49) - 24)
      const ground = await talus.world.findSurface(x, arena.surfaceBand.top, arena.surfaceBand.height)
      if (ground === null) throw new Error('No terrain for procedural site ' + n)
      sites.push({ x, ground, size: 64 + hash % 65 })
    }
    plan.sites = sites; persist()
  }
  function proceduralBudget(shape: Rect) {
    const cells = shape.w * shape.h, particles = Math.min(262144, cells * 3), pixels = cells * 2
    return { cells, particles, pixels, work: particles + pixels }
  }
  function bodyPlacement(shape: Rect, offsets: Vec2[]) {
    // Author only a bounded search envelope. Native E51 tests the exact
    // generated members against fresh matter/owners and translates them once.
    const xs = [0, ...offsets.map(p => p.x)], ys = [0, ...offsets.map(p => p.y)]
    const width = shape.w + Math.max(...xs) - Math.min(...xs)
    const height = shape.h + Math.max(...ys) - Math.min(...ys)
    if (!offsets.length || offsets.length > 8 || width > 512 || height > 512)
      throw new Error('Landscape body placement exceeds the native search envelope')
    const members = shape.w * shape.h
    return { placement: { offsets, maxChecks: members * offsets.length },
      budget: { cells: width * height, particles: members, work: members } }
  }
  function requireProceduralReceipt(family: string, n: number, spec: TerrainWorkSpec, receipt: TerrainWorkReceipt, detail: any = {}) {
    let reason = receipt.status === 'completed' ? null : receipt.reason || receipt.status
    if (!reason && spec.vector?.output.kind === 'body') {
      const placement = receipt.placement
      if (!placement?.selected || !(placement.cells > 0)) reason = 'incomplete-native-body-placement-receipt'
      else if (spec.placement?.preview ? !placement.preview || receipt.accepted !== 0
        : placement.preview || !(receipt.accepted > 0) || !receipt.bodies?.length)
        reason = 'native-body-placement-made-no-progress'
    }
    if (!reason) return
    match.procedural.lastFailure = { family, n, ...detail, reason, receipt }
    persist(); record('generation-refused', { family, n, ...detail, reason, receipt })
    throw new Error(family + ' ' + n + ': ' + reason)
  }
  async function commitProcedural(family: string, n: number, spec: TerrainWorkSpec, detail: any = {}) {
    const plan = match.procedural
    if ((plan.completed[family] || 0) > n) return
    match.message = family + ' · ' + (n + 1); publish()
    const receipt = await talus.world.terrainWork(spec)
    requireProceduralReceipt(family, n, spec, receipt, detail)
    plan.completed[family] = n + 1
    plan.receipts.push({ family, n, id: receipt.id, accepted: receipt.accepted, pixels: receipt.pixels || 0,
      bodies: receipt.bodies || [], organisms: receipt.organisms || [], liveGrowth: receipt.liveGrowth || null,
      ...(receipt.placement ? { placement: receipt.placement } : {}) })
    if (plan.lastFailure?.family === family && plan.lastFailure.n === n) delete plan.lastFailure
    persist(); record('generation-native', { family, n, ...detail, receipt })
  }
  async function generateCatalogDetails() {
    await prepareProceduralSites()
    const plan = match.procedural, bounds = { ...arena.bounds, h: 1024 }
    if (plan.detailMaterialPolicy !== undefined && plan.detailMaterialPolicy !== 1)
      throw new Error('Unsupported saved detail material policy: ' + plan.detailMaterialPolicy)
    const materialNames = new Set<string>(['DIRT', 'SAND', 'STONE',
      ...(plan.detailMaterialPolicy === 1 && plan.macro ? [plan.macro.material, plan.macro.loose] : [])])
    const materials = [...materialNames].map(name => {
      const element = typeof name === 'string' && name ? talus.elements.get(name) : null
      if (!element || !Number.isInteger(element.id) || element.id <= 0) throw new Error('Unknown detail material: ' + name)
      return { element: element.id, hardness: 1 }
    })
    for (const family of ['noise', 'semantic', 'neural']) {
      const count = family === 'neural' ? 17 : 50
      for (let n = plan.completed[family] || 0; n < count; n++) {
        const site = plan.sites[family === 'neural' ? n * 3 : n], hash = chaosSeed(match.seed + ':' + family + ':' + n)
        const size = family === 'noise' ? 192 : site.size
        const shape = { x: site.x - Math.floor(size / 2), y: Math.floor(site.ground - size / 3), w: size, h: size }
        const preset = family === 'neural' ? { kind: 'semantic' as const, id: plan.choices.neuralRecipe[n] }
          : { kind: family as 'noise' | 'semantic', id: plan.choices[family][n] }
        const spec: TerrainWorkSpec = { kind: 'recipe', catalog: plan.catalog, preset, shape, bounds,
          targetLayer: 'world', layerPolicy: 'authored', replacement: 'eligible', materials,
          budget: proceduralBudget(shape), seed: hash }
        if (family === 'noise') spec.stroke = {
          shape: { kind: 'vector', id: plan.choices.vector[n % plan.choices.vector.length] },
          path: [{ x: site.x - 24, y: site.ground }, { x: site.x + 24, y: site.ground - 8 + hash % 17 }],
          size: 32 + hash % 21, spacingPx: 12, rotationDeg: hash % 360,
          spinDeg: (hash & 1 ? 1 : -1) * (8 + (hash >>> 8) % 33),
          sizeLfo: { amplitudePx: 6 + (hash >>> 16) % 11, frequencyHz: .5 + (hash % 16) / 10 },
          budget: { stamps: 16, sampleCells: 1000000 },
        }
        if (family === 'neural') spec.neural = { modelId: plan.choices.neural[n], steps: generationRecipes.neural.steps, tintStrength: generationRecipes.neural.tintStrength }
        await commitProcedural(family, n, spec, { preset: preset.id, model: spec.neural?.modelId, x: site.x, size })
      }
    }
    match.details = 50; persist()
  }
  function structureMaterial(id: string): string {
    if (/(wood|plank|crate)/i.test(id)) return 'WOOD'
    if (/(concrete|brick)/i.test(id)) return 'CONCRETE'
    if (/(metal|steel|corrugat)/i.test(id)) return 'IRON'
    return 'STONE'
  }
  async function generateStructures() {
    const plan = match.procedural
    if (!plan) return
    const count = plan.choices.vector.length
    for (let n = plan.completed.structures || 0; n < count; n++) {
      const site = plan.sites[Math.floor(n * 50 / count)], hash = chaosSeed(match.seed + ':structure:' + n)
      const texture = plan.choices.structureTexture[n], material = structureMaterial(texture)
      const width = 48 + hash % 97, height = material === 'WOOD' ? 10 + (hash >>> 8) % 15 : 28 + (hash >>> 8) % 45
      const rotation = (hash >>> 16) % 91 - 45
      // The entire rotated silhouette starts above the surveyed ground and is
      // allowed to fall normally. Native overlap/capacity refusal is explicit.
      const radius = Math.ceil(Math.hypot(width, height) / 2)
      const surfaces = []
      for (let dx = -radius; dx <= radius; dx += 8) {
        const y = await talus.world.findSurface(site.x + dx, arena.surfaceBand.top, arena.surfaceBand.height)
        if (y !== null) surfaces.push(y)
      }
      if (!surfaces.length) throw new Error('Structure has no ground at site ' + n)
      const center = { x: site.x, y: Math.floor(Math.min(...surfaces) - radius - 24) }
      const shape = { x: center.x - 128, y: center.y - 128, w: 256, h: 256 }
      const geometry: TerrainVectorSpec['geometry'] = n % 3 === 0
        ? { kind: 'line', points: [{ x: center.x - width / 2, y: center.y - height / 2 },
          { x: center.x + width / 2, y: center.y + height / 2 }], width: material === 'WOOD' ? height : 12 + hash % 17 }
        : { kind: 'vector', id: n % 3 === 1 ? 'builtin:square' : plan.choices.vector[n], center, width, height, rotationDeg: rotation }
      const side = hash & 1 ? 1 : -1
      const placement = bodyPlacement(shape, [{ x: 0, y: 0 }, { x: 0, y: -32 },
        { x: side * 48, y: -32 }, { x: -side * 48, y: -32 }, { x: 0, y: -64 },
        { x: side * 96, y: -64 }, { x: -side * 96, y: -64 }, { x: 0, y: -112 }])
      await commitProcedural('structures', n, { kind: 'vector', catalog: plan.catalog, shape, ...placement,
        bounds: { ...arena.bounds, h: 1024 }, replacement: 'empty', layerPolicy: 'active-only', targetLayer: 'world',
        seed: hash, vector: { geometry, fill: { kind: 'noise', id: texture, element: material },
          output: { kind: 'body', name: material + ' landscape prop', maxBodies: 32, friction: .7, restitution: .03 } } },
        { texture, material, geometry })
    }
  }
  function storyAssemblyJobs(motif: any, origin: Vec2): { label: string, spec: TerrainWorkSpec }[] {
    const plan = match.procedural, p = motif.parameters, d = p.dimensions, jobs: { label: string, spec: TerrainWorkSpec }[] = []
    const put = (label: string, geometry: TerrainVectorSpec['geometry'], material: string, body = false) => {
      let box: Rect
      if (geometry.kind === 'line') {
        const xs = geometry.points.map(v => v.x), ys = geometry.points.map(v => v.y), margin = Math.ceil(geometry.width / 2) + 2
        const x = Math.floor(Math.min(...xs) - margin), y = Math.floor(Math.min(...ys) - margin)
        box = { x, y, w: Math.ceil(Math.max(...xs) + margin) - x + 1, h: Math.ceil(Math.max(...ys) + margin) - y + 1 }
      } else {
        const a = geometry.rotationDeg * Math.PI / 180
        const w = Math.ceil(Math.abs(Math.cos(a) * geometry.width) + Math.abs(Math.sin(a) * geometry.height)) + 4
        const h = Math.ceil(Math.abs(Math.sin(a) * geometry.width) + Math.abs(Math.cos(a) * geometry.height)) + 4
        box = { x: Math.floor(geometry.center.x - w / 2), y: Math.floor(geometry.center.y - h / 2), w: w + 1, h: h + 1 }
      }
      const texture = plan.choices.structureTexture.find((id: string) => structureMaterial(id) === material)
      jobs.push({ label, spec: { kind: 'vector', catalog: plan.catalog, shape: box,
        bounds: { ...arena.bounds, h: 1024 }, replacement: 'empty', targetLayer: 'world', layerPolicy: 'active-only',
        seed: chaosSeed(motif.seed + ':' + label), ...(body ? bodyPlacement(box, [{ x: 0, y: 0 }]) : { budget: proceduralBudget(box) }), vector: { geometry,
          fill: texture && body ? { kind: 'noise', id: texture, element: material } : { kind: 'element', element: material },
          output: body ? { kind: 'body', name: motif.name + ' · ' + label, maxBodies: 4, friction: .65, restitution: .02 } : { kind: 'particles' } } } })
    }
    const line = (label: string, x1: number, y1: number, x2: number, y2: number, width: number, material: string) =>
      put(label, { kind: 'line', points: [{ x: origin.x + x1, y: origin.y + y1 }, { x: origin.x + x2, y: origin.y + y2 }], width }, material)
    const support = (label: string, x: number, top: number, width: number, material: string) => {
      const bottom = motif.supportDepths?.[String(x)]
      if (!Number.isFinite(bottom)) throw new Error('Missing surveyed support for ' + motif.name + '/' + x)
      line(label, x, top, x, bottom, width, material)
    }
    const box = (label: string, x: number, y: number, width: number, height: number, material: string, body = false, rotation = 0, id = 'builtin:square') =>
      put(label, { kind: 'vector', id, center: { x: origin.x + x, y: origin.y + y }, width, height, rotationDeg: rotation }, material, body)
    // Supports are ordinary destructible terrain; decks/weights are separate
    // native objects. Contacts, gravity and material reactions own the chain.
    if (motif.kind === 'counterweight') {
      const length = d.deckLength, thickness = d.deckThickness, slope = p.slopeDeg * Math.PI / 180
      // Native lines stamp round caps with this cell-center radius. Separate
      // the entire cap from the rotated underside, not just its center. Four
      // normal pixels cover rounded endpoints/raster edges; gravity closes
      // this small assembly gap after the whole deck has been admitted.
      const capRadius = Math.max(0, Math.ceil(d.supportWidth / 2) - 1), clearance = 4
      for (const x of [-length * .32, length * .32]) {
        const top = -76 + x * Math.tan(slope) + (thickness / 2 + capRadius + clearance) / Math.cos(slope)
        support('trestle-' + x, x, top, d.supportWidth, p.supportMaterial)
      }
      box('inclined deck', 0, -76, length, thickness, p.deckMaterial, true, p.slopeDeg)
      const loadX = -length * .28, loadY = -76 + loadX * Math.tan(slope) - thickness / 2 - d.loadDiameter / 2 - 3
      box('rolling weight', loadX, loadY, d.loadDiameter, d.loadDiameter, p.loadMaterial, true, 0, 'builtin:circle')
      box('breakable chock', loadX + d.loadDiameter / 2 + 6, loadY + 10, 8, 18, p.supportMaterial)
      line('catch ramp', length * .35, -32, length * .72, -8, 8, p.deckMaterial)
      box('impact gate', length * .65, -24, 6, 24, 'GLASS')
      if (p.looseMaterial) box('loose load', -length * .2, -112, 32, 12, p.looseMaterial)
      if (p.secondaryLiquidMaterial) box('thermal pocket', length * .3, -6, 18, 4, p.secondaryLiquidMaterial)
      if (p.ignitionMaterial) box('ignition pocket', length * .65 + 12, -10, 2, 2, p.ignitionMaterial)
    } else {
      // A high reservoir is sealed by a narrow wooden plug. A shot can open it
      // onto a descending conduit and lower catchment, separated from spawns.
      line('reservoir floor', -96, -100, -40, -100, 8, p.deckMaterial)
      line('reservoir plug', -40, -100, -24, -100, 8, p.supportMaterial)
      line('reservoir left wall', -96, -140, -96, -100, 8, p.deckMaterial)
      line('reservoir right wall', -24, -140, -24, -100, 8, p.deckMaterial)
      support('left pier', -88, -96, d.supportWidth, p.supportMaterial)
      support('right pier', -50, -96, d.supportWidth, p.supportMaterial)
      line('spill conduit', -42, -62, 48, -30, 10, p.deckMaterial)
      line('lower basin floor', 30, -2, 112, -2, 8, p.deckMaterial)
      line('lower basin left', 30, -30, 30, -2, 8, p.deckMaterial)
      line('lower basin right', 112, -34, 112, -2, 8, p.deckMaterial)
      support('basin left pier', 30, 0, d.supportWidth, p.deckMaterial)
      support('basin right pier', 112, 0, d.supportWidth, p.deckMaterial)
      if (p.ignitionMaterial) {
        // The fire sits beyond a solid breakable wall; initial oil is contained.
        line('fire separator', 90, -30, 90, -6, 8, p.supportMaterial)
        box('ignition', 102, -8, 1, 1, 'TERRA_FIRE_SOURCE')
      }
      if (p.secondaryLiquidMaterial) box('lower thermal pocket', 68, -8, 28, 4, p.secondaryLiquidMaterial)
      box('reservoir charge', -64, -118, 40, 20, p.liquidMaterial || 'WATER')
      if (p.sourceElement) box('native source', -64, -136, 1, 1,
        p.liquidMaterial === 'CRUDE_OIL' ? 'TERRA_OIL_SOURCE' : p.liquidMaterial === 'LAVA' ? 'TERRA_LAVA_SOURCE' : 'TERRA_WATER_SOURCE')
      if (p.drainElement) box('native drain', 84, -8, 1, 1, 'TERRA_LIQUID_DRAIN')
    }
    return jobs
  }
  async function generateStoryMechanisms() {
    const plan = match.procedural
    if (!plan?.story) return
    for (const motif of plan.story.motifs) {
      const family = 'mechanism-' + motif.siteIndex
      if (!motif.origin) {
        const x = Math.floor(motif.central ? arena.combat.x + arena.combat.w * .54
          : arena.bounds.x + arena.bounds.w * ([.13, .31, .71, .89][(motif.siteIndex - 1) % 4]))
        const surfaces: number[] = []
        for (let dx = -120; dx <= 120; dx += 12) {
          const y = await talus.world.findSurface(x + dx, 256, 768)
          if (y !== null) surfaces.push(y)
        }
        if (!surfaces.length) throw new Error('No support for ' + motif.name)
        // Build above the highest current silhouette; native supports meet that
        // silhouette rather than embedding a rigid load in unknown terrain.
        motif.origin = { x, y: Math.floor(Math.min(...surfaces) - 16) }; persist()
      }
      if (!motif.supportDepths) {
        const xs = motif.kind === 'counterweight' ? [-motif.parameters.dimensions.deckLength * .32, motif.parameters.dimensions.deckLength * .32] : [-88, -50, 30, 112]
        motif.supportDepths = {}
        for (const x of xs) {
          const y = await talus.world.findSurface(Math.round(motif.origin.x + x), 256, 768)
          if (y === null) throw new Error('Missing terrain under ' + motif.name)
          motif.supportDepths[String(x)] = y - motif.origin.y + 4
        }
        persist()
      }
      const jobs = storyAssemblyJobs(motif, motif.origin)
      for (const job of jobs) {
        const material = job.spec.vector!.fill!
        if (material.kind === 'element' && !talus.elements.get(material.element))
          throw new Error('Landscape device/material is not authored: ' + material.element)
      }
      const completed = plan.completed[family] || 0
      // All pending rigid parts must fit at this one persisted assembly pose
      // before adding any supports, contents or devices. Preview is advisory;
      // each normal commit revalidates fresh native occupancy. On resume never
      // preview completed bodies against their own now-persisted owners.
      for (let n = completed; n < jobs.length; n++) {
        const job = jobs[n]
        if (job.spec.vector?.output.kind !== 'body') continue
        const spec: TerrainWorkSpec = { ...job.spec, placement: { ...job.spec.placement!, preview: true } }
        const detail = { story: plan.story.id, motif: motif.id, part: job.label, origin: motif.origin, preview: true }
        const receipt = await talus.world.terrainWork(spec)
        requireProceduralReceipt(family, n, spec, receipt, detail)
        record('generation-placement-preview', { family, n, ...detail, receipt })
      }
      for (let n = completed; n < jobs.length; n++)
        await commitProcedural(family, n, jobs[n].spec, { story: plan.story.id, motif: motif.id, part: jobs[n].label, origin: motif.origin })
    }
  }
  async function generateCatalogLife() {
    const plan = match.procedural, living = generationRecipes.living
    for (let n = plan.completed.growth || 0; n < 50; n++) {
      const site = plan.sites[n], id = plan.choices.growth[n], hash = chaosSeed(match.seed + ':growth:' + n)
      const shape = { x: site.x - 256, y: Math.floor(site.ground - 480), w: 512, h: 512 }
      const policy = plan.growthPolicies[id], requestedSize = 64 + hash % 65
      // Scatter presets scale planting density with the toolbar radius. Bound
      // radius/path length to the native 64-plant operation budget, preserving
      // the authored preset instead of stripping its behavior or skipping it.
      const densityScales = policy.stroke.sizeMode === 'scatter'
        || policy.stroke.sizeMode === 'attribute' && policy.stroke.sizeAttribute === 'tubesPerStep'
      const maxRadius = densityScales ? (64 - policy.startTubes) * policy.stroke.sizeReference / Math.max(policy.tubesPerStep, 1 / policy.stroke.sizeReference) : 128
      const nominalLength = policy.stroke.sizeMode === 'scale' && policy.lengthMax !== undefined
      if (nominalLength && (!Number.isFinite(policy.lengthMax) || policy.lengthMax < 0))
        throw new Error('Invalid saved growth length: ' + id)
      // New plans target nominal trunk/tube length, not the complete crown.
      // Old saved plans lack lengthMax and retain their original brush radius.
      const radius = Math.min(requestedSize / 2, Math.floor(maxRadius),
        nominalLength ? requestedSize * policy.stroke.sizeReference / Math.max(1, policy.lengthMax) : Infinity)
      const density = densityScales ? Math.max(policy.tubesPerStep, 1 / policy.stroke.sizeReference) * radius / policy.stroke.sizeReference : policy.tubesPerStep
      const points = Math.min(16, Math.max(1, Math.ceil((1 - policy.startTubes) / Math.max(.01, density))))
      const path = Array.from({ length: points }, (_, i) => ({ x: site.x - (points - 1) + i * 2, y: site.ground - 1 }))
      await commitProcedural('growth', n, { kind: 'growth', catalog: plan.catalog, shape,
        bounds: { ...arena.bounds, h: 1024 }, replacement: 'empty', targetLayer: 'world', layerPolicy: 'authored',
        seed: hash, budget: proceduralBudget(shape), growth: { presetId: id,
          origin: { x: site.x, y: site.ground }, path,
          radius, steps: living.steps, jobs: 64, fragments: living.fragments,
          ...(policy.timed ? { liveSeconds: Math.min(60, policy.endTime + 1 / 60) } : policy.flowing ? { liveSeconds: 2 } : {}) } },
        { preset: id, requestedSize, size: radius * 2, radius, sizePolicy: nominalLength ? 'nominal-length' : 'toolbar-diameter',
          ...(nominalLength ? { nominalLengthTarget: requestedSize, nominalLengthMax: policy.lengthMax * Math.max(1, radius) / policy.stroke.sizeReference } : {}), x: site.x })
    }
    match.livingSites = 50; persist()
  }
  async function clearWithFlowers() {
    const plan = match.procedural, c = generationRecipes.clearance
    const materials = talus.elements.list().filter(e => e.id > 0).map(e => ({ element: e.id, hardness: 1 }))
    for (let n = plan.completed.clearance || 0; n < match.clearancePath.length; n++) {
      const p = match.clearancePath[n], hash = chaosSeed(match.seed + ':flower:' + n)
      const radius = c.radius[0] + hash % (c.radius[1] - c.radius[0] + 1), amplitude = 8 + (hash >>> 8) % 17
      const reach = radius + amplitude, y = Math.floor(p.y - c.groundBuffer - reach)
      const shape = { x: p.x - reach - 24, y: y - reach, w: 2 * reach + 48, h: 2 * reach }
      await commitProcedural('clearance', n, { kind: 'recipe', catalog: plan.catalog, shape,
        bounds: { ...arena.bounds, h: 1024 }, targetLayer: 'world', layerPolicy: 'active-only', replacement: 'matching', materials,
        budget: proceduralBudget(shape), seed: hash,
        mixture: { recipes: [c.empty, generationRecipes.details[0]],
          weights: [{ anchorId: c.empty.id, w: c.emptyWeight }, { anchorId: generationRecipes.details[0].id, w: 1 - c.emptyWeight }], settings: generationRecipes.semantic },
        stroke: { shape: { kind: 'vector', id: 'builtin:flower' }, path: [{ x: p.x - 24, y }, { x: p.x + 24, y }],
          size: radius, spacingPx: 16, rotationDeg: hash % 360, spinDeg: (hash & 1 ? 1 : -1) * (12 + hash % 31),
          sizeLfo: { amplitudePx: amplitude, frequencyHz: .5 + (hash % 11) / 10 }, budget: { stamps: 8, sampleCells: 2000000 } } }, { shape, radius, amplitude })
    }
    match.cleared = match.clearancePath.length; persist()
  }
  async function generateBrushArena() {
    const columns = arena.bounds.w / 512, jobs: any[] = []
    // Build the complete bottom tile before releasing any loose material.
    const layers = match.procedural?.story ? [[1024, 256, generationRecipes.foundation]] as const
      : [[1024, 256, generationRecipes.foundation], [896, 128, generationRecipes.fill], [384, 512, generationRecipes.surface]] as const
    for (const [y, h, recipe] of layers)
      for (let column = 0; column < columns; column++) jobs.push({ x: arena.bounds.x + column * 512, y, w: 512, h, recipe })
    for (let n = match.generated; n < jobs.length; n++) {
      const { recipe, ...shape } = jobs[n], cells = shape.w * shape.h
      match.message = 'Painting Brush Reach · ' + (n + 1) + ' / ' + jobs.length; publish()
      const receipt = await talus.world.terrainWork({ kind: 'recipe', shape, bounds: arena.bounds,
        replacement: 'empty', budget: { cells, particles: cells, work: cells }, recipe,
        seed: chaosSeed(match.seed + ':brush-reach') })
      if (receipt.status !== 'completed') throw new Error('Brush generation ' + n + ': ' + receipt.reason)
      match.generated = n + 1; persist()
      record('generation-stamp', { n, shape, receipt })
    }
    await generateStoryMacro()
    await prepareClearance()
    await generateBrushDetails()
    await generateStructures()
    await generateLivingArena()
    await clearCombatSpace()
    await generateStoryMechanisms()
    record('generation-complete', { mode: 'brush', jobs: jobs.length + 50 + generationRecipes.living.sites + match.cleared, bounds: arena.bounds })
  }
  async function prepareClearance() {
    if (match.clearancePath) return
    const margin = generationRecipes.living.clearCombatMargin
    const left = arena.combat.x - margin, right = arena.combat.x + arena.combat.w + margin
    const path: Vec2[] = []
    for (let x = left; ; x = Math.min(right, x + generationRecipes.clearance.spacing)) {
      const ground = await talus.world.findSurface(x, arena.surfaceBand.top, arena.surfaceBand.height)
      if (ground === null) throw new Error('Clearance brush has no terrain surface at ' + x)
      path.push({ x, y: ground })
      if (x === right) break
    }
    match.clearancePath = path; persist()
  }
  async function clearCombatSpace() {
    if (match.procedural) return clearWithFlowers()
    const c = generationRecipes.clearance, path: Vec2[] = match.clearancePath
    if (!path?.length) throw new Error('Missing native clearance brush path')
    const materials = talus.elements.list().filter(e => e.id > 0).map(e => ({ element: e.id, hardness: 1 }))
    // Light, irregular foreground clearance after every detail/growth pass.
    // The native kernel protects bodies; the brush stops above the original
    // ground and only replaces existing matter. Leave imperfect openings,
    // living bodies and the terrain silhouette rather than cutting a tunnel.
    const jobs = path.map((p, n) => {
      const hash = chaosSeed(match.seed + ':clearance-shape:' + n)
      const radius = c.radius[0] + hash % (c.radius[1] - c.radius[0] + 1)
      const shape = { x: p.x, y: p.y - radius - c.groundBuffer, radius }
      return { shape, cells: (radius * 2 + 2) ** 2 }
    })
    for (let n = match.cleared || 0; n < jobs.length; n++) {
      const job = jobs[n], { shape, cells } = job
      const receipt = await talus.world.terrainWork({ kind: 'recipe', shape,
        bounds: { ...arena.bounds, h: 1024 }, replacement: 'matching', materials,
        budget: { cells, particles: cells, work: cells },
        seed: chaosSeed(match.seed + ':clearance:' + n),
        mixture: { recipes: [c.empty, generationRecipes.details[0]],
          weights: [{ anchorId: c.empty.id, w: c.emptyWeight }, { anchorId: generationRecipes.details[0].id, w: 1 - c.emptyWeight }],
          settings: generationRecipes.semantic } })
      if (receipt.status !== 'completed') throw new Error('Clearance brush ' + n + ': ' + receipt.reason)
      match.cleared = n + 1; persist(); record('generation-clearance', { n, shape, receipt })
    }
  }
  async function generateBrushDetails() {
    if (match.procedural) return generateCatalogDetails()
    const count = 50
    for (let n = match.details || 0; n < count; n++) {
      const hash = chaosSeed(match.seed + ':detail:' + n), size = 64 + hash % 65
      const x = arena.bounds.x + 128 + n * 256 + (hash % 80)
      const ground = await talus.world.findSurface(x, arena.surfaceBand.top, arena.surfaceBand.height)
      if (ground === null) throw new Error('Brush detail has no connected surface at ' + x)
      const radius = size / 2, y = ground + radius / 2
      const recipes = generationRecipes.details, primary = hash % recipes.length
      const weights = recipes.map((r: any, i: number) => ({ anchorId: r.id, w: i === primary ? .65 : .35 / (recipes.length - 1) }))
      const cells = (Math.ceil(x + radius) - Math.floor(x - radius)) * (Math.ceil(y + radius) - Math.floor(y - radius))
      match.message = 'Detail brushes · ' + (n + 1) + ' / ' + count; publish()
      const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius }, bounds: { ...arena.bounds, h: 1024 },
        replacement: 'eligible',
        materials: ['DIRT', 'SAND', 'STONE'].map(name => ({ element: talus.elements.get(name)!.id, hardness: 1 })),
        budget: { cells, particles: cells, work: cells }, seed: hash,
        mixture: { recipes, weights, settings: generationRecipes.semantic },
        ...(n % generationRecipes.neural.every === 0 ? { neural: { modelId: generationRecipes.neural.modelId,
          steps: generationRecipes.neural.steps, tintStrength: generationRecipes.neural.tintStrength } } : {}) })
      if (receipt.status !== 'completed') throw new Error('Detail brush ' + n + ': ' + receipt.reason)
      match.details = n + 1; persist(); record('generation-detail', { n, size, weights, neural: n % generationRecipes.neural.every === 0, x, y, receipt })
    }
  }
  async function generateLivingArena() {
    if (match.procedural) { await prepareProceduralSites(); return generateCatalogLife() }
    const living = generationRecipes.living
    for (let n = match.livingSites || 0; n < living.sites; n++) {
      const hash = chaosSeed(match.seed + ':living:' + n)
      const x = Math.floor(arena.bounds.x + (n + .5) * arena.bounds.w / living.sites)
      const ground = await talus.world.findSurface(x, arena.surfaceBand.top, arena.surfaceBand.height)
      if (ground === null) throw new Error('Living brush has no support at ' + x)
      const size = living.brushSizes[n % living.brushSizes.length], preset = living.presets[n % living.presets.length]
      const shape = { x: x - living.regionSize / 2, y: ground - living.regionSize + 32,
        w: living.regionSize, h: living.regionSize }, cells = shape.w * shape.h
      match.message = 'Living landscape · ' + (n + 1) + ' / ' + living.sites; publish()
      const receipt = await talus.world.terrainWork({ kind: 'growth', shape,
        bounds: { ...arena.bounds, h: 1024 }, replacement: 'empty', seed: hash,
        budget: { cells, particles: cells, work: cells }, growth: { presetId: preset.id,
          origin: { x, y: ground }, path: [{ x: x - 2, y: ground - 1 }, { x: x + 2, y: ground - 1 }],
          radius: size / 2, steps: living.steps, jobs: living.jobs, fragments: living.fragments } })
      if (receipt.status !== 'completed') throw new Error('Living brush ' + n + ': ' + receipt.reason)
      match.livingSites = n + 1; persist(); record('generation-living', { n, size, preset: preset.id, x, ground, receipt })
    }
    record('generation-living-complete', { sites: living.sites, bounds: arena.bounds })
  }
  async function deploymentGround(p: any): Promise<{ x: number, y: number }> {
    const half = arena.combat.tankHalfWidth, spacing = (arena.combat.w - arena.combat.spawnInset * 2) / (match.roster.length - 1)
    const range = Math.max(0, Math.min(120, Math.floor(spacing / 2 - half - 4)))
    const columns = [0]
    for (let d = 4; d <= range; d += 4) columns.push(d, -d)
    // Try the preferred lane first, then any free part of the same combat
    // frame. A canopy over one lane must not prevent an otherwise valid map.
    for (let d = Math.floor(range / 4) * 4 + 4; d <= arena.combat.w; d += 4) columns.push(d, -d)
    const groundCell = (x: number, y: number) => {
      const c = talus.world.cell(x, y)
      return c && !c.body && !c.entity && (c.state === 'solid' || c.state === 'powder')
        && !/(WOOD|LEAF|ROOT|STEM|BRANCH)/.test(c.element?.name || '')
    }
    let arrived = false
    const point = { x: arena.combat.x + arena.combat.w / 2, y: arena.surfaceBand.top + arena.surfaceBand.height / 2 }
    for (let n = 0; n < 1800; n++) {
      if (cameraArrived(cameraPoint(point, 'deploy:' + p.index))) { arrived = true; break }
      await talus.sleepTicks(1)
    }
    if (!arrived) throw new Error('Deployment terrain did not become camera-ready: ' + p.name)
    await talus.sleepTicks(90)
    for (const dx of columns) {
      const x = Math.round(p.spawnX + dx)
      if (x - half < match.bounds.x || x + half > match.bounds.x + match.bounds.w) continue
      // Starting lanes stay in the authored central strip even though normal
      // play now uses the full map. Wider bounds must not spread the opening.
      if (x - half < arena.combat.x || x + half > arena.combat.x + arena.combat.w) continue
      if (match.roster.some((other: any) => other !== p && other.entityId
        && Math.abs((entity(other)?.position?.x ?? other.spawnX) - x) < half * 2 + 12)) continue
      for (let y = Math.floor(arena.surfaceBand.top); y <= 1024; y += 2) {
        if (!groundCell(x, y)) continue
        // Ground has depth and carries both tracks. A branch, floating leaf,
        // narrow spike or loose prop is not a deployment surface.
        if (![x - 14, x, x + 14].every(sx => {
          for (let sy = y; sy <= y + 16; sy += 2)
            if ([0, 2, 4, 6, 8].every(depth => groundCell(sx, sy + depth))) return true
          return false
        })) continue
        let clear = true
        for (let sx = x - half; sx <= x + half && clear; sx += 2)
          for (let sy = y - 66; sy < y - 2; sy += 2) {
            const cell = talus.world.cell(sx, sy)
            if (cell && cell.state !== 'empty' && cell.state !== 'gas') { clear = false; break }
          }
        if (!clear) continue
        record('deployment-surface', { player: p.name, requestedX: p.spawnX, x, y, offset: dx })
        return { x, y }
      }
      await talus.sleepTicks(1)
    }
    throw new Error('No supported open deployment position for ' + p.name + '; seed ' + match.seed)
  }
  async function boot() {
    if (booting || booted) return
    booting = true
    try {
      arena = JSON.parse((await talus.files.readText('Game/arena.json'))!)
      chaosCatalog = JSON.parse((await talus.files.readText('Game/chaos.json'))!)
      quipCatalog = JSON.parse((await talus.files.readText('Game/quips.json'))!)
      market = JSON.parse((await talus.files.readText('Game/shop.json'))!)
      generationRecipes = JSON.parse((await talus.files.readText('Game/generation.json'))!)
      personaCatalog = JSON.parse((await talus.files.readText('Game/personas.json'))!)
      soundCatalog = JSON.parse(await talus.files.readText('Game/audio.json') || '{}')
      supplyCatalog = JSON.parse((await talus.files.readText('Game/supply-drops.json'))!)
      talus.ui.damageTextStyle(damageTextStyle)
      market.categories.forEach((name: string, index: number) => talus.on('menu.custom.category-' + index, () => { shopCategory = name; publishShop() }))
      for (const item of market.items) {
        talus.on('menu.custom.buy-' + item.id, e => {
          if (!shopOpen || !match) return
          const p = match.roster[shopIndex]
          if (String(e.values?.account) !== playerKey(p)) return
          if (purchase(p, item.id, Number(e.values?.revision))) { publishShop(); publish() }
        })
        if (item.kind === 'weapon') talus.on('menu.hud.equip-' + item.id, () => {
          if (!shopOpen && (human() || match?.phase === 'ready')) chooseWeapon(current(), item.id)
        })
      }
      if (quipCatalog.version !== 1 || quipCatalog.shooting.length !== 500 || quipCatalog.death.length !== 500)
        throw new Error('The dialogue catalog requires 500 shooting lines and 500 last words')
      talus.ui.set('speech', [])
      if (!chaosCatalog.effects.some((fx: any) => fx.enabled)) throw new Error('The death-effect catalog has no enabled effects')
      talus.camera.setZoom(0.25); talus.camera.follow('off'); talus.camera.frame(null)
      cameraIntent = null; talus.ui.set('frameNotice', '')
      for (const p of talus.players.list()) { p.inputEnabled = false; p.release() }
      match = talus.state.getJson('indigo.match')
      if (!match) {
        const params: any = talus.game.params
        if (params?.deploy !== 'yes') { showSetup(); booted = true; return }
        configureGeneration(talus.world.generation.status().recipeId || (params.generation === 'brush' ? 'brush' : 'wfc'))
        try { match = validate(params) } catch (err) { talus.ui.set('error', String(err)); showSetup(); booted = true; return }
        persist()
        const saved: any = talus.installed.get('indigo') || {}
        talus.installed.set('indigo', { ...saved, humans: match.humans, computers: match.computers,
          turnSeconds: match.turnSeconds, cpuSkill: match.cpuSkill, seriesLength: match.seriesLength, biomeCycle: match.biomeCycle ? 'cycle' : 'random', biomeRounds: match.biomeRounds, generation: match.generation, namesText: match.roster.map((p: any) => p.name).join('\n') })
      }
      if (match.version !== 9) throw new Error('This save belongs to an earlier fixture. Start a new match for M9.')
      persist() // Re-establish any script-owned sequence barrier after reload.
      if (match.generation === 'brush' && arena.bounds.x === 0) configureGeneration('brush')
      else if (match.generation !== 'brush') configureGeneration(match.generation)
      applyBattlefieldPolicy()
      if (match.attack) throw new Error('An attack was interrupted by loading. Native projectile/cast persistence is required; start a fresh match.')
      if (match.presentation.active) {
        const cue = match.presentation.active
        cue.resumeStage = cue.resumeStage || (cue.stage === 'effect' ? 'effect' : 'speech')
        cue.stage = 'centering'; cue.centerStarted = talus.sim.clock
        if (cue.resumeStage !== 'effect') cue.elapsed = 0
      }
      ensureWallets()
      for (const p of match.roster) p.autoAimTurn = null // Unapplied assistance never debits stock across reload.
      for (const job of match.chaos.jobs) for (const id of job.projectileIds)
        if (!talus.projectiles.get(id)?.exists) throw new Error('A saved death shell is missing; engine projectile persistence is required.')
      talus.ui.closeMenu(); talus.ui.hud('Menus/hud.html')
      if (match.phase === 'deploying') {
        const generation = talus.world.generation.status()
        if (generation.phase === 'failed') throw new Error('Native terrain generation: ' + generation.reason)
        record('terrain-source', generation)
        await prepareProcedural()
        if (match.generation === 'brush') await generateBrushArena()
        else if (generationRecipes.hybrid.recipes.includes(match.generation)) {
          // terrainWork acquires/materializes the native zone beneath each
          // brush job; surface queries read the same saved/source terrain.
          await generateStoryMacro()
          await prepareClearance()
          await generateBrushDetails()
          await generateStructures()
          await generateLivingArena()
          await clearCombatSpace()
          await generateStoryMechanisms()
          record('generation-complete', { mode: match.generation, hybrid: true, bounds: arena.bounds })
        } else if (match.generation === 'bramble-badlands') {
          await generateStoryMacro(); await prepareClearance(); await generateLivingArena(); await clearCombatSpace(); await generateStoryMechanisms()
        }
        for (const p of match.roster) {
          if (p.entityId && p.placementReady) continue
          match.message = 'Deploying ' + (p.index + 1) + ' / ' + match.roster.length; publish()
          const placement = p.entityId ? { x: p.spawnX, y: p.surfaceY } : await deploymentGround(p)
          const ground = placement.y
          const tank = p.entityId ? entity(p) : await talus.entities.spawn(p.templateId || arena.tankTemplate, placement.x, ground - 48)
          if (!tank) throw new Error('Tank spawn refused: ' + p.name)
          if (!p.entityId) record('spawn-pose', { owner: tank.id, pose: tank.snapshot() })
          p.entityId = tank.id; p.spawnX = placement.x; p.surfaceY = ground; persist()
          const spawnAngle = p.index < match.roster.length / 2 ? 0 : 180
          tank.blackboard.set('name', p.name); tank.blackboard.set('custom.indigoPlayer', p.index)
          tank.blackboard.set('custom.control', p.control); tank.blackboard.set('custom.angle', spawnAngle); tank.blackboard.set('custom.power', 70)
          if (!await tank.whenLive({ timeoutTicks: 600 })) throw new Error('Tank did not become live')
          await preparePlacement(p)
          syncLoadout(p)
          tank.weapon.aim(-spawnAngle * Math.PI / 180, .7)
          nameplate(p); record('deployed', { name: p.name, id: tank.id })
        }
        match.phase = 'ready'; match.message = 'Tanks ready — begin when your crew is ready'; persist()
      }
      if (match.phase === 'flight') {
        shot = talus.projectiles.get(match.shotId)
        if (!shot?.exists) throw new Error('The saved shot is missing. Projectile persistence needs engine investigation.')
      } else if (match.phase === 'firing') throw new Error('Save interrupted a queued shot; engine cast persistence needs investigation.')
      else if (match.phase === 'finished') {
        const scores: any = talus.installed.get('indigo.scores'); talus.ui.set('scores', Object.values(scores?.players || {}))
      }
      for (const p of match.roster) if (!p.eliminated && (p !== current() || ['ready', 'finished'].includes(match.phase))) passivePosture(p)
      const resumePositioning = match.phase === 'positioning'
      if (resumePositioning) match.phase = 'turn'
      // Let simulation events process queued presentations before awaiting
      // focus. Waiting inside boot would prevent those very events running.
      if (match.phase === 'turn' && !resumePositioning) match.phase = 'refocusing'
      booted = true; booting = false
      for (const p of match.roster) nameplate(p)
      for (const p of match.roster) {
        const persona = personaCatalog.personas.find((v: any) => v.id === p.personaId)
        if (persona && entity(p).can('blackboard.set')) {
          entity(p).blackboard.set('factionId', persona.factionId)
          entity(p).blackboard.set('custom.persona', persona)
        }
      }
      if (!talus.encounters.get('scorched-terra')) {
        const members = match.roster.filter((p: any) => p.entityId && entity(p).can('blackboard.set'))
        if (members.length) {
          const encounter = talus.encounters.set('scorched-terra', {
            mode: 'free-for-all', selfDamage: true, members: members.map((p: any) => ({ entity: p.entityId })),
          })
          if (!encounter.accepted) throw new Error('Combat encounter: ' + encounter.reason)
        }
      }
      if (match.presentation.active) {
        const cue = match.presentation.active, p = match.roster.find((r: any) => r.entityId === cue.owner)
        speech(p, null) // Restore text only after native camera arrival; do not replay its quip draw.
      }
      input(false)
      if (match.phase === 'settling') run(settle)
      if (resumePositioning) run(fire)
      else if (['ready', 'focusing', 'refocusing'].includes(match.phase)) run(restoreFocusAfterBoot)
      publish(); talus.state.set('indigo.error', ''); record('match-ready', { phase: match.phase })
      if (match.phase === 'finished') openShop()
    } finally { booting = false }
  }
  talus.on('world.game-started', () => run(boot)); talus.on('world.game-loaded', () => run(boot)); talus.after(1, () => run(boot))
  talus.on('menu.hud.begin', () => { if (!shopOpen && match?.phase === 'ready') run(() => beginTurn(false)) })
  talus.on('menu.hud.shop', openShop)
  talus.on('menu.custom.shop-close', closeShop)
  talus.on('menu.custom.shop-begin', () => {
    if (!shopOpen || match?.phase !== 'ready') return
    closeShop()
    run(() => beginTurn(false))
  })
  talus.on('menu.closed', e => { if (e.file === 'Menus/shop.html') { shopOpen = false; publish() } })
  talus.on('menu.custom.shop-prev', () => { if (shopOpen) { shopIndex = (shopIndex + match.roster.length - 1) % match.roster.length; publishShop() } })
  talus.on('menu.custom.shop-next', () => { if (shopOpen) { shopIndex = (shopIndex + 1) % match.roster.length; publishShop() } })
  talus.on('menu.hud.shield',()=>{if(human())useDefense(current(),'shield')})
  talus.on('menu.hud.magnet',()=>{if(human())useDefense(current(),'magnet')})
  talus.on('menu.hud.battery', () => { if (human()) useBattery(current()) })
  talus.on('menu.hud.parachute', () => { if (human()) useParachute(current()) })
  talus.on('menu.hud.auto-aim', () => { if (human()) useAutoAim(current()) })
  talus.on('menu.hud.fire', () => { if (human()) run(fire) })
  talus.on('menu.hud.pass', () => { if (human()) { reward(current(), 'pass'); record('pass'); run(() => beginTurn(true)) } })
  talus.on('menu.hud.angle-up', () => adjust(5, 0)); talus.on('menu.hud.angle-down', () => adjust(-5, 0))
  talus.on('menu.hud.power-up', () => adjust(0, 5)); talus.on('menu.hud.power-down', () => adjust(0, -5))
  for(let i=0;i<16;i++)talus.on('menu.hud.target-'+i,()=>{if(human())selectTarget(current(),match.roster[i]?.entityId)})
  talus.on('menu.hud.flip', () => { if (human()) flipUpright(current()) })
  talus.on('menu.hud.setup', showSetup); talus.on('indigo:cpu-plan', cpuPlan)
  talus.on('indigo:cpu-aimed', cpuAimed)
  talus.on('indigo:cpu-unreachable', e => {
    if (active() && e.id === current().entityId && e.turn === match.turnNumber && current().autoAimTurn === match.turnNumber) {
      current().autoAimTurn = null
      match.message = 'Lazy Boy found no supported shot. Charge retained.'
      record('auto-aim-refused', { name: current().name, reason: entity(current()).blackboard.get('custom.aimRefusal') })
      persist(); publish()
      if (current().control !== 'cpu') return
    }
    if (active() && current().control === 'cpu' && e.id === current().entityId && e.turn === match.turnNumber) {
      const p=current(),tank=entity(p)
      if(tank.blackboard.get('custom.aimRefusal')==='deflection-fields') {
        const target=tank.blackboard.get('custom.indigoTarget') as any
        tank.blackboard.set('custom.angle',target?.x < (tank.x ?? 0) ? 180-market.cpu.fieldProbeAngle : market.cpu.fieldProbeAngle)
        const powers=market.cpu.fieldProbePowers, trial=p.fieldProbeCount||0
        const power=powers[trial%powers.length];p.fieldProbeCount=trial+1
        tank.blackboard.set('custom.power',power);p.tactic='Exploratory shot through deflection field'
        record('cpu-field-probe',{name:p.name,power,trial});run(fire);return
      }
      const reason = tank.blackboard.get('custom.aimRefusal') || 'Native aim graph refused the planned shot'
      record('cpu-unreachable', { name: p.name, plan: tank.blackboard.get('custom.aimPlan'), reason })
      cpuNoAction(p, String(reason))
    }
  })
  talus.on('indigo:cpu-fire', e => { if (active() && current().control === 'cpu' && e.id === current().entityId && e.turn === match.turnNumber) run(fire) })
  talus.on('input.pressed', e => {
    if (e.slot !== 0 || !human()) return
    if (e.action === 'tank_target') { const choices=match.roster.filter((r:any)=>r!==current()&&targetSnapshot(r));const at=choices.findIndex((r:any)=>r.entityId===current().targetId);if(choices.length)selectTarget(current(),choices[(at+1)%choices.length].entityId) }
    if (e.action === 'tank_flip') flipUpright(current())
    if (e.action === 'tank_fire') run(fire)
    if (e.action === 'tank_pass') { reward(current(), 'pass'); record('pass'); run(() => beginTurn(true)) }
  })
  talus.on('weapon.beforeFire', e => {
    if (match?.roster.some((p: any) => p.entityId === e.entity?.id))
      return match.phase === 'firing' && current().entityId === e.entity?.id
  })
  talus.on('projectile.launch', e => {
    shotReward(e, 'launch')
    const a = match?.attack
    if (launchingChaos || !a || (e.owner?.id || e.ownerEntityId) !== a.owner) return
    const p = match.roster.find((r: any) => r.entityId === a.owner), item = itemById(a.item)
    if (!a.spent) {
      if (!unlimited(a.item)) {
        if (owned(p, a.item) < 1) { fail('Paid cannon fired without purchased ammunition'); return }
        wallet(p).stock[a.item]--; wallet(p).revision++
        record('ammo-spent', { name: p.name, item: a.item, template: item.template, remaining: owned(p, a.item) })
      }
      if (item.behavior?.mode.startsWith('battery')) wallet(p).stock.battery--
      p.shots=(p.shots||0)+1
      if (item.behavior?.mode !== 'terrain') cpuProgress(p,'accepted-cast',{item:a.item,template:item.template,projectileId:e.projectileId})
      a.spent = true; saveBank()
    }
    const snapshot = e.projectile.snapshot()
    a.ids[e.projectileId] = { depth: childDepth, vy: snapshot?.vy ?? -1, vx: snapshot?.vx ?? 0, split: false }
    a.launched++
    if (a.rootId == null) { a.rootId = e.projectileId; a.launchClock = talus.sim.clock; a.origin = { x: snapshot!.x, y: snapshot!.y } }
    let homingAccepted: boolean | null = null
    if (item.behavior?.mode === 'homing' && p.targetId) {
      homingAccepted = e.projectile.setTarget(p.targetId)
      record('homing-target', { id: e.projectileId, owner: a.owner, target: p.targetId, accepted: homingAccepted })
    }
    shot = e.projectile; match.shotId = e.projectileId; match.phase = 'flight'; match.waitTicks = 0
    // The actual cast owns its ammunition and flight even if native steering
    // refuses. Retain that result honestly; never retry or invent steering.
    match.message = homingAccepted === false ? 'Homing refused · rocket in flight' : 'Attack in flight'; persist(); publish()
    record('launch', { id: e.projectileId, owner: a.owner, weapon: a.item, template: item.template, depth: childDepth, snapshot })
  })
  talus.on('projectile.apex', e => {
    const a = match?.attack, entry = a?.ids[e.projectileId], b = a && itemById(a.item).behavior
    if (entry && e.projectileId === a.rootId && b?.mode === 'apex' && !entry.split) {
      splitAttack(entry, e.projectile.snapshot() || e, b); e.projectile.remove()
    }
  })
  talus.on('projectile.collision', e => { shotReward(e, 'landing'); if (match?.attack?.ids[e.projectileId]) record('collision', {id:e.projectileId,with:e.with,x:e.x,y:e.y,element:talus.world.cell(e.x,e.y)?.element?.name}) })
  talus.on('projectile.bounce', e => shotReward(e, 'bounce'))
  talus.on('damage', e => {
    if (!match || e.blocked || e.amount <= 0) return
    const attacker = match.roster.find((p: any) => p.entityId === (e.source?.id || e.sourceEntityId))
    const victim = match.roster.find((p: any) => p.entityId === (e.target?.id || e.targetStableId))
    if(attacker)attacker.damage=(attacker.damage||0)+e.amount
    if(victim)victim.damageTaken=(victim.damageTaken||0)+e.amount
    if(attacker&&victim!==attacker&&match.attack?.owner===attacker.entityId&&!match.attack.hitCounted) {match.attack.hitCounted=true;attacker.hits=(attacker.hits||0)+1}
    reward(attacker, 'hit'); reward(attacker, 'damage', e.amount); reward(victim, 'hurt', e.amount)
    persist()
  })
  talus.on('projectile.hit', e => {
    if (!match?.attack?.ids[e.projectileId]) return
    record('hit', JSON.parse(JSON.stringify(e)))
    const target = match.roster.find((p: any) => p.entityId === e.targetStableId)
    match.lastHit = (target?.name || 'Tank') + ' −' + Math.round(e.amount) + ' HP' + (e.killed ? ' · ELIMINATED' : e.direct ? ' · DIRECT HIT' : ' · SPLASH')
    persist(); publish()
  })
  talus.on('projectile.end', e => {
    shotReward(e, 'end')
    const job = match?.chaos.jobs.find((j: any) => j.projectileIds.includes(e.projectileId))
    if (job) { job.projectileIds = job.projectileIds.filter((id: number) => id !== e.projectileId); job.ended++; persist() }
    const a = match?.attack, entry = a?.ids[e.projectileId]
    if (!a || !entry) return
    const at = { x: Number(e.x), y: Number(e.y) }
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) { fail('Projectile ended without a resolution point'); return }
    delete a.ids[e.projectileId]; a.ended++; a.lastPoint = at
    const b = itemById(a.item).behavior
    if (!entry.split && entry.depth === 0) {
      // A MIRV that strikes cover before apex still releases its purchased
      // payload. The same split flag guards apex/end races and duplicate ends.
      if (b?.mode === 'cluster' || b?.mode === 'apex') a.pending.push({ kind: 'cluster', at, entry })
      if (b?.mode === 'deposit') a.pending.push({ kind: 'deposit', at })
      if (b?.mode === 'terrain') a.pending.push({ kind: 'terrain', at })
      if (a.item === 'sand') a.pending.push({ kind: 'sand', at })
    }
    if (b?.mode === 'leap' && entry.depth < b.hops - 1) a.pending.push({ kind: 'leap', at, vx: entry.vx * .35, depth: entry.depth })
    const p = match.roster.find((r: any) => r.entityId === a.owner), tank = entity(p)
    if (!p.eliminated && p.control === 'cpu' && p.shotFrom && entry.depth === 0) {
      const target=match.roster.find((r:any)=>r.entityId===p.targetId), targetAt=target&&entity(target)?.position
      if(targetAt) {
        const observation={turn:match.turnNumber,targetId:p.targetId,weapon:a.item,origin:p.shotFrom,target:targetAt,
          impact:at,reason:e.reason,damageBefore:a.damageBefore||0,dx:at.x-targetAt.x,dy:at.y-targetAt.y,power:a.power}
        p.impacts=[...(p.impacts||[]),observation].slice(-doctrine(p).impactMemory)
        if (tank?.can('blackboard.set')) tank.blackboard.set('custom.aiImpacts',p.impacts)
        record('cpu-observation',observation)
      }
    }
    record('end', { ...at, reason: e.reason, id: e.projectileId, owner: a.owner, shooterResidency: tank?.residency }); persist()
  })
  talus.on('death', e => {
    const p = match?.roster.find((r: any) => r.entityId === (e.entity?.id || e.stableId))
    if (p) { try { eliminate(p, 'destroyed', e.killer?.id, e) } catch (error) { fail(error) } }
  })
  talus.on('entity.residency', e => {
    const p = match?.roster.find((r: any) => r.entityId === e.entityKey)
    if (p) pendingTankReady.add(p.entityId)
  })
  talus.on('entity.land', e => {
    const p = match?.roster.find((p: any) => p.entityId === e.entity?.id)
    if (!p) return
    // Contact chatter from a settled hull must not evict the bounded purchase,
    // choice, debit and impact journal several times every simulation second.
    const at = e.entity?.position, last = p.lastLandRecord
    if (!last || talus.sim.clock - last.clock >= 3 || at && Math.hypot(at.x - last.x, at.y - last.y) >= 12) {
      p.lastLandRecord = { clock: talus.sim.clock, x: at?.x ?? 0, y: at?.y ?? 0 }
      record('land', { id: e.entity?.id, position: at })
    }
  })
  talus.on('tick.sim.post', () => {
    if (!booted || booting || !match || !bank || match.phase === 'fault') return
    try {
      refreshRestoredTanks()
      for (const p of match.roster) if (!p.eliminated && p.entityId && entity(p)?.isLive) {
        syncUtilities(p); if (match.turnNumber > 0) autoDefend(p)
      }
    } catch (error) { fail(error) }
  })
  talus.on('tick.sim.pre', e => {
    if (booted && !booting && match && arena && match.phase !== 'fault' && !presenting()) {
      try {
        const point = match.phase === 'flight' ? shot?.snapshot() : match.phase === 'settling' ? match.impact : null
        if (point) cameraPoint(point, match.phase === 'flight' ? 'projectile' : 'impact')
        else if (['ready', 'turn'].includes(match.phase) && !current().eliminated) cameraTank(current())
      } catch (error) { fail(error); return }
    }
    if (!booted || booting || !match || match.phase === 'fault') return
    if (match.phase !== 'finished') {
      try { tickPresentation(); tickAttack(); tickChaos(e.dt) } catch (error) { fail(error); return }
    }
    ticks++
    if (ticks % 6 === 0) {
      checkRoster()
      try { tickSupplies() } catch (error) { fail(error); return }
      if (itemById('parachute').enabled && !['ready','deploying','finished','fault'].includes(match.phase)) {
        for (const p of match.roster) {
          const e=entity(p)
          if (p.control==='cpu' && !p.eliminated && e?.isLive && e.alive && !e.controller.fallBrake?.deployed
            && (e.velocity?.y ?? 0) > itemById('parachute').cpuDeploySpeed) useParachute(p)
        }
      }
      if (active() && match.roster.filter((p: any) => !p.eliminated).length <= 1) finish()
      if (!active()) publish()
    }
    if (match.pendingTurn !== null && !presenting() && !match.attack) { const next = match.pendingTurn; match.pendingTurn = null; run(() => beginTurn(next)); return }
    if (match.phase === 'aftermath') { finish(); return }
    if (match.phase === 'flight') {
      if (++match.waitTicks > 3600) fail('Projectile did not resolve within 60 seconds'); return
    }
    if (match.phase === 'firing') { if (++match.waitTicks > 180) fail('Cannon trigger produced no projectile'); return }
    if (!active()) return
    if (current().eliminated) { run(() => beginTurn(true)); return }
    const tank = entity(current()), s = tank.snapshot()
    match.remaining = Math.max(0, match.remaining - e.dt)
    if (human() && tank.isLive && s) {
      const a = talus.players.get(0)?.readInput()?.actions || {}
      if(itemById('jetpack').enabled&&tank.controller.state?.enabled)tank.controller.levitate(!!a.tank_levitate&&owned(current(),'jetpack')>0)
      const diggingDirection=Number(!!a.tank_dig_right)-Number(!!a.tank_dig_left)
      if(diggingDirection)run(()=>dig(current(),diggingDirection))
      const requested = (Number(!!a.tank_move_right) - Number(!!a.tank_move_left)) * arena.moveSpeed
      driveTank(current(),requested)
      const da = Number(!!a.tank_angle_up) - Number(!!a.tank_angle_down), dp = Number(!!a.tank_power_up) - Number(!!a.tank_power_down)
      if (da || dp) adjust(da * 30 * e.dt, dp * 30 * e.dt)
    }
    if (s && human()) {
      const distance = Math.abs(s.x - Number(current().lastMoveX ?? s.x))
      if (Math.abs(s.vx) > 1) current().moveDistance += distance
      current().lastMoveX = s.x
      const units = Math.floor(current().moveDistance / 16)
      if (units) { current().moveDistance -= units * 16; reward(current(), 'move', units) }
    }
    if (match.remaining <= 0) {
      if (current().control === 'cpu') {
        if ((current().consecutivePasses||0)>=(market.cpu.maxConsecutivePasses??2) && prepareCpuEscape(current(),match.turnNumber)) run(fire)
        else cpuNoAction(current(),'Turn budget exhausted')
      } else { reward(current(), 'timeout'); record('timeout'); run(() => beginTurn(true)) }
      return
    }
    if (ticks % 6 === 0) { persist(); publish() }
  })
}
