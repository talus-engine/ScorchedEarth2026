// Scorched Terra: M9 combat plus M10 arcade presentation. Indigo save identity stays stable.
if (!talus.editor.available) {
  let arena: any, match: any, chaosCatalog: any, quipCatalog: any, quipDeck: any, market: any, bank: any
  let shopOpen = false, shopIndex = 0, shopCategory = 'All'
  let generationRecipes: any, personaCatalog: any, soundCatalog: any, childDepth = 0
  let booting = false, booted = false, ticks = 0
  let launchingChaos = false
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
  const supplySeen = new Map<string, { jet: number, shield: number, magnet: number, groundSpent: number }>()
  const colors = ['#bcb1ff', '#ffbd82', '#8ae0ca', '#f7a5c4', '#a4d2ff', '#ebd78a']
  const entity = (p: any): Entity => talus.entities.get(p.entityId)!
  const current = () => match.roster[match.focusIndex]
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const presenting = () => !!match?.presentation.active || !!match?.presentation.queue.length
  const active = () => booted && !booting && match?.phase === 'turn' && !presenting()
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
    if (p.personaId) talus.factions.holdSpeech(entity(p), text !== null)
    talus.ui.worldText('speech:' + p.entityId, text === null ? null : {
      entity: entity(p), text, offset: { x: 0, y: -110 }, size: 36,
      maxWidth: 720, lineHeight: 1.2, color: '#ffffff', outline: '#151120',
      background: '#151120d9', unavailable: 'retain',
    })
  }
  function say(p: any, kind: SpeechKind) {
    const line = p.personaId ? nextPersonaShout(p, kind === 'shooting' ? 'taunt' : 'death') : nextQuip(kind)
    if (!line) return ''
    entity(p)?.blackboard.set('custom.lastQuip', { id: line.id, text: line.text, kind, turn: match.turnNumber })
    speech(p, line.text)
    record('quip', { owner: p.entityId, name: p.name, speechKind: kind, ...line })
    return line.text
  }
  function queuePresentation(p: any, kind: SpeechKind, at?: { x: number | null, y: number | null }) {
    const position = at?.x != null && at.y != null ? at : entity(p)?.position
    if (!position) throw new Error('No position for ' + p.name + ' last words')
    if (kind === 'death') {
      // Cancel only this tank's unlaunched shot, never another tank's projectile.
      match.presentation.queue = match.presentation.queue.filter((v: any) => v.owner !== p.entityId)
      if (match.presentation.active?.owner === p.entityId) { speech(p, null); match.presentation.active = null }
      if (p === current() && ['telegraph', 'firing'].includes(match.phase) && !match.attack?.rootId) {
        match.phase = 'turn'; match.attack = null; match.pendingTurn = true
      }
    }
    match.presentation.queue.push({ owner: p.entityId, kind, x: Number(position.x), y: Number(position.y), started: null })
    if (kind === 'death') {
      // Queue time and speech both use simulated time. Hold the actual physical
      // group, then release explicitly before its death effect; the finite cap
      // also guarantees release if this script is disposed unexpectedly.
      const active = match.presentation.active
      const wait = active ? Math.max(0, 3 - (talus.sim.clock - active.started)) : 0
      const held = entity(p)?.controller.holdPose(Math.min(120, wait + match.presentation.queue.length * 3 + 1))
      if (!held?.accepted) throw new Error('Native death pose refused for ' + p.name + ': ' + held?.reason)
      record('death-pose-held', { owner: p.entityId, seconds: held.seconds })
    }
    input(false); persist()
  }
  function tickPresentation() {
    let cue = match.presentation.active
    if (!cue) {
      cue = match.presentation.queue.shift()
      if (!cue) return false
      const p = match.roster.find((r: any) => r.entityId === cue.owner)
      if (cue.kind === 'shooting' && p.eliminated) return true
      const at = entity(p)?.position || cue
      cue.x = at.x; cue.y = at.y
      // Set the camera before authoring independent native world text. The renderer
      // moves both at frame rate; no DOM positioning or timer-based UI drift.
      frameRoster(cue)
      cue.started = talus.sim.clock; cue.elapsed = 0
      match.presentation.active = cue
      record('presentation-centered', { owner: p.entityId, speechKind: cue.kind, x: cue.x, y: cue.y })
      cue.text = say(p, cue.kind)
      match.message = p.name + (cue.kind === 'death' ? ' has a few last words…' : ' takes aim…')
      persist(); publish(); return true
    }
    const p = match.roster.find((r: any) => r.entityId === cue.owner)
    frameRoster(cue.kind === 'death' ? cue : entity(p)?.position || cue)
    cue.elapsed = talus.sim.clock - cue.started
    if (cue.elapsed < 3) { if (ticks % 6 === 0) persist(); return true }
    speech(p, null)
    record('presentation-ended', { owner: p.entityId, speechKind: cue.kind, elapsed: talus.sim.clock - cue.started })
    match.presentation.active = null
    if (cue.kind === 'death') {
      const hull = entity(p), at = hull?.position || cue
      const released = hull?.controller.holdPose(0)
      if (!released?.accepted) throw new Error('Native death pose release refused for ' + p.name)
      record('death-pose-released', { owner: p.entityId })
      queueChaos(p, at)
    }
    else if (!p.eliminated) performAttack(p)
    persist()
    if (!presenting() && match.phase === 'turn' && !match.pendingTurn) {
      input(current().control === 'human')
      if (current().control === 'cpu') run(() => prepareCpuTurn(current(), match.turnNumber))
    }
    return true
  }
  function input(enabled: boolean) {
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
  function persist() {
    // Native flights/jobs hold their own save barriers. This one covers the
    // gaps between children and the authored presentation/effect queues.
    const pending = match && (arcadeCard || match.attack || presenting() || match.chaos.jobs.length || launchingChaos || digging
      || ['deploying', 'telegraph', 'firing', 'flight', 'settling', 'focusing', 'positioning', 'aftermath'].includes(match.phase))
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
  const owned = (p: any, id: string) => id === 'standard' ? Infinity : Number(wallet(p).stock[id] || 0)
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
  function readSupply(p: any) {
    const e = entity(p), state = e.controller.state, defense = e.defenses.state
    return { jet: state?.fuel || 0, shield: defense?.shield?.remaining || 0,
      magnet: defense?.deflector?.remaining || 0, groundSpent: e.controller.groundDrive?.spent || 0 }
  }
  function accountSupply(p: any) {
    if (!bank || !p.entityId || !entity(p)?.isLive) return
    const now = readSupply(p), before = supplySeen.get(p.entityId)
    if (before) {
      let changed = false
      for (const [key, id, rate] of [['jet','jetpack',1],['shield','shield',itemById('shield').charge],['magnet','magnet',itemById('magnet').charge]] as const) {
        const spent = Math.max(0, before[key] - now[key]) / Number(rate)
        if (spent > 1e-9) { wallet(p).stock[id] = Math.max(0, owned(p,id) - spent); changed = true }
      }
      const groundSpent = Math.max(0, now.groundSpent - before.groundSpent)
      if (groundSpent > 1e-9) { wallet(p).stock['fuel-tank'] = Math.max(0, owned(p,'fuel-tank') - groundSpent); changed = true }
      if (changed) { wallet(p).revision++; saveBank() }
    }
    supplySeen.set(p.entityId, now)
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
    supplySeen.set(p.entityId, readSupply(p))
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
  function selectTarget(p: any, id: string) {
    const target = match.roster.find((r: any) => r.entityId === id && r !== p && !r.eliminated)
    if (!target || !entity(target)?.isLive) return false
    p.targetId = id
    const at = entity(target).position!
    entity(p).blackboard.set('custom.indigoTarget', { ...at, bodyId: entity(target).liveId })
    persist(); publish(); return true
  }
  async function planCpuShot(p: any, turn: number): Promise<boolean> {
    const tank = entity(p), token = utilityGeneration, d = doctrine(p)
    const valid = () => active() && current() === p && !p.eliminated && match.turnNumber === turn && token === utilityGeneration
    const origin = tank.position!, trials: any[] = []
    const targets = match.roster.filter((r: any) => r !== p && !r.eliminated && entity(r)?.isLive)
    const distance = (r: any) => Math.hypot(entity(r).x! - origin.x, entity(r).y! - origin.y)
    const cluster = (r: any) => targets.filter((v: any) => v !== r && Math.hypot(entity(v).x! - entity(r).x!, entity(v).y! - entity(r).y!) < 200).length
    targets.sort((a: any, b: any) => (distance(a) + (entity(a).health ?? 100) * 2 - cluster(a) * (p.personaId === 'domino' ? 180 : 30))
      - (distance(b) + (entity(b).health ?? 100) * 2 - cluster(b) * (p.personaId === 'domino' ? 180 : 30)))
    if (!targets.length) return false
    if ((tank.health ?? 100) <= 70) useBattery(p)
    syncLoadout(p)
    let budget = d.candidateBudget
    const angleError = (aiRandom(p) * 2 - 1) * d.angleErrorDegrees * Math.PI / 180
    const powerError = (aiRandom(p) * 2 - 1) * d.powerErrorPercent / 100
    const weapons = market.items.filter((i: any) => i.enabled && i.kind === 'weapon' && owned(p, i.id) > 0)
    const ranked = (target: any) => weapons.map((item: any) => {
      const pref = d.weaponPreferences.indexOf(item.id), radius = item.projectile?.aoeRadius || 0
      const collateral = Math.max(0, radius + 50 - distance(target)) * (1 - d.risk) * 3
      const previous=(p.impacts||[]).filter((m:any)=>m.weapon===item.id).at(-1)
      const ineffective=previous && p.damage-(previous.damageBefore||0)<12 ? 130 : 0
      const closeRapid=item.id==='machine-gun'&&distance(target)<400?80:0
      const benefit = (item.projectile?.damage || item.behavior?.childDamage || 0) * .25 + cluster(target) * radius * .15
      return { item, score: (pref >= 0 ? 140 - pref * 25 : -80) + benefit + closeRapid - collateral - ineffective }
    }).sort((a: any, b: any) => b.score - a.score)
    const options = ranked(targets[0]).slice(0, 2).map((v: any) => v.item)
    if(!options.some((i:any)=>i.id==='standard'))options.push(itemById('standard'))
    survey: for (const target of targets.slice(0, 2)) for (const item of options) {
      if (!valid()) return false
      if (budget < 1) break survey
      const spec = item.projectile, at = entity(target).position!, carrier = item.behavior?.mode === 'apex'
      // These casts have no supported native forecast. Preserve their ammo and
      // choose another owned weapon; never pretend a straight ray is a trajectory.
      if (spec.kind !== 'rigid-body' || spec.homing || spec.bouncing || spec.spread || spec.projectilesPerShot > 1 || !spec.speed) continue
      let point = { ...at }, support = false
      if (['mole', 'faultline'].includes(p.personaId) && (spec.carveRadius > 60 || item.behavior?.operation === 'fracture')) {
        const x = at.x + (origin.x < at.x ? -24 : 24)
        const y = talus.world.groundY(x, at.y + 8, 36)
        if (y !== null) { point = { x, y: y - 2 }; support = true }
      }
      if(!support && !carrier && spec.damage===0 && (spec.carveRadius>0 || item.behavior?.operation==='fracture')) continue
      const memory = (p.impacts || []).filter((m: any) => m.targetId === target.entityId && m.weapon === item.id
        && Math.hypot(m.origin.x - origin.x, m.origin.y - origin.y) < 48 && Math.hypot(m.target.x - at.x, m.target.y - at.y) < 48).slice(-d.impactMemory)
      const last = memory[memory.length - 1]
      // A small observed miss can bias the next surveyed aim point. A distant
      // wall hit instead requests a high arc, never ever-increasing power.
      if (!support && !carrier && last && Math.abs(last.dx) < 128 && Math.abs(last.dy) < 96)
        point.x -= clamp(memory.reduce((sum: number, m: any) => sum + m.dx, 0) / memory.length * .35, -40, 40)
      const rayFrom = { x: origin.x + Math.sign(at.x - origin.x) * 40, y: origin.y - 12 }
      const obstruction = talus.world.raycast(rayFrom, at)
      const high = carrier || at.y < origin.y - 48 || !!(obstruction && obstruction.entity?.id !== target.entityId) || !!(last && Math.abs(last.dx) >= 128)
      const allowance = Math.min(budget, Math.max(8, Math.ceil(d.candidateBudget / 3)))
      tank.weapon.equip(item.template)
      const request: BallisticPlanRequest = { target: point, ...(support ? {} : { targetBodyId: entity(target).liveId! }),
        goal: carrier ? 'apex' : 'impact', preferHighArc: high, minElevation: 5, maxElevation: 89,
        angleStep: clamp(Math.ceil(84 / allowance), 2, 30), maxCandidates: allowance,
        maxSteps: 500000, maxCells: 1000000, terrain: 'materialize', tolerance: support ? 18 : Math.min(80,28+d.angleErrorDegrees*8),
        ...(spec.speedAtMinPower===spec.speed ? {fixedAngle:Math.atan2(point.y-origin.y,point.x-origin.x)} : {}),
        angleOffset: angleError, powerOffset: powerError }
      const plan = await tank.weapon.plan(request)
      // A read-only survey may finish while the game is paused or saving.
      // Its gameplay continuation waits for simulation to resume.
      while(valid() && talus.sim.paused)await talus.sleepTicks(1)
      if (!valid()) return false
      budget -= Math.max(1, plan.work.candidates)
      trials.push({ weapon: item.id, target: target.name, reason: plan.reason, work: plan.work, warnings: plan.warnings })
      if (plan.status !== 'clear' || !plan.solution) continue
      p.weaponId = item.id; wallet(p).selected = item.id; wallet(p).revision++; saveBank()
      p.targetId = target.entityId; p.plannedTurn = turn
      p.tactic = support ? 'Remove observed support' : carrier ? 'Clear carrier to apex' : cluster(target) && p.personaId === 'domino' ? 'Cluster / chain opportunity' : high ? 'High arc over obstruction' : last ? 'Observed-miss correction' : 'Surveyed firing corridor'
      tank.blackboard.set('custom.indigoTarget', { ...point, bodyId: support ? null : entity(target).liveId })
      tank.blackboard.set('custom.aimPlan', JSON.parse(JSON.stringify(plan))); tank.blackboard.set('custom.aimRefusal', null)
      tank.blackboard.set('custom.aimAngle', plan.solution.angle); tank.blackboard.set('custom.aimPower', plan.solution.power)
      tank.blackboard.set('custom.decisionTurn', turn)
      tank.blackboard.set('custom.aiDecision', { turn, persona: p.personaId, skill: match.cpuSkill==='persona' ? personaFor(p)?.skill : match.cpuSkill || personaFor(p)?.skill,
        tactic: p.tactic, target: p.targetId, item: item.id, budgetRemaining: budget, trials, risk: d.risk, memory: memory.length })
      persist(); publish(); record('cpu-decision', tank.blackboard.get('custom.aiDecision')); return true
    }
    if (valid()) {
      syncLoadout(p)
      if(trials.some(t=>t.reason==='deflection-fields')) {
        const target=targets[0], at=entity(target).position!, trial=p.fieldProbeCount||0
        p.fieldProbeCount=trial+1;p.targetId=target.entityId;p.weaponId='standard';p.plannedTurn=turn
        wallet(p).selected='standard';wallet(p).revision++;saveBank();tank.weapon.equip(itemById('standard').template)
        const powers=[.25,.4,.55,.7,.85], elevation=trial%2?72:83
        tank.blackboard.set('custom.indigoTarget',{...at,bodyId:entity(target).liveId})
        tank.blackboard.set('custom.aimAngle',-(at.x<origin.x?180-elevation:elevation)*Math.PI/180)
        tank.blackboard.set('custom.aimPower',powers[trial%powers.length]);tank.blackboard.set('custom.decisionTurn',turn)
        tank.blackboard.set('custom.aimPlan',null);tank.blackboard.set('custom.aimRefusal','deflection-fields')
        p.tactic='Exploratory high arc through magnetic field'
        record('cpu-field-probe',{name:p.name,trial,trials});persist();publish();return true
      }
      tank.blackboard.set('custom.aiDecision' , { turn, status: 'refused', trials, budgetRemaining: budget })
      record('cpu-decision-refused', { name: p.name, trials })
    }
    return false
  }
  async function prepareCpuTurn(p:any,turn:number) {
    const token=utilityGeneration,e=entity(p),d=doctrine(p)
    const valid=()=>active() && !p.eliminated && current()===p && match.turnNumber===turn && token===utilityGeneration
    if(p.preparedTurn!==turn) {
      p.preparedTurn=turn;syncUtilities(p)
      for(const id of ['shield','magnet'] as const)if(owned(p,id)>0 && !e.defenses.state?.[id==='shield'?'shield':'deflector']?.active)useDefense(p,id)
      const others=match.roster.filter((r:any)=>!r.eliminated&&r!==p)
      const target=others.sort((a:any,b:any)=>Math.abs(entity(a).x!-e.x!)-Math.abs(entity(b).x!-e.x!))[0]
      const direction=target?Math.sign(entity(target).x!-e.x!):1
      // Utilities respond to an observed obstruction or dangerous proximity;
      // ownership alone is not a reason to drain fuel every turn.
      const close=target && Math.abs(entity(target).x!-e.x!)<100
      const wall=talus.world.raycast({x:e.x!+direction*28,y:e.y!-8},{x:e.x!+direction*70,y:e.y!-8})
      const burrow=!!wall && (p.personaId==='mole'||p.personaId==='faultline') && owned(p,'digger')>0
      if(burrow) {
        const until=talus.sim.clock+market.cpu.digSeconds
        while(valid()&&talus.sim.clock<until&&owned(p,'digger')>0) {await dig(p,direction);if(!valid())return;driveTank(p,direction*arena.moveSpeed);await talus.sleepTicks(1)}
      } else if(close && owned(p,'fuel-tank')>0 && d.risk<.7) {
        const until=talus.sim.clock+market.cpu.driveSeconds
        while(valid()&&talus.sim.clock<until) {driveTank(p,-direction*arena.moveSpeed);await talus.sleepTicks(1)}
      }
      if(valid()&&wall&&!burrow&&owned(p,'jetpack')>0&&itemById('jetpack').enabled) {
        const held=e.controller.levitate(true)
        if(held.accepted) {
          const until=talus.sim.clock+market.cpu.jetSeconds
          while(valid()&&talus.sim.clock<until)await talus.sleepTicks(1)
          if(e.isLive)e.controller.levitate(false)
        }
      }
    }
    if(!valid())return
    driveTank(p,0)
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
    else if(valid()) { p.tactic='No supported clear shot; conserve ammunition'; reward(p,'pass'); run(()=>beginTurn(true)) }
  }
  function syncLoadout(p: any) {
    const tank = entity(p); if (!tank?.isLive) return
    syncUtilities(p)
    for (const item of market.items) if (item.enabled && item.kind === 'weapon')
      tank.weapon.setAmmo(item.template, item.id === 'standard' ? null : owned(p, item.id))
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
    if (previous !== id) reward(p, 'equip')
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
      const d = doctrine(p), w = wallet(p), reserve = Math.floor(w.cash * d.saveFraction)
      const buy = (id: string, cap: number) => {
        const item = itemById(id), stock = item?.grants?.item || id
        return item?.enabled && owned(p, stock) < cap && w.cash - item.price >= reserve && purchase(p, id)
      }
      // One affordable preferred weapon bundle; keep savings for the expensive
      // favorite and consume existing stock before replenishing it.
      for (const id of d.weaponPreferences) {
        if (id === 'standard') continue
        if (owned(p,id) >= 2 || buy(id,2)) break
      }
      for (const id of d.utilityPreferences.slice(0,3)) buy(id, id==='battery'?2:1)
      // The receipt shares the same bank object as purchases; later visits do not buy again.
      Object.defineProperty(bought, playerKey(p), { value: true, enumerable: true, configurable: true, writable: true })
      bank.cpuShops[stage] = bought; saveBank()
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
        stock: item.id === 'standard' ? 'Unlimited' : item.grants ? owned(p, item.grants.item) + ' reserve charges' : String(owned(p, item.id)),
        action: 'buy-' + item.id, disabled: !item.enabled || item.price === 0 || w.cash < item.price,
        button: !item.enabled ? 'In development' : item.price === 0 ? 'Included' : w.cash < item.price ? 'Need more cash' : 'Buy bundle' })) })
  }
  function openShop() {
    if (!match || arcadeCard || !['ready', 'finished'].includes(match.phase)) return
    input(false); shopOpen = true; cpuShopping(); publishShop(); publish()
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
      weaponAmmo: bank && p.weaponId && p.weaponId !== 'standard' ? owned(p, p.weaponId) : '∞',
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
        name: i.name, stock: i.id === 'standard' ? '∞' : owned(p, i.id), action: 'equip-' + i.id,
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
    const cycle = ['wfc', 'brush', 'dune-sea', 'bunker-grid', 'shattered-highlands', 'rat-run', 'bramble-badlands', 'cavern-war', 'crater-country', 'terrace-siege']
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
      terrainSource: source || null, generated: 0, details: 0, livingSites: 0, seed: talus.world.seed, biome: arena.biome.id,
      seriesId: String(params.seriesId || talus.world.id), seriesLength: [1,3,5,7,9].includes(Number(params.seriesLength)) ? Number(params.seriesLength) : 1,
      biomeCycle: params.biomeCycle === 'cycle', biomeRounds: clamp(Math.floor(Number(params.biomeRounds)||1),1,9), baseGeneration: params.baseGeneration || generationRequest(params),
      round: Math.max(1, Math.floor(Number(params.round) || 1)), cashShots: {}, cashNotice: '',
      bounds: { ...arena.bounds, x: arena.combat.x, w: arena.combat.w },
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
    tank?.blackboard.set('custom.deathChaos', { id: job.id, effect: fx.id })
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
    job.emissionDone = true
    if (fx.finishBlast) talus.world.explode({ x: job.x, y: job.y, radius: fx.finishBlast,
      damage: 45, carveRadius: Math.round(fx.finishBlast * .6), carve: 'erase', source: job.owner })
    // The geyser remains attached to the wreck until its finale. Burst deaths
    // consume their wreck immediately; this is not a material-conversion path.
    const corpse = talus.entities.get(job.owner)
    if (corpse?.exists) corpse.despawn()
    record('chaos-emission-ended', { id: job.id, effect: job.effect, elapsed: job.elapsed,
      launched: job.launched, particles: job.particles, livePulses: job.livePulses })
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
    if (!match.chaos.jobs.length) { match.chaos.quiet += dt; return }
    match.chaos.quiet = 0
    // Work on a snapshot: blasts may enqueue another death during this pass.
    for (const job of [...match.chaos.jobs]) {
      const fx = chaosCatalog.effects.find((v: any) => v.id === job.effect)
      if (!fx?.enabled) throw new Error('Death effect needs engine support: ' + job.effect)
      job.elapsed += dt
      const wreck = talus.entities.get(job.owner)?.position
      if (!job.emissionDone && wreck) { job.x = wreck.x; job.y = wreck.y }
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
          const n = job.emitted++
          if (fx.mode === 'spray') {
            const placed = talus.world.spawnParticles({ element: fx.element,
              x: job.x, y: job.y - 26, count: fx.count, vx: 0, vy: -fx.speed,
              spread: fx.spread, speedJitter: .3 })
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
        }
        if (job.elapsed >= fx.duration) finishEmission(job, fx)
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
    if (oldAngle !== newAngle) reward(current(), 'aim')
    if (oldPower !== newPower) reward(current(), 'power')
    aim()
  }
  function frameRoster(focus?: { x: number, y: number }) {
    if (!match || !arena) return
    const alive = match.roster.filter((p: any) => !p.eliminated)
    const points = alive.map((p: any) => (p.entityId ? entity(p)?.position : null)
      || { x: p.spawnX, y: arena.surfaceBand.top + arena.surfaceBand.height / 2 })
    // A wreck can keep emitting after its owner leaves the living roster.
    // Keep those bounded, temporary hazards in the same active camera frame.
    // Only living tanks define the mandatory ring. Secondary shells own native
    // flight regions; an off-world wreck must never drag living tanks away.
    if (!points.length && focus) points.push(focus)
    if (!points.length && match.presentation.active) points.push(match.presentation.active)
    if (!points.length) { talus.camera.frame(null); return }
    const left = Math.min(...points.map((p: any) => p.x)), right = Math.max(...points.map((p: any) => p.x))
    const top = Math.min(...points.map((p: any) => p.y)), bottom = Math.max(...points.map((p: any) => p.y))
    const half = arena.combat.tankHalfWidth
    const result = talus.camera.frame({ bounds: { x: left - half, y: top - half,
      w: right - left + half * 2, h: bottom - top + half * 2 }, padding: 32, preferVisible: true })
    if (!result?.fitsSimulation) throw new Error('The surviving roster exceeds the supported simulation frame')
    // Zoom/frame use the real renderer and engine ring. A small window may
    // clip the view, but the residency constraint always takes priority.
    const notice = result.fitsViewport ? '' : 'Window too small to show every tank; all tanks remain active.'
    if (match.frameNotice !== notice) { match.frameNotice = notice; talus.ui.set('frameNotice', notice) }
    talus.camera.centerOn(focus || { x: (left + right) / 2, y: (top + bottom) / 2 })
  }
  function movementVelocity(x: number, requested: number, dt: number) {
    const left = match.bounds.x + arena.combat.tankHalfWidth
    const right = match.bounds.x + match.bounds.w - arena.combat.tankHalfWidth
    if (dt <= 0) return 0
    // Stop the hull at the combat boundary; permit inward movement from an edge.
    return requested < 0 ? Math.max(requested, Math.min(0, (left - x) / dt))
      : Math.min(requested, Math.max(0, (right - x) / dt))
  }
  async function focus() {
    const e = entity(current())
    if (match.phase === 'focusing') { talus.ui.fade(1, { ms: 180 }); await talus.sleepTicks(12) }
    talus.camera.follow('off'); frameRoster()
    if (!await e.whenLive({ timeoutTicks: 600 })) {
      if (current().eliminated) return false
      throw new Error('Tank could not be restored: ' + current().name)
    }
    for (let n = 0; n < 600 && !e.isLive && !current().eliminated; n++) await talus.sleepTicks(1)
    if (current().eliminated) return false
    if (!e.isLive) throw new Error('Tank ground did not become ready')
    syncLoadout(current())
    // Restoring the entity and registering its equipped weapon are separate
    // readiness steps. aim() returns false until the weapon can accept it.
    let aimed = aim()
    for (let n = 0; n < 600 && !aimed && !current().eliminated; n++) { await talus.sleepTicks(1); aimed = aim() }
    if (current().eliminated) return false
    if (!aimed) throw new Error('Tank weapon did not become ready: ' + current().name)
    nameplate(current())
    talus.ui.fade(0, { ms: 240 })
    return true
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
    if (!p.eliminated && e?.isLive) {
      const receipt = e.controller.setPosture({ ...arena.posture.controller, mode: 'passive' })
      if (!receipt.accepted) record('posture-refused', { owner: p.entityId, mode: 'passive', receipt })
    }
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
  async function beginTurn(next: boolean) {
    if (['focusing', 'positioning', 'deploying', 'finished', 'fault'].includes(match.phase)) return
    if (presenting()) { match.pendingTurn = next; return }
    match.pendingTurn = null
    input(false); match.phase = 'focusing'; persist(); checkRoster()
    if (finish()) return
    const previous = current()
    if (next) await turnScoreCard()
    else if (!match.turnNumber) await showArcadeCard('SCORCHED TERRA', 'BATTLE STATIONS', 'Round ' + match.round + ' · Seed ' + match.seed, 2.5)
    if (match.phase !== 'focusing') return
    checkRoster(); if (finish()) return
    if (next && !previous.eliminated) passivePosture(previous)
    if (next) do { match.focusIndex = (match.focusIndex + 1) % match.roster.length } while (current().eliminated)
    autoDefend()
    match.turnNumber++; match.remaining = match.turnSeconds; match.shotId = null; match.impact = null
    match.message = 'Loading ' + current().name; persist(); publish()
    const ready = await focus()
    if (match.phase !== 'focusing') return
    if (ready && !current().eliminated) {
      await showArcadeCard('TURN ' + match.turnNumber + ' / COMMAND CARTRIDGE', current().name, current().control==='cpu' ? (personaFor(current())?.factionName || 'CPU')+' · '+(match.cpuSkill==='persona'?personaFor(current())?.skill:match.cpuSkill||personaFor(current())?.skill) : 'Your controller. Your crater.', 1, current().color)
      checkRoster(); if (finish()) return
      if (current().eliminated) { match.phase = 'turn'; run(() => beginTurn(true)); return }
      if (match.phase === 'focusing') startTurn()
    }
    else { match.phase = 'turn'; run(() => beginTurn(true)) }
  }
  function autoDefend() {
    if (match.autoDefenseChecked) return
    match.autoDefenseChecked = true
    for (const p of match.roster) {
      if (p.eliminated || owned(p, 'auto-defense') < 1) continue
      syncUtilities(p)
      const e = entity(p); let activated = false
      for (const kind of ['shield', 'deflector'] as const) {
        const state = e.defenses.state?.[kind]
        if (state && !state.active && state.remaining > 0) activated = e.defenses.activate(kind, true).accepted || activated
      }
      if (activated) {
        wallet(p).stock['auto-defense']--; wallet(p).revision++; saveBank()
        record('utility', { name: p.name, item: 'auto-defense' })
      }
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
    if (current().control === 'cpu') run(()=>prepareCpuTurn(current(),match.turnNumber))
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
      angle: e.weapon.state!.angle, origin: null }
    record('fire-request', { owner: e.id, angle: e.blackboard.get('custom.angle'), power: e.blackboard.get('custom.power') })
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
      record('terrain-payload',{weapon:a.item,owner:a.owner,origin,angle:a.angle,shape,receipt})
      if(receipt.status!=='completed') {match.message='Terrain work refused: '+receipt.reason;publish()}
    } finally {a.tasks--}
  }
  function tickAttack() {
    const a = match.attack
    if (!a || a.rootId == null) return
    const item = itemById(a.item), b = item.behavior
    if (b?.mode === 'burst' && a.emitted < b.count && talus.sim.clock - a.launchClock >= a.emitted * b.interval) {
      const p = match.roster.find((r: any) => r.entityId === a.owner), tank = entity(p)
      if (p.eliminated || !tank?.isLive) a.emitted = b.count
      else {
        const angle = -Number(tank.blackboard.get('custom.angle')) * Math.PI / 180 + (chaosRandom() - .5) * b.jitter * 2
        const spec = item.projectile, pos = tank.position!, count = spec.projectilesPerShot || 1
        for (let n = 0; n < count; n++) attackShell({ x: pos.x + Math.cos(angle) * spec.spawnOffset,
          y: pos.y + Math.sin(angle) * spec.spawnOffset, vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed },
          { ...spec, projectilesPerShot: 1, element: spec.material || 'IRON' }, 1)
        a.emitted++
      }
    }
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
    const targets = match.roster.filter((r: any) => !r.eliminated && r !== p)
    // Nearby weak opponents take priority; a new target never inherits the previous target's range error.
    const priority = (r: any) => Math.abs(entity(r).x! - origin.x) + (entity(r).health ?? 100) * 3
    targets.sort((a: any, b: any) => (p.control==='human'&&a.entityId===p.targetId?-Infinity:priority(a)) - (p.control==='human'&&b.entityId===p.targetId?-Infinity:priority(b)))
    if (!targets.length) { checkRoster(); finish(); return }
    const target = entity(targets[0]).position!
    const carrier = itemById(p.weaponId).behavior?.mode === 'apex'
    p.targetId = targets[0].entityId; p.tactic = carrier ? 'Surveyed carrier clearance to apex' : 'Surveyed ballistic corridor'
    tank.blackboard.set('custom.indigoTarget', { x: target.x, y: target.y, bodyId: entity(targets[0]).liveId })
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
    frameRoster(p)
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
  async function generateBrushArena() {
    const columns = arena.bounds.w / 512, jobs: any[] = []
    // Build the complete bottom tile before releasing any loose material.
    for (const [y, h, recipe] of [[1024, 256, generationRecipes.foundation], [896, 128, generationRecipes.fill], [384, 512, generationRecipes.surface]] as const)
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
    const count = 50
    for (let n = match.details || 0; n < count; n++) {
      const hash = chaosSeed(match.seed + ':detail:' + n), size = 64 + hash % 65
      const x = arena.bounds.x + 128 + n * 256 + (hash % 80), ground = await talus.world.findSurface(x, 384, 512)
      if (ground === null) throw new Error('Brush detail has no connected surface at ' + x)
      const radius = size / 2, y = ground + radius / 2, recipe = generationRecipes.details[hash % generationRecipes.details.length]
      const cells = (Math.ceil(x + radius) - Math.floor(x - radius)) * (Math.ceil(y + radius) - Math.floor(y - radius))
      match.message = 'Detail brushes · ' + (n + 1) + ' / ' + count; publish()
      const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius }, bounds: { ...arena.bounds, h: 1024 },
        replacement: 'empty', budget: { cells, particles: cells, work: cells }, recipe, seed: hash,
        ...(n % generationRecipes.neural.every === 0 ? { neural: { modelId: generationRecipes.neural.modelId,
          steps: generationRecipes.neural.steps, tintStrength: generationRecipes.neural.tintStrength } } : {}) })
      if (receipt.status !== 'completed') throw new Error('Detail brush ' + n + ': ' + receipt.reason)
      match.details = n + 1; persist(); record('generation-detail', { n, size, recipe: recipe.id, x, y, receipt })
    }
    await generateLivingArena()
    record('generation-complete', { mode: 'brush', jobs: jobs.length + count + generationRecipes.living.sites, bounds: arena.bounds })
  }
  async function generateLivingArena() {
    const living = generationRecipes.living
    const exclusion = { x: arena.combat.x - living.clearCombatMargin, y: arena.bounds.y,
      w: arena.combat.w + living.clearCombatMargin * 2, h: arena.bounds.h }
    for (let n = match.livingSites || 0; n < living.sites; n++) {
      const hash = chaosSeed(match.seed + ':living:' + n)
      const x = Math.floor(arena.bounds.x + (n + .5) * arena.bounds.w / living.sites)
      // Native masks protect the deployment corridor as well as the floor.
      // Sites rooted inside the protected corridor have no plant to request.
      if (x >= exclusion.x && x < exclusion.x + exclusion.w) {
        match.livingSites = n + 1; persist(); record('generation-living-skipped', { n, reason: 'combat corridor' }); continue
      }
      const ground = await talus.world.findSurface(x, arena.surfaceBand.top, arena.surfaceBand.height)
      if (ground === null) throw new Error('Living brush has no support at ' + x)
      const size = living.brushSizes[n % living.brushSizes.length], preset = living.presets[n % living.presets.length]
      const shape = { x: x - living.regionSize / 2, y: ground - living.regionSize + 32,
        w: living.regionSize, h: living.regionSize }, cells = shape.w * shape.h
      match.message = 'Living landscape · ' + (n + 1) + ' / ' + living.sites; publish()
      const receipt = await talus.world.terrainWork({ kind: 'growth', shape,
        bounds: { ...arena.bounds, h: 1024 }, exclusions: [exclusion], replacement: 'empty', seed: hash,
        budget: { cells, particles: cells, work: cells }, growth: { presetId: preset.id,
          origin: { x, y: ground }, path: [{ x: x - 2, y: ground - 1 }, { x: x + 2, y: ground - 1 }],
          radius: size / 2, steps: living.steps, jobs: living.jobs, fragments: living.fragments } })
      if (receipt.status !== 'completed') throw new Error('Living brush ' + n + ': ' + receipt.reason)
      match.livingSites = n + 1; persist(); record('generation-living', { n, size, preset: preset.id, x, ground, receipt })
    }
    record('generation-living-complete', { sites: living.sites, bounds: arena.bounds })
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
      talus.camera.setZoom(0.25); talus.camera.follow('off')
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
      if (match.attack) throw new Error('An attack was interrupted by loading. Native projectile/cast persistence is required; start a fresh match.')
      if (match.presentation.active) match.presentation.active.started = talus.sim.clock - Math.min(3, match.presentation.active.elapsed || 0)
      ensureWallets()
      for (const p of match.roster) p.autoAimTurn = null // Unapplied assistance never debits stock across reload.
      for (const job of match.chaos.jobs) for (const id of job.projectileIds)
        if (!talus.projectiles.get(id)?.exists) throw new Error('A saved death shell is missing; engine projectile persistence is required.')
      talus.ui.closeMenu(); talus.ui.hud('Menus/hud.html'); talus.camera.follow('off')
      if (match.phase === 'deploying') {
        const generation = talus.world.generation.status()
        if (generation.phase === 'failed') throw new Error('Native terrain generation: ' + generation.reason)
        record('terrain-source', generation)
        if (match.generation === 'brush') await generateBrushArena()
        else if (match.generation === 'bramble-badlands') await generateLivingArena()
        for (const p of match.roster) {
          if (p.entityId && p.placementReady) continue
          match.message = 'Deploying ' + (p.index + 1) + ' / ' + match.roster.length; publish()
          const ground = await talus.world.findSurface(p.spawnX, arena.surfaceBand.top, arena.surfaceBand.height)
          if (ground === null) throw new Error('Missing arena surface at ' + p.spawnX)
          frameRoster(); await talus.sleepTicks(90)
          const tank = p.entityId ? entity(p) : await talus.entities.spawn(p.templateId || arena.tankTemplate, p.spawnX, ground - 48)
          if (!tank) throw new Error('Tank spawn refused: ' + p.name)
          if (!p.entityId) record('spawn-pose', { owner: tank.id, pose: tank.snapshot() })
          p.entityId = tank.id; p.surfaceY = ground; persist()
          tank.blackboard.set('name', p.name); tank.blackboard.set('custom.indigoPlayer', p.index)
          tank.blackboard.set('custom.control', p.control); tank.blackboard.set('custom.angle', 45); tank.blackboard.set('custom.power', 70)
          if (!await tank.whenLive({ timeoutTicks: 600 })) throw new Error('Tank did not become live')
          await preparePlacement(p)
          syncLoadout(p)
          nameplate(p); record('deployed', { name: p.name, id: tank.id })
        }
        match.phase = 'ready'; match.message = 'Tanks ready — begin when your crew is ready'; persist()
      }
      if (match.phase === 'ready' || match.phase === 'turn' || match.phase === 'focusing') {
        await focus()
      } else if (match.phase === 'flight') {
        shot = talus.projectiles.get(match.shotId)
        if (!shot?.exists) throw new Error('The saved shot is missing. Projectile persistence needs engine investigation.')
      } else if (match.phase === 'firing') throw new Error('Save interrupted a queued shot; engine cast persistence needs investigation.')
      else if (match.phase === 'finished') {
        const scores: any = talus.installed.get('indigo.scores'); talus.ui.set('scores', Object.values(scores?.players || {}))
      }
      for (const p of match.roster) if (!p.eliminated && (p !== current() || ['ready', 'finished'].includes(match.phase))) passivePosture(p)
      const resumePositioning = match.phase === 'positioning'
      if (resumePositioning) match.phase = 'turn'
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
        frameRoster(cue); speech(p, cue.text)
      }
      input(match.phase === 'turn' && current().control === 'human')
      if (match.phase === 'settling') run(settle)
      if (resumePositioning) run(fire)
      else if (match.phase === 'focusing') startTurn()
      else if (match.phase === 'turn' && current().control === 'cpu') run(()=>prepareCpuTurn(current(),match.turnNumber))
      publish(); talus.state.set('indigo.error', ''); record('match-ready', { phase: match.phase })
      if (['ready', 'finished'].includes(match.phase)) openShop()
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
      record('cpu-unreachable', { name: current().name, plan: tank.blackboard.get('custom.aimPlan'), reason: tank.blackboard.get('custom.aimRefusal') }); run(() => beginTurn(true))
    }
  })
  talus.on('indigo:cpu-fire', e => { if (active() && current().control === 'cpu' && e.id === current().entityId && e.turn === match.turnNumber) run(fire) })
  talus.on('input.pressed', e => {
    if (e.slot !== 0 || !human()) return
    if (e.action === 'tank_target') { const choices=match.roster.filter((r:any)=>r!==current()&&!r.eliminated);const at=choices.findIndex((r:any)=>r.entityId===current().targetId);if(choices.length)selectTarget(current(),choices[(at+1)%choices.length].entityId) }
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
    if (launchingChaos || !a || e.owner?.id !== a.owner) return
    const p = match.roster.find((r: any) => r.entityId === a.owner), item = itemById(a.item)
    if (!a.spent) {
      if (a.item !== 'standard') {
        if (owned(p, a.item) < 1) { fail('Paid cannon fired without purchased ammunition'); return }
        wallet(p).stock[a.item]--; wallet(p).revision++
        record('ammo-spent', { name: p.name, item: a.item, remaining: owned(p, a.item) })
      }
      if (item.behavior?.mode.startsWith('battery')) wallet(p).stock.battery--
      p.shots=(p.shots||0)+1
      a.spent = true; saveBank()
    }
    const snapshot = e.projectile.snapshot()
    a.ids[e.projectileId] = { depth: childDepth, vy: snapshot?.vy ?? -1, vx: snapshot?.vx ?? 0, split: false }
    a.launched++
    if (a.rootId == null) { a.rootId = e.projectileId; a.launchClock = talus.sim.clock; a.origin = { x: snapshot!.x, y: snapshot!.y } }
    if (item.behavior?.mode === 'homing' && p.targetId) e.projectile.setTarget(entity(match.roster.find((r: any) => r.entityId === p.targetId)))
    shot = e.projectile; match.shotId = e.projectileId; match.phase = 'flight'; match.waitTicks = 0
    match.message = 'Attack in flight'; persist(); publish()
    record('launch', { id: e.projectileId, owner: a.owner, weapon: a.item, depth: childDepth, snapshot })
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
          impact:at,reason:e.reason,damageBefore:a.damageBefore||0,dx:at.x-targetAt.x,dy:at.y-targetAt.y,power:Number(tank.blackboard.get('custom.power'))}
        p.impacts=[...(p.impacts||[]),observation].slice(-doctrine(p).impactMemory)
        tank.blackboard.set('custom.aiImpacts',p.impacts);record('cpu-observation',observation)
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
    if (p && e.entity.isLive) {
      const cue = match.presentation.active
      nameplate(p); if (active() && p === current()) aim()
    }
  })
  talus.on('entity.land', e => {
    if (match?.roster.some((p: any) => p.entityId === e.entity?.id)) record('land', { id: e.entity?.id })
  })
  talus.on('tick.sim.post',()=>{if(!booted||booting||!match||!bank)return;for(const p of match.roster)if(!p.eliminated&&p.entityId&&entity(p)?.isLive)syncUtilities(p)})
  talus.on('tick.sim.pre', e => {
    if (match && arena && match.phase !== 'fault') {
      const focus = match.phase === 'flight' ? shot?.snapshot() : match.phase === 'settling' ? match.impact : null
      const cue = match.presentation.active
      try { frameRoster(cue ? cue.kind === 'death' ? cue : entity(match.roster.find((p: any) => p.entityId === cue.owner))?.position || cue : focus || undefined) }
      catch (error) { fail(error); return }
    }
    if (!booted || booting || !match || match.phase === 'fault') return
    if (match.phase !== 'finished') {
      try { tickPresentation(); tickAttack(); tickChaos(e.dt) } catch (error) { fail(error); return }
    }
    ticks++
    if (ticks % 6 === 0) {
      checkRoster()
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
    if (match.remaining <= 0) { reward(current(), 'timeout'); record('timeout'); run(() => beginTurn(true)); return }
    if (ticks % 6 === 0) { persist(); publish() }
  })
}
