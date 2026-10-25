// Indigo M8: cash, a persistent armory and a shop between seeded rounds.
// Physical weapons remain engine-authored; unavailable utilities stay locked.
if (!talus.editor.available) {
  let arena: any, match: any, chaosCatalog: any, quipCatalog: any, quipDeck: any, market: any, bank: any
  let shopOpen = false, shopIndex = 0
  let booting = false, booted = false, ticks = 0
  let launchingChaos = false
  let shot: Projectile | null = null
  let utilityGeneration = 0, digging = false, nextDigAt = 0
  const supplySeen = new Map<string, { jet: number, shield: number, magnet: number }>()
  const colors = ['#bcb1ff', '#ffbd82', '#8ae0ca', '#f7a5c4', '#a4d2ff', '#ebd78a']
  const entity = (p: any): Entity => talus.entities.get(p.entityId)!
  const current = () => match.roster[match.focusIndex]
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const active = () => booted && !booting && match?.phase === 'turn'
  const human = () => active() && current().control === 'human'
  type SpeechKind = 'shooting' | 'death'
  type Speech = { owner: string, name: string, color: string, kind: SpeechKind, text: string,
    screenX: number, screenY: number, age: number, lifetime: number }
  let speech: Speech[] = [], speechFrameTime = 0
  function nextQuip(kind: SpeechKind) {
    // One installation-wide deck continues across rounds and old-save reloads.
    // A unique world id seeds the first shuffle; terrain seeds never reset it.
    // Dialogue must not consume the combat/death-effect random stream.
    if (!quipDeck) quipDeck = talus.installed.get('indigo.dialogue') || {
      version: 1, rng: chaosSeed(talus.world.id + ':dialogue'), bags: { shooting: [], death: [] }, last: {} }
    if (quipDeck.version !== 1) throw new Error('Unsupported dialogue deck')
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
  function speechPosition(at: { x: number, y: number }) {
    const view = talus.camera.view.viewport
    const desiredX = clamp((at.x - view.x) / view.w * 100, 10, 90)
    const desiredY = clamp((at.y - view.y) / view.h * 100, 28, 78)
    // Choose a free position once. Existing speakers never shuffle to make room.
    for (const dx of [0, -22, 22, -44, 44]) {
      const screenX = clamp(desiredX + dx, 10, 90)
      for (const dy of [0, -12, 12, -24, 24, -36, 36]) {
        const screenY = clamp(desiredY + dy, 28, 78)
        if (speech.every(b => Math.abs(b.screenX - screenX) > 19 || Math.abs(b.screenY - screenY) >= 11))
          return { screenX, screenY }
      }
    }
    return { screenX: desiredX, screenY: desiredY }
  }
  function publishSpeech() {
    // Screen-space for the entire lifetime: neither camera nor actor movement
    // can drag a sentence away while someone is reading it.
    talus.ui.set('speech', speech.map(b => ({
      name: b.name, text: b.text, color: b.color, kind: b.kind === 'death' ? 'LAST WORDS' : 'FIRING',
      left: 'clamp(140px, ' + b.screenX.toFixed(2) + '%, calc(100% - 140px))',
      top: 'clamp(210px, calc(' + b.screenY.toFixed(2) + '% - 34px), calc(100% - 150px))',
      opacity: clamp((b.lifetime - b.age) / .6, 0, 1)
    })))
  }
  function say(p: any, kind: SpeechKind, position?: { x: number | null, y: number | null }) {
    const tank = entity(p), at = position?.x != null && position.y != null ? position : tank?.position
    if (!at || at.x == null || at.y == null) throw new Error('Speech has no tank position: ' + p.name)
    const line = nextQuip(kind)
    tank?.blackboard.set('custom.lastQuip', { id: line.id, text: line.text, kind, turn: match.turnNumber })
    // A last word replaces that tank's firing line and survives the wreck's removal.
    speech = speech.filter(b => b.owner !== p.entityId)
    if (speech.length === 6) {
      const firstShot = speech.findIndex(b => b.kind === 'shooting')
      if (kind === 'shooting' && firstShot < 0) {
        record('quip', { owner: p.entityId, name: p.name, speechKind: kind, ...line, crowded: true }); return
      }
      speech.splice(firstShot < 0 ? 0 : firstShot, 1)
    }
    speech.push({ owner: p.entityId, name: p.name, color: p.color, kind, text: line.text,
      ...speechPosition({ x: Number(at.x), y: Number(at.y) }),
      age: 0, lifetime: kind === 'death' ? 5.5 : 4.5 })
    record('quip', { owner: p.entityId, name: p.name, speechKind: kind, ...line })
    publishSpeech()
  }
  function tickSpeech(dt: number) {
    if (!speech.length) return
    for (const b of speech) b.age += Math.max(0, dt)
    const before = speech.length
    speech = speech.filter(b => b.age < b.lifetime)
    speechFrameTime += Math.max(0, dt)
    if (speechFrameTime >= .075 || before !== speech.length) {
      speechFrameTime = 0; publishSpeech()
    }
  }
  function input(enabled: boolean) {
    for (const p of talus.players.list()) p.inputEnabled = enabled && p.slot === 0
    if (!enabled) {
      utilityGeneration++; talus.world.cancelTerrainWork()
      for (const p of match?.roster || []) {
        const e = p.entityId ? entity(p) : null
        if (e?.isLive && e.controller.state?.enabled) e.controller.levitate(false)
      }
    }
  }
  function persist() { talus.state.setJson('indigo.match', match) }
  function record(kind: string, detail: any = {}) {
    const rows: any = talus.state.getJson('indigo.events') || []
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
      magnet: defense?.deflector?.remaining || 0 }
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
  async function prepareCpuTurn(p:any,turn:number) {
    const token=utilityGeneration,e=entity(p)
    const valid=()=>active() && !p.eliminated && current()===p && match.turnNumber===turn && token===utilityGeneration
    if(p.preparedTurn!==turn) {
      p.preparedTurn=turn;syncUtilities(p)
      for(const id of ['shield','magnet'] as const)if(owned(p,id)>0 && !e.defenses.state?.[id==='shield'?'shield':'deflector']?.active)useDefense(p,id)
      const others=match.roster.filter((r:any)=>!r.eliminated&&r!==p)
      const target=others.sort((a:any,b:any)=>Math.abs(entity(a).x!-e.x!)-Math.abs(entity(b).x!-e.x!))[0]
      const direction=target?Math.sign(entity(target).x!-e.x!):1
      const until=talus.sim.clock+market.cpu.digSeconds
      while(valid() && owned(p,'digger')>0 && talus.sim.clock<until) {
        await dig(p,direction)
        if(!valid())return
        const s=e.snapshot()!;e.setVelocity(movementVelocity(s.x,direction*arena.moveSpeed,1/60),s.vy);await talus.sleepTicks(1)
      }
      if(valid()&&owned(p,'jetpack')>0&&itemById('jetpack').enabled) {
        const held=e.controller.levitate(true)
        if(held.accepted) {
          record('utility',{name:p.name,item:'jetpack',held:true,fuel:e.controller.state?.fuel})
          const until=talus.sim.clock+market.cpu.jetSeconds
          while(valid()&&talus.sim.clock<until)await talus.sleepTicks(1)
          if(e.isLive)e.controller.levitate(false)
        }
      }
    }
    if(valid()){const s=e.snapshot()!;e.setVelocity(0,s.vy);e.runGraph(arena.cpuGraph,{turn})}
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
    w.cash -= item.price; w.spent += item.price; w.stock[id] = owned(p, id) + item.bundle; w.revision++
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
      const preferences = market.cpu.weapons.filter((id:string)=>itemById(id).enabled)
      const choice = preferences[(p.index + match.round - 1) % preferences.length]
      // Buy a small basket, retaining savings and existing ammo for later rounds.
      if (owned(p, choice) < 3) purchase(p, choice)
      const utilities=market.cpu.utilities.filter((id:string)=>itemById(id).enabled)
      const utility=utilities[(p.index+match.round-1)%utilities.length]
      if(utility&&owned(p,utility)<itemById(utility).bundle)purchase(p,utility)
      if (owned(p, 'battery') < 2) purchase(p, 'battery')
      // The receipt shares the same bank object as purchases; later visits do not buy again.
      Object.defineProperty(bought, playerKey(p), { value: true, enumerable: true, configurable: true, writable: true })
      bank.cpuShops[stage] = bought; saveBank()
    }
  }
  function publishShop() {
    if (!shopOpen) return
    const p = match.roster[shopIndex], w = wallet(p)
    talus.ui.set('shop', { name: p.name, color: p.color, cash: w.cash, earned: p.cashEarned,
      revision: w.revision, account: playerKey(p), index: shopIndex + 1, count: match.roster.length,
      title: match.phase === 'finished' ? 'Between rounds' : 'Opening armory',
      result: match.phase === 'finished' ? match.message : 'New pilots get $' + market.startingCash + '. Cash and supplies carry between rounds.',
      finished: match.phase === 'finished', ready: match.phase === 'ready',
      round: match.round + 1, humans: match.humans, computers: match.computers,
      turnSeconds: match.turnSeconds, namesText: match.roster.map((r: any) => r.name).join('\n'),
      message: p.control === 'cpu' ? 'Computer pilot: purchases made automatically. You can inspect or add supplies.' : 'Your wallet and unused supplies carry into the next round.',
      receipts: Object.entries(p.cashBreakdown).map(([action, amount]) => ({ action, amount: Number(amount) })),
      items: market.items.map((item: any) => ({ id: item.id, name: item.name, description: item.description,
        category: item.kind === 'weapon' ? 'WEAPON' : 'UTILITY',
        price: item.price ? '$' + item.price + ' / ' + item.bundle : 'Always available',
        stock: item.id === 'standard' ? 'Unlimited' : String(owned(p, item.id)),
        action: 'buy-' + item.id, disabled: !item.enabled || item.price === 0 || w.cash < item.price,
        button: !item.enabled ? 'In development' : item.price === 0 ? 'Included' : w.cash < item.price ? 'Need more cash' : 'Buy bundle' })) })
  }
  function openShop() {
    if (!match || !['ready', 'finished'].includes(match.phase)) return
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
      tactic: p.tactic || '', target: match.roster.find((r: any) => r.entityId === p.targetId)?.name || '',
      shotDirection: Number(e?.blackboard.get('custom.angle') ?? 45) > 90 ? '← LEFT' : 'RIGHT →',
      aimRotation: 'rotate(' + -Number(e?.blackboard.get('custom.angle') ?? 45) + 'deg)',
      lastHit: match.lastHit || '', frameNotice: match.frameNotice || '',
      cashNotice: match.cashNotice || '', round: match.round,
      cash: bank ? wallet(p).cash : 0, roundCash: p.cashEarned || 0,
      weaponName: market ? itemById(p.weaponId || 'standard').name : 'Field cannon',
      weaponAmmo: bank && p.weaponId && p.weaponId !== 'standard' ? owned(p, p.weaponId) : '∞',
      batteries: bank ? owned(p, 'battery') : 0,
      supplies: bank ? {jet:e?.isLive?(e.controller.state?.fuel??0).toFixed(1):'0',jetStock:owned(p,'jetpack').toFixed(1),dig:owned(p,'digger').toFixed(1),jetCapacity:e?.isLive?(e.controller.state?.capacity??null):null,
        shield:e?.isLive?Math.round(e.defenses.state?.shield?.remaining||0):0,shieldCapacity:e?.isLive?(e.defenses.state?.shield?.spec.capacity??0):0,magnetCapacity:e?.isLive?(e.defenses.state?.deflector?.spec.capacity??0):0,magnet:e?.isLive?(e.defenses.state?.deflector?.remaining||0).toFixed(1):'0',
        shieldOn:!!e?.isLive&&!!e.defenses.state?.shield?.active,magnetOn:!!e?.isLive&&!!e.defenses.state?.deflector?.active}:null,
      canEquip: !shopOpen && (human() || match.phase === 'ready'),
      loadout: market && bank ? market.items.filter((i: any) => i.enabled && i.kind === 'weapon').map((i: any) => ({
        name: i.name, stock: i.id === 'standard' ? '∞' : owned(p, i.id), action: 'equip-' + i.id,
        disabled: owned(p, i.id) <= 0, selected: p.weaponId === i.id })) : [],
      chaosNotice: match.chaos?.notice || '', chaosCount: match.chaos?.jobs.length || 0,
      remaining: Math.max(0, Math.ceil(match.remaining)), turnSeconds: match.turnSeconds,
      ready: match.phase === 'ready', human: human(),
      canSetup: ['ready', 'finished', 'fault'].includes(match.phase), canShop: ['ready', 'finished'].includes(match.phase), finished: match.phase === 'finished',
      winner: match.winner || 'Draw',
      current: { name: p.name, color: p.color, control: p.control === 'human' ? 'Human' : 'Computer',
        angle: Number(e?.blackboard.get('custom.angle') ?? 45),
        power: Number(e?.blackboard.get('custom.power') ?? 70), health: e?.health == null ? '…' : Math.round(e.health) },
      roster: match.roster.map((r: any) => ({ name: r.name, color: r.color,
        health: r.eliminated ? 0 : !r.entityId ? 100 : entity(r)?.health == null ? '…' : Math.max(0, Math.round(entity(r).health!)),
        status: r.eliminated ? 'OUT' : r.index === match.focusIndex ? 'CURRENT' : 'WAITING', kills: r.kills,
        cash: bank ? wallet(r).cash : 0, earned: r.cashEarned || 0 })),
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
    const count = humans + computers, span = arena.combat.w - arena.combat.spawnInset * 2
    const left = arena.combat.x + arena.combat.spawnInset
    const roster = Array.from({ length: count }, (_, i) => ({ index: i,
      name: supplied[i] || (i < humans ? 'Player ' + (i + 1) : 'CPU ' + (i - humans + 1)),
      control: i < humans ? 'human' : 'cpu', color: colors[i % colors.length], entityId: null,
      spawnX: Math.round(left + span * i / (count - 1)), eliminated: false, kills: 0,
      cashEarned: 0, cashBreakdown: {}, weaponId: 'standard', moveDistance: 0,
    }))
    if (new Set(roster.map(p => p.name.toLowerCase())).size !== count)
      throw new Error('Use a different name for each tank so scores stay distinct.')
    return { version: 8, seed: talus.world.seed, biome: arena.biome.id,
      round: Math.max(1, Math.floor(Number(params.round) || 1)), cashShots: {}, cashNotice: '',
      bounds: { ...arena.bounds, x: arena.combat.x, w: arena.combat.w },
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
        bodySizePx: 4, gravityScale: 1, drag: 0, lifetime: 6,
        damage: 55, damageType: 'blast', aoeRadius: 72, carveRadius: 28, carveMode: 'erase',
        detonate: { onBody: true, onTerrain: true, atLifetime: true }, ...spec })
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
        if (fx.mode === 'magazine') {
          // One hundred real projectile launches and detonations, in one tick.
          for (let n = 0; n < fx.count; n++) chaosShell(job, {}, true)
          finishEmission(job, fx)
        }
      }
      if (!job.emissionDone) {
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
    const newAngle = Math.round(clamp(oldAngle + angle, 5, 175) * 10) / 10
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
    for (const job of match.chaos.jobs) points.push({ x: job.x, y: job.y })
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
    talus.ui.nameplate(e, { text: current().name, bar: 'health', color: current().color })
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
    say(p, 'death', at)
    queueChaos(p, at)
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
    if (match.chaos.jobs.length || match.chaos.quiet < chaosCatalog.resultQuietSeconds) {
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
        scores.players = { ...scores.players, [key]: s }
      }
      scores.matches[talus.world.id] = { winner: match.winner, seed: match.seed }
      talus.installed.set('indigo.scores', scores)
    }
    talus.ui.set('scores', Object.values(scores.players))
    persist(); publish(); record('finished', { winner: match.winner })
    run(() => announce('Indigo Result', { winner: match.winner || 'Nobody' })); openShop(); return true
  }
  async function beginTurn(next: boolean) {
    if (['focusing', 'deploying', 'finished', 'fault'].includes(match.phase)) return
    input(false); match.phase = 'focusing'; checkRoster()
    if (finish()) return
    if (next) do { match.focusIndex = (match.focusIndex + 1) % match.roster.length } while (current().eliminated)
    match.turnNumber++; match.remaining = match.turnSeconds; match.shotId = null; match.impact = null
    match.message = 'Loading ' + current().name; persist(); publish()
    const ready = await focus()
    if (match.phase !== 'focusing') return
    if (ready && !current().eliminated) startTurn()
    else { match.phase = 'turn'; run(() => beginTurn(true)) }
  }
  function startTurn() {
    match.phase = 'turn'; match.message = current().control === 'human' ? 'Position, aim and fire' : 'Computer is choosing its shot'
    reward(current(), 'turn'); current().lastMoveX = entity(current()).x
    input(current().control === 'human')
    entity(current()).blackboard.set('custom.turn', match.turnNumber)
    persist(); publish(); record('turn', { name: current().name, id: current().entityId })
    run(() => announce('Indigo Turn', { playerName: current().name, seconds: match.turnSeconds }))
    if (current().control === 'cpu') run(()=>prepareCpuTurn(current(),match.turnNumber))
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
    if (p.plannedTurn === match.turnNumber) return
    p.plannedTurn = match.turnNumber
    if ((tank.health ?? 100) <= 70) useBattery(p)
    syncLoadout(p)
    const targets = match.roster.filter((r: any) => !r.eliminated && r !== p)
    // Nearby weak opponents take priority; a new target never inherits the previous target's range error.
    const priority = (r: any) => Math.abs(entity(r).x! - origin.x) + (entity(r).health ?? 100) * 3
    targets.sort((a: any, b: any) => priority(a) - priority(b))
    if (!targets.length) { checkRoster(); finish(); return }
    const target = entity(targets[0]).position!, direction = Math.sign(target.x - origin.x) || 1
    const last: any = tank.blackboard.get('custom.aiLastShot')
    let rise = 0
    for (const distance of [32, 64, 96, 160]) {
      const ground = talus.world.groundY(origin.x + direction * distance, Math.max(0, origin.y - 220), 440)
      if (ground !== null) rise = Math.max(rise, origin.y - ground)
    }
    const obstructed = last?.targetId === targets[0].entityId && last.distance < Math.abs(target.x - origin.x) * 0.75
    const high = rise > 20 || obstructed
    p.targetId = targets[0].entityId; p.tactic = high ? 'High arc over cover' : Math.abs(target.x - origin.x) < 400 ? 'Close-range shot' : 'Elevation-adjusted shot'
    tank.blackboard.set('custom.indigoTarget', { x: target.x, y: target.y })
    tank.blackboard.set('custom.highArc', high)
    persist(); publish(); record('cpu-plan', { name: p.name, target: targets[0].name, distance: Math.abs(target.x - origin.x), elevation: origin.y - target.y, rise, high })
  }
  function cpuAimed(e: any) {
    if (!active() || current().control !== 'cpu' || e.id !== current().entityId || e.turn !== match.turnNumber) return
    const p = current(), tank = entity(p)
    if (p.aimedTurn === match.turnNumber) return
    const angle = Number(tank.blackboard.get('custom.aimAngle')), power = Number(tank.blackboard.get('custom.aimPower'))
    if (!Number.isFinite(angle) || !Number.isFinite(power)) throw new Error('Ballistic graph returned invalid aim')
    tank.blackboard.set('custom.angle', clamp(-angle * 180 / Math.PI, 5, 175))
    tank.blackboard.set('custom.power', clamp(power * 100, 1, 100))
    p.aimedTurn = match.turnNumber; aim(); persist(); publish()
    reward(p, 'aim'); reward(p, 'power')
    record('cpu-aimed', { name: p.name, angle: tank.blackboard.get('custom.angle'), power: tank.blackboard.get('custom.power'), tactic: p.tactic,
      origin: tank.position, target: tank.blackboard.get('custom.indigoTarget'), weapon: tank.weapon.state })
  }
  async function settle() {
    const p = match.impact; if (!p) throw new Error('Missing impact resolution point')
    match.phase = 'settling'; match.message = 'Letting the impact settle'; persist(); publish()
    frameRoster(p)
    if(match.impactWeapon==='sand') {
      const brush=itemById('sand').brush, x=p.x,y=p.y-brush.rise
      // A fractional impact centre can span 129 cells at radius 64.
      // Budget the actual integer raster bounds used by the native evaluator.
      const cells=(Math.ceil(x+brush.radius)-Math.floor(x-brush.radius))
        *(Math.ceil(y+brush.radius)-Math.floor(y-brush.radius))
      const receipt=await talus.world.terrainWork({kind:'recipe',shape:{x,y,radius:brush.radius},
        simulationRegion:{x:Math.floor(x-brush.regionWidth/2),y:Math.floor(y-128),w:brush.regionWidth,h:brush.regionHeight},
        bounds:{...arena.bounds,h:arena.terrain.solidBottomTileRow*arena.tiles.chunksPerTile*64},
        replacement:'empty',budget:{cells,particles:cells,work:cells},
        recipe:brush.recipe,seed:chaosSeed(match.seed+':'+match.round+':'+match.impactShot),holdSeconds:brush.settleSeconds})
      record('sand-bank',{shot:match.impactShot,receipt,x,y})
      if(receipt.status!=='completed')throw new Error('Sand bank '+receipt.status+': '+receipt.reason)
      match.impactWeapon=null;persist()
    }
    // Powders can remain active indefinitely. End the presentation wait after
    // a bounded interval; the terrain continues simulating on the next turn.
    const result = await talus.world.watchSettle({ x: p.x - 192, y: p.y - 128, w: 384, h: 384 },
      { minTicks: 60, maxTicks: arena.impactWaitTicks ?? 180 }).done
    record('settled', result)
    checkRoster(); if (!finish()) await beginTurn(true)
  }
  async function boot() {
    if (booting || booted) return
    booting = true
    try {
      arena = JSON.parse((await talus.files.readText('Game/arena.json'))!)
      chaosCatalog = JSON.parse((await talus.files.readText('Game/chaos.json'))!)
      quipCatalog = JSON.parse((await talus.files.readText('Game/quips.json'))!)
      market = JSON.parse((await talus.files.readText('Game/shop.json'))!)
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
        try { match = validate(params) } catch (err) { talus.ui.set('error', String(err)); showSetup(); booted = true; return }
        persist()
        const saved: any = talus.installed.get('indigo') || {}
        talus.installed.set('indigo', { ...saved, humans: match.humans, computers: match.computers,
          turnSeconds: match.turnSeconds, namesText: match.roster.map((p: any) => p.name).join('\n') })
      }
      if (match.version !== 8) throw new Error('This save belongs to an earlier fixture. Start a new match for M8.')
      ensureWallets()
      for (const job of match.chaos.jobs) for (const id of job.projectileIds)
        if (!talus.projectiles.get(id)?.exists) throw new Error('A saved death shell is missing; engine projectile persistence is required.')
      talus.ui.closeMenu(); talus.ui.hud('Menus/hud.html'); talus.camera.follow('off')
      if (match.phase === 'deploying') {
        for (const p of match.roster) {
          if (p.entityId) continue
          match.message = 'Deploying ' + (p.index + 1) + ' / ' + match.roster.length; publish()
          const ground = await talus.world.findSurface(p.spawnX, arena.surfaceBand.top, arena.surfaceBand.height)
          if (ground === null) throw new Error('Missing WFC surface at ' + p.spawnX)
          frameRoster(); await talus.sleepTicks(90)
          const tank = await talus.entities.spawn(arena.tankTemplate, p.spawnX, ground - 48)
          if (!tank) throw new Error('Tank spawn refused: ' + p.name)
          p.entityId = tank.id; p.surfaceY = ground; persist()
          tank.blackboard.set('name', p.name); tank.blackboard.set('custom.indigoPlayer', p.index)
          tank.blackboard.set('custom.control', p.control); tank.blackboard.set('custom.angle', 45); tank.blackboard.set('custom.power', 70)
          if (!await tank.whenLive({ timeoutTicks: 600 })) throw new Error('Tank did not become live')
          await talus.sleepTicks(90)
          syncLoadout(p)
          talus.ui.nameplate(tank, { text: p.name, bar: 'health', color: p.color }); record('deployed', { name: p.name, id: tank.id })
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
      booted = true; booting = false
      input(match.phase === 'turn' && current().control === 'human')
      if (match.phase === 'settling') run(settle)
      if (match.phase === 'focusing') startTurn()
      else if (match.phase === 'turn' && current().control === 'cpu') run(()=>prepareCpuTurn(current(),match.turnNumber))
      publish(); talus.state.set('indigo.error', ''); record('match-ready', { phase: match.phase })
      if (['ready', 'finished'].includes(match.phase)) openShop()
    } finally { booting = false }
  }
  talus.on('world.game-started', () => run(boot)); talus.on('world.game-loaded', () => run(boot)); talus.after(1, () => run(boot))
  talus.on('menu.hud.begin', () => { if (!shopOpen && match?.phase === 'ready') run(() => beginTurn(false)) })
  talus.on('menu.hud.shop', openShop)
  talus.on('menu.custom.shop-close', closeShop)
  talus.on('menu.custom.shop-prev', () => { if (shopOpen) { shopIndex = (shopIndex + match.roster.length - 1) % match.roster.length; publishShop() } })
  talus.on('menu.custom.shop-next', () => { if (shopOpen) { shopIndex = (shopIndex + 1) % match.roster.length; publishShop() } })
  talus.on('menu.hud.shield',()=>{if(human())useDefense(current(),'shield')})
  talus.on('menu.hud.magnet',()=>{if(human())useDefense(current(),'magnet')})
  talus.on('menu.hud.battery', () => { if (human()) useBattery(current()) })
  talus.on('menu.hud.fire', () => { if (human()) fire() })
  talus.on('menu.hud.pass', () => { if (human()) { reward(current(), 'pass'); record('pass'); run(() => beginTurn(true)) } })
  talus.on('menu.hud.angle-up', () => adjust(5, 0)); talus.on('menu.hud.angle-down', () => adjust(-5, 0))
  talus.on('menu.hud.power-up', () => adjust(0, 5)); talus.on('menu.hud.power-down', () => adjust(0, -5))
  talus.on('menu.hud.setup', showSetup); talus.on('indigo:cpu-plan', cpuPlan)
  talus.on('indigo:cpu-aimed', cpuAimed)
  talus.on('indigo:cpu-unreachable', e => {
    if (active() && current().control === 'cpu' && e.id === current().entityId && e.turn === match.turnNumber) {
      const p=current(),tank=entity(p)
      if(tank.blackboard.get('custom.aimRefusal')==='deflection-fields') {
        const target=tank.blackboard.get('custom.indigoTarget') as any
        tank.blackboard.set('custom.angle',target?.x < (tank.x ?? 0) ? 180-market.cpu.fieldProbeAngle : market.cpu.fieldProbeAngle)
        const powers=market.cpu.fieldProbePowers, trial=p.fieldProbeCount||0
        const power=powers[trial%powers.length];p.fieldProbeCount=trial+1
        tank.blackboard.set('custom.power',power);p.tactic='Exploratory shot through deflection field'
        record('cpu-field-probe',{name:p.name,power,trial});fire();return
      }
      record('cpu-unreachable', { name: current().name }); run(() => beginTurn(true))
    }
  })
  talus.on('indigo:cpu-fire', e => { if (active() && current().control === 'cpu' && e.id === current().entityId && e.turn === match.turnNumber) fire() })
  talus.on('input.pressed', e => {
    if (e.slot !== 0 || !human()) return
    if (e.action === 'tank_fire') fire()
    if (e.action === 'tank_pass') { reward(current(), 'pass'); record('pass'); run(() => beginTurn(true)) }
  })
  talus.on('weapon.beforeFire', e => {
    if (match?.roster.some((p: any) => p.entityId === e.entity?.id))
      return match.phase === 'firing' && current().entityId === e.entity?.id
  })
  talus.on('projectile.launch', e => {
    shotReward(e, 'launch')
    if (launchingChaos || !match || match.phase !== 'firing' || e.owner?.id !== current().entityId) return
    if (current().weaponId !== 'standard') {
      const w = wallet(current()), id = current().weaponId
      if (owned(current(), id) <= 0) { fail('A paid cannon fired without purchased ammunition'); return }
      w.stock[id]--; w.revision++; saveBank()
      record('ammo-spent', { name: current().name, item: id, remaining: w.stock[id] })
    }
    match.shotWeapon=current().weaponId
    shot = e.projectile; match.shotId = e.projectileId; match.phase = 'flight'; match.waitTicks = 0
    say(current(), 'shooting')
    match.message = 'Shell in flight'; persist(); publish(); record('launch', { id: e.projectileId, owner: e.owner?.id, weapon: current().weaponId, snapshot: e.projectile.snapshot() })
  })
  talus.on('projectile.collision', e => shotReward(e, 'landing'))
  talus.on('projectile.bounce', e => shotReward(e, 'bounce'))
  talus.on('damage', e => {
    if (!match || e.blocked || e.amount <= 0) return
    const attacker = match.roster.find((p: any) => p.entityId === (e.source?.id || e.sourceEntityId))
    const victim = match.roster.find((p: any) => p.entityId === (e.target?.id || e.targetStableId))
    reward(attacker, 'hit'); reward(attacker, 'damage', e.amount); reward(victim, 'hurt', e.amount)
    persist()
  })
  talus.on('projectile.hit', e => {
    if (e.projectileId !== match?.shotId) return
    record('hit', JSON.parse(JSON.stringify(e)))
    const target = match.roster.find((p: any) => p.entityId === e.targetStableId)
    match.lastHit = (target?.name || 'Tank') + ' −' + Math.round(e.amount) + ' HP' + (e.killed ? ' · ELIMINATED' : e.direct ? ' · DIRECT HIT' : ' · SPLASH')
    persist(); publish()
  })
  talus.on('projectile.end', e => {
    shotReward(e, 'end')
    const job = match?.chaos.jobs.find((j: any) => j.projectileIds.includes(e.projectileId))
    if (job) { job.projectileIds = job.projectileIds.filter((id: number) => id !== e.projectileId); job.ended++; persist() }
    if (!match || e.projectileId !== match.shotId) return
    match.impactWeapon=match.shotWeapon;match.impactShot=e.projectileId
    shot = null; match.shotId = null; match.impact = { x: Number(e.x), y: Number(e.y) }
    if (!Number.isFinite(match.impact.x) || !Number.isFinite(match.impact.y)) { fail('Projectile ended without a resolution point'); return }
    const p = current(), tank = entity(p)
    if (!p.eliminated && p.control === 'cpu' && p.shotFrom) tank?.blackboard.set('custom.aiLastShot', {
      targetId: p.targetId, distance: Math.abs(match.impact.x - p.shotFrom.x), power: Number(tank.blackboard.get('custom.power')) })
    record('end', { ...match.impact, owner: e.owner?.id, shooterResidency: tank?.residency }); run(settle)
  })
  talus.on('death', e => {
    const p = match?.roster.find((r: any) => r.entityId === (e.entity?.id || e.stableId))
    if (p) { try { eliminate(p, 'destroyed', e.killer?.id, e) } catch (error) { fail(error) } }
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
  talus.on('tick.sim.post',()=>{if(!booted||booting||!match||!bank)return;for(const p of match.roster)if(!p.eliminated&&p.entityId&&entity(p)?.isLive)syncUtilities(p)})
  // Presentation time expires bubbles even while simulation is paused.
  talus.on('tick.frame', e => { if (booted && !booting) tickSpeech(e.dt) })
  talus.on('tick.sim.pre', e => {
    if (match && arena && match.phase !== 'fault') {
      const focus = match.phase === 'flight' ? shot?.snapshot() : match.phase === 'settling' ? match.impact : null
      frameRoster(focus || undefined)
    }
    if (!booted || booting || !match || match.phase === 'fault') return
    if (match.phase !== 'finished') {
      try { tickChaos(e.dt) } catch (error) { fail(error); return }
    }
    ticks++
    if (ticks % 6 === 0) {
      checkRoster()
      if (active() && match.roster.filter((p: any) => !p.eliminated).length <= 1) finish()
      if (!active()) publish()
    }
    if (match.phase === 'aftermath') { finish(); return }
    if (match.phase === 'flight') {
      if (++match.waitTicks > 2700) fail('Projectile did not resolve within 45 seconds'); return
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
      tank.setVelocity(movementVelocity(s.x, requested, e.dt), s.vy)
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
