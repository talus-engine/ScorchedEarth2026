/** Native character movement, posture, defenses and utility consumption. */
import type { Runtime, SupplyReading } from 'context';
function create(ctx: Runtime) {
    function tankUtilityLedger(p: any): {
        supplySeen?: SupplyReading;
        autoDefenseChecked?: boolean;
    } {
        ctx.state.bank.tankUtilities ||= {};
        const world = ctx.state.bank.tankUtilities[talus.world.id] ||= {};
        return world[p.entityId] ||= {};
    }
    function rememberSupply(p: any, now: SupplyReading): boolean {
        const ledger = tankUtilityLedger(p), before = ledger.supplySeen;
        if (before && (Object.keys(now) as Array<keyof SupplyReading>).every(key => before[key] === now[key]))
            return false;
        ledger.supplySeen = now;
        return true;
    }
    function readSupply(p: any): SupplyReading {
        const e = ctx.core.entity(p), state = e.controller.state, defense = e.defenses.state;
        return { jet: state?.fuel || 0, shield: defense?.shield?.remaining || 0,
            magnet: defense?.deflector?.remaining || 0, groundSpent: e.controller.groundDrive?.spent || 0,
            deflectorItem: defense?.deflector?.spec.reflection ? 'super-mag' : 'magnet' };
    }
    function accountSupply(p: any): void {
        if (!ctx.state.bank || !p.entityId || !ctx.core.entity(p)?.isLive)
            return;
        const now = readSupply(p), before = tankUtilityLedger(p).supplySeen;
        let changed = false;
        if (before) {
            for (const [key, id, rate] of [['jet', 'jetpack', 1], ['shield', 'shield', ctx.economy.itemById('shield').charge]] as const) {
                const spent = Math.max(0, before[key] - now[key]) / Number(rate);
                if (spent > 1e-9) {
                    ctx.economy.wallet(p).stock[id] = Math.max(0, ctx.economy.owned(p, id) - spent);
                    changed = true;
                }
            }
            const deflectorItem = before.deflectorItem || 'magnet';
            if (deflectorItem === now.deflectorItem) {
                const spent = Math.max(0, before.magnet - now.magnet) / ctx.economy.itemById(deflectorItem).charge;
                if (spent > 1e-9) {
                    ctx.economy.wallet(p).stock[deflectorItem] = Math.max(0, ctx.economy.owned(p, deflectorItem) - spent);
                    changed = true;
                }
            }
            const groundSpent = Math.max(0, now.groundSpent - before.groundSpent);
            if (groundSpent > 1e-9) {
                ctx.economy.wallet(p).stock['fuel-tank'] = Math.max(0, ctx.economy.owned(p, 'fuel-tank') - groundSpent);
                changed = true;
            }
            if (changed)
                ctx.economy.wallet(p).revision++;
        }
        const observed = rememberSupply(p, now);
        if (changed || observed)
            ctx.economy.saveBank();
    }
    function selectedDeflector(p: any): 'magnet' | 'super-mag' {
        return p.deflectorItem === 'super-mag' && ctx.economy.itemById('super-mag')?.field ? 'super-mag' : 'magnet';
    }
    function preferredDeflector(p: any): 'magnet' | 'super-mag' {
        if (ctx.economy.itemById('super-mag')?.enabled && ctx.economy.itemById('super-mag')?.field
            && ctx.economy.owned(p, 'super-mag') > 0)
            return 'super-mag';
        return 'magnet';
    }
    function selectDeflector(p: any, id: 'magnet' | 'super-mag'): boolean {
        const e = ctx.core.entity(p), item = ctx.economy.itemById(id);
        if (!e?.isLive || !e.alive || !item?.enabled || !item.field)
            return false;
        accountSupply(p);
        const component = e.defenses.state?.deflector;
        const actual = component?.spec.reflection ? 'super-mag' : 'magnet';
        if (!component || actual !== id) {
            const settings = { ...item.field,
                elements: item.materialNames.map((name: string) => talus.elements.get(name)?.id).filter((element: any) => element !== undefined) };
            const receipt = e.defenses.configure('deflector', settings);
            if (!receipt.accepted) {
                ctx.state.match.message = item.name + ': ' + receipt.reason;
                return false;
            }
            // Loaded energy belongs to its original reserve. Switching modes neither spends nor transfers it.
            const carried = e.defenses.state?.deflector?.remaining || 0;
            if (carried > 0 && !e.defenses.discharge('deflector', carried).accepted)
                throw new Error('Deflector could not release its previous reserve');
            rememberSupply(p, readSupply(p));
            ctx.economy.saveBank();
        }
        p.deflectorItem = id;
        return true;
    }
    function syncUtilities(p: any): void {
        const e = ctx.core.entity(p);
        if (!e?.isLive || !e.alive)
            return;
        accountSupply(p);
        const jet = ctx.economy.itemById('jetpack'), c = e.controller.state;
        if (jet.enabled && c?.enabled && c.capacity !== null && c.fuel !== null) {
            const target = Math.min(c.capacity, ctx.economy.owned(p, 'jetpack'));
            if (target > c.fuel + 1e-9)
                e.controller.addFuel(target - c.fuel);
            else if (target < c.fuel - 1e-9)
                e.controller.removeFuel(c.fuel - target);
        }
        const ground = ctx.economy.itemById('fuel-tank');
        if (ground.enabled) {
            let state = e.controller.groundDrive;
            if (!state) {
                const configured = e.controller.configureGroundDrive(ground.controller);
                if (!configured.accepted)
                    throw new Error('ground drive: ' + configured.reason);
                state = e.controller.groundDrive!;
            }
            const target = Math.min(state.config.capacity, ctx.economy.owned(p, 'fuel-tank'));
            if (target > state.fuel + 1e-9)
                e.controller.addGroundFuel(target - state.fuel);
            else if (target < state.fuel - 1e-9)
                e.controller.removeGroundFuel(state.fuel - target);
        }
        const chute = ctx.economy.itemById('parachute');
        if (chute.enabled) {
            let state = e.controller.fallBrake;
            if (!state) {
                const receipt = e.controller.configureFallBrake(chute.controller);
                if (!receipt.accepted)
                    throw new Error('parachute: ' + receipt.reason);
                state = e.controller.fallBrake!;
            }
            const target = Math.min(state.config.capacity, Math.floor(ctx.economy.owned(p, 'parachute')));
            if (target > state.charges)
                e.controller.chargeFallBrake(target - state.charges);
            else if (target < state.charges)
                e.controller.removeFallBrakeCharges(state.charges - target);
        }
        const deflectorItem = selectedDeflector(p);
        if (ctx.economy.itemById(deflectorItem)?.enabled && !selectDeflector(p, deflectorItem))
            throw new Error('Deflector configuration refused');
        for (const [id, kind] of [['shield', 'shield'], [deflectorItem, 'deflector']] as const) {
            const item = ctx.economy.itemById(id);
            if (!item.enabled)
                continue;
            let component = e.defenses.state?.[kind];
            if (!component) {
                const settings = { ...item.field };
                if (kind === 'deflector')
                    settings.elements = item.materialNames.map((name: string) => talus.elements.get(name)?.id).filter((id: any) => id !== undefined);
                const configured = e.defenses.configure(kind, settings);
                if (!configured.accepted)
                    throw new Error(id + ': ' + configured.reason);
                component = e.defenses.state![kind]!;
            }
            const target = Math.min(component.spec.capacity, ctx.economy.owned(p, id) * item.charge);
            if (target > component.remaining + 1e-9)
                e.defenses.charge(kind, target - component.remaining);
            else if (target < component.remaining - 1e-9)
                e.defenses.discharge(kind, component.remaining - target);
        }
        if (rememberSupply(p, readSupply(p)))
            ctx.economy.saveBank();
    }
    function useDefense(p: any, id: 'shield' | 'magnet' | 'super-mag'): boolean {
        if (!ctx.core.active() || p !== ctx.core.current() || p.eliminated || !ctx.economy.itemById(id).enabled)
            return false;
        const switching = id !== 'shield' && selectedDeflector(p) !== id;
        if (switching && (ctx.economy.owned(p, id) <= 0 || !selectDeflector(p, id))) {
            ctx.menus.publish();
            return false;
        }
        syncUtilities(p);
        const e = ctx.core.entity(p), kind = id === 'shield' ? 'shield' : 'deflector', state = e.defenses.state?.[kind];
        if (!state)
            return false;
        const receipt = e.defenses.activate(kind, switching || !state.active);
        if (receipt.accepted) {
            ctx.session.persist();
            ctx.menus.publish();
        }
        return receipt.accepted;
    }
    function useParachute(p: any): boolean {
        const item = ctx.economy.itemById('parachute'), e = ctx.core.entity(p);
        if (!item.enabled || p.eliminated || !e?.isLive || !e.alive || !ctx.state.bank || ctx.economy.owned(p, 'parachute') < 1)
            return false;
        syncUtilities(p);
        const receipt = e.controller.deployFallBrake(true);
        if (!receipt.accepted)
            return false;
        if (receipt.consumed) {
            ctx.economy.wallet(p).stock.parachute = Math.max(0, ctx.economy.owned(p, 'parachute') - receipt.consumed);
            ctx.economy.wallet(p).revision++;
            ctx.economy.saveBank();
            ctx.session.persist();
            ctx.menus.publish();
        }
        return true;
    }
    async function dig(p: any, direction: number): Promise<void> {
        const item = ctx.economy.itemById('digger'), fuel = ctx.economy.owned(p, 'digger');
        if (!ctx.core.active() || p !== ctx.core.current() || p.eliminated || !item.enabled || fuel <= 0 || !direction || ctx.state.digging || talus.sim.clock < ctx.state.nextDigAt)
            return;
        const e = ctx.core.entity(p), at = e.position;
        if (!e.isLive || !at)
            return;
        const tool = item.tool, maxHard = Math.max(...tool.materials.map((m: any) => m.hardness));
        const width = Math.min(tool.width, Math.floor(fuel * tool.workPerSecond / (tool.height * maxHard)));
        if (width < 1)
            return;
        const x = Math.floor(direction > 0 ? at.x + ctx.state.arena.combat.tankHalfWidth : at.x - ctx.state.arena.combat.tankHalfWidth - width);
        const y = Math.floor(at.y - tool.height / 2), shape = { x, y, w: width, h: tool.height };
        ctx.state.digging = true;
        ctx.state.nextDigAt = talus.sim.clock + tool.interval;
        try {
            const receipt = await talus.world.terrainWork({ kind: 'excavate', shape,
                bounds: { ...ctx.state.arena.bounds, h: ctx.state.arena.terrain.solidBottomTileRow * ctx.state.arena.tiles.chunksPerTile * 64 },
                replacement: 'eligible', materials: tool.materials.map((m: any) => ({ element: talus.elements.get(m.name)!.id, hardness: m.hardness })),
                budget: { cells: width * tool.height, particles: width * tool.height, work: Math.min(fuel, tool.interval) * tool.workPerSecond }, actor: { entity: e, reach: tool.reach } });
            if (receipt.status === 'completed' && receipt.work > 0) {
                const spent = receipt.work / tool.workPerSecond;
                ctx.economy.wallet(p).stock.digger = Math.max(0, ctx.economy.owned(p, 'digger') - spent);
                ctx.economy.wallet(p).revision++;
                ctx.economy.saveBank();
            }
            else
                ;
        }
        finally {
            ctx.state.digging = false;
        }
    }
    function driveTank(p: any, velocity: number): void {
        const e = ctx.core.entity(p), s = e.snapshot();
        if (!e.isLive || !s)
            return;
        const requested = movementVelocity(s.x, velocity, 1 / 60);
        if (ctx.economy.itemById('fuel-tank').enabled) {
            const state = e.controller.groundDrive;
            if (state)
                e.controller.drive(ctx.core.clamp(requested / state.config.speed, -1, 1));
        }
        else
            e.setVelocity(requested, s.vy);
    }
    function syncLoadout(p: any): void {
        const tank = ctx.core.entity(p);
        if (!tank?.isLive)
            return;
        syncUtilities(p);
        for (const item of ctx.state.market.items)
            if (item.enabled && item.kind === 'weapon')
                tank.weapon.setAmmo(item.template, ctx.economy.unlimited(item.id) ? null : ctx.economy.owned(p, item.id));
        const selected = ctx.economy.itemById(ctx.economy.wallet(p).selected);
        p.weaponId = selected?.enabled && selected.kind === 'weapon' && ctx.economy.owned(p, selected.id) > 0 ? selected.id : 'standard';
        if (!tank.weapon.equip(ctx.economy.itemById(p.weaponId).template))
            throw new Error('Tank cannot equip ' + p.weaponId);
        tank.blackboard.set('custom.weaponId', p.weaponId);
        tank.blackboard.set('custom.wallet', { cash: ctx.economy.wallet(p).cash, earned: p.cashEarned });
    }
    function chooseWeapon(p: any, id: string): boolean {
        const item = ctx.economy.itemById(id);
        if (!item?.enabled || item.kind !== 'weapon' || ctx.economy.owned(p, id) <= 0)
            return false;
        const previous = p.weaponId;
        ctx.economy.wallet(p).selected = id;
        ctx.economy.wallet(p).revision++;
        ctx.economy.saveBank();
        syncLoadout(p);
        if (previous !== id && !item.noCombatRewards)
            ctx.economy.reward(p, 'equip');
        ctx.combat.aim();
        ctx.session.persist();
        ctx.menus.publish();
        return true;
    }
    function useBattery(p: any): boolean {
        if (!ctx.core.active() || p !== ctx.core.current() || p.eliminated || ctx.economy.owned(p, 'battery') <= 0)
            return false;
        const tank = ctx.core.entity(p), health = tank?.health, max = tank?.maxHealth;
        if (!tank?.isLive || health == null || max == null || health >= max)
            return false;
        const after = tank.heal(ctx.economy.itemById('battery').heal);
        if (after == null || after <= health)
            return false;
        ctx.economy.wallet(p).stock.battery--;
        ctx.economy.wallet(p).revision++;
        ctx.economy.saveBank();
        ctx.economy.reward(p, 'utility');
        ctx.session.persist();
        ctx.menus.publish();
        return true;
    }
    function useAutoAim(p: any): boolean {
        if (!ctx.core.active() || p !== ctx.core.current() || p.eliminated || ctx.economy.owned(p, 'lazy-boy') <= 0 || p.autoAimTurn === ctx.state.match.turnNumber)
            return false;
        p.autoAimTurn = ctx.state.match.turnNumber;
        p.plannedTurn = null;
        p.aimedTurn = null;
        ctx.state.match.message = 'Lazy Boy is calculating a shot';
        ctx.session.persist();
        ctx.menus.publish();
        ctx.core.entity(p).runGraph(ctx.state.arena.cpuGraph, { turn: ctx.state.match.turnNumber });
        return true;
    }
    function autoDefend(player?: any): void {
        if (!ctx.state.match || !ctx.state.bank)
            return;
        for (const p of player ? [player] : ctx.state.match.roster) {
            if (p.eliminated || !p.entityId)
                continue;
            const ledger = tankUtilityLedger(p);
            if (ledger.autoDefenseChecked)
                continue;
            const e = ctx.core.entity(p);
            if (!e?.isLive || !e.alive)
                continue;
            if (p.control === 'cpu' && selectedDeflector(p) !== preferredDeflector(p)
                && !selectDeflector(p, preferredDeflector(p)))
                continue;
            syncUtilities(p);
            let activated = false, refused = false;
            for (const kind of ctx.economy.owned(p, 'auto-defense') >= 1 ? ['shield', 'deflector'] as const : []) {
                const state = e.defenses.state?.[kind];
                if (state && !state.active && state.remaining > 0) {
                    const accepted = e.defenses.activate(kind, true).accepted;
                    activated = accepted || activated;
                    refused = !accepted || refused;
                }
            }
            if (!activated && refused)
                continue;
            ledger.autoDefenseChecked = true;
            if (activated) {
                ctx.economy.wallet(p).stock['auto-defense']--;
                ctx.economy.wallet(p).revision++;
            }
            ctx.economy.saveBank();
            ctx.session.persist();
        }
    }
    function movementVelocity(x: number, requested: number, dt: number): number {
        const left = ctx.state.match.bounds.x + ctx.state.arena.combat.tankHalfWidth;
        const right = ctx.state.match.bounds.x + ctx.state.match.bounds.w - ctx.state.arena.combat.tankHalfWidth;
        if (dt <= 0)
            return 0;
        return requested < 0 ? Math.max(requested, Math.min(0, (left - x) / dt))
            : Math.min(requested, Math.max(0, (right - x) / dt));
    }
    function passivePosture(p: any): void {
        const e = ctx.core.entity(p);
        if (p.eliminated || e?.residency === 'destroyed')
            return;
        if (!e?.isLive) {
            if (!p.passivePosturePending) {
                p.passivePosturePending = true;
                ctx.session.persist();
            }
            ctx.state.pendingTankReady.add(p.entityId);
            return;
        }
        e.controller.setPosture({ ...ctx.state.arena.posture.controller, mode: 'passive' });
        if (p.passivePosturePending) {
            delete p.passivePosturePending;
            ctx.session.persist();
        }
    }
    function flipUpright(p: any): boolean {
        const e = ctx.core.entity(p);
        if (!ctx.core.active() || p !== ctx.core.current() || p.eliminated || !e?.isLive || !e.alive)
            return false;
        if (talus.sim.clock - (p.lastFlipAt ?? -Infinity) < ctx.state.arena.posture.flipCooldownSeconds)
            return false;
        const receipt = e.controller.setPosture({ ...ctx.state.arena.posture.controller, mode: 'upright' });
        if (receipt.accepted) {
            p.lastFlipAt = talus.sim.clock;
            ctx.state.match.message = p.name + ' is righting — movement and firing remain available';
            ctx.session.persist();
            ctx.menus.publish();
        }
        return receipt.accepted;
    }
    async function preparePlacement(p: any): Promise<void> {
        const e = ctx.core.entity(p);
        if (ctx.state.match.phase !== 'deploying' || p.eliminated || !e?.isLive || !e.alive)
            return;
        const receipt = e.controller.setPosture({ ...ctx.state.arena.posture.controller, mode: 'upright' });
        let waited = 0;
        while (receipt.accepted && waited < ctx.state.arena.posture.placementWaitTicks
            && ctx.state.match.phase === 'deploying' && !p.eliminated && e.isLive && e.alive) {
            const status = e.controller.posture?.status;
            if (status !== 'moving' && status !== 'pending')
                break;
            await talus.sleepTicks(6);
            waited += 6;
        }
        p.placementReady = true;
        passivePosture(p);
        ctx.session.persist();
    }
    return { tankUtilityLedger, rememberSupply, readSupply, accountSupply, selectedDeflector, preferredDeflector, selectDeflector, syncUtilities, useDefense, useParachute, dig, driveTank, syncLoadout, chooseWeapon, useBattery, useAutoAim, autoDefend, movementVelocity, passivePosture, flipUpright, preparePlacement };
}
export = create;
