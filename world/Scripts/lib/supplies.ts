/** Camera-led supply drops and native pickup accounting. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function supplyState(): any {
        return ctx.state.match.supplies ||= { rng: ctx.core.chaosSeed(String(ctx.state.match.seed) + ':supplies'), checked: null, active: null, crates: [] };
    }
    function supplyRandom(): number {
        const state = supplyState();
        let x = state.rng;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        state.rng = x >>> 0;
        return state.rng / 4294967296;
    }
    function supplyLabel(crate: any, at: Vec2 | null): void {
        talus.ui.worldText('supply:' + crate.id, at ? { at, text: '↓ ' + ctx.economy.itemById(crate.item).name,
            offset: { x: 0, y: -38 }, size: 18, color: '#70f8a0', outline: '#10102a', background: '#10102acc', maxWidth: 280 } : null);
    }
    function claimSupply(crate: any, p: any): void {
        ctx.state.bank.supplyClaims ||= {};
        const claims = ctx.state.bank.supplyClaims[talus.world.id] ||= {};
        if (!Object.hasOwn(claims, crate.id)) {
            const w = ctx.economy.wallet(p), item = ctx.economy.itemById(crate.item), supply = item.grants?.item || item.id;
            w.stock[supply] = ctx.economy.owned(p, supply) + crate.units;
            w.revision++;
            claims[crate.id] = { player: ctx.economy.playerKey(p), item: supply, units: crate.units };
            ctx.economy.saveBank();
            ctx.state.match.message = p.name + ' recovered ' + crate.units + ' × ' + item.name;
            ctx.equipment.syncLoadout(p);
        }
        crate.state = 'collected';
        supplyLabel(crate, null);
        ctx.session.persist();
        const body = talus.bodies.get(crate.bodyId);
        if (body?.exists)
            body.destroy();
    }
    function tickSupplies(): void {
        if (!ctx.state.supplyCatalog || !ctx.state.match.supplies)
            return;
        let changed = false;
        for (const crate of ctx.state.match.supplies.crates) {
            if (!crate.bodyId)
                continue;
            const body = talus.bodies.get(crate.bodyId), at = body?.snapshot();
            if (crate.state === 'collected') {
                if (body?.exists)
                    body.destroy();
                continue;
            }
            if (crate.state === 'lost')
                continue;
            if (!at || at.y > ctx.state.match.bounds.y + ctx.state.match.bounds.h || at.x < ctx.state.match.bounds.x || at.x > ctx.state.match.bounds.x + ctx.state.match.bounds.w) {
                crate.state = 'lost';
                supplyLabel(crate, null);
                if (body?.exists)
                    body.destroy();
                changed = true;
                continue;
            }
            supplyLabel(crate, body!.isLive ? at : null);
            if (ctx.state.supplySequence || ctx.core.presenting() || !['turn', 'ready', 'settling'].includes(ctx.state.match.phase) || !body!.isLive || Math.abs(at.vy) > 45)
                continue;
            const nearby = ctx.state.match.roster.filter((p: any) => !p.eliminated && ctx.core.entity(p)?.isLive)
                .map((p: any) => ({ p, at: ctx.core.entity(p).snapshot()! }))
                .filter((v: any) => Math.hypot(v.at.x - at.x, v.at.y - at.y) <= ctx.state.supplyCatalog.pickupRadius)
                .sort((a: any, b: any) => Math.hypot(a.at.x - at.x, a.at.y - at.y) - Math.hypot(b.at.x - at.x, b.at.y - at.y) || a.p.index - b.p.index);
            if (nearby[0]) {
                claimSupply(crate, nearby[0].p);
                changed = true;
            }
        }
        const live = ctx.state.match.supplies.crates.filter((c: any) => !['collected', 'lost'].includes(c.state));
        const done = ctx.state.match.supplies.crates.filter((c: any) => ['collected', 'lost'].includes(c.state)).slice(-8);
        ctx.state.match.supplies.crates = [...live, ...done];
        if (changed) {
            ctx.session.persist();
            ctx.menus.publish();
        }
    }
    async function watchSupply(crate: any): Promise<void> {
        if (ctx.state.supplySequence)
            return;
        ctx.state.supplySequence = true;
        ctx.menus.input(false);
        ctx.session.persist();
        try {
            ctx.state.match.message = 'SUPPLY DROP · ' + ctx.economy.itemById(crate.item).name;
            ctx.menus.publish();
            if (!crate.bodyId) {
                let ready = false;
                for (let n = 0; n < ctx.state.supplyCatalog.cameraWaitTicks && ctx.state.match.phase === 'focusing'; n++) {
                    if (!ctx.core.presenting() && ctx.camera.cameraArrived(ctx.camera.cameraPoint(crate.spawn, 'supply-arrival'))) {
                        ready = true;
                        break;
                    }
                    await talus.sleepTicks(1);
                }
                if (!ready) {
                    crate.state = 'lost';
                    return;
                }
                const name = 'Supply ' + crate.id;
                let body = talus.bodies.find({ includeStored: true }).find(b => b.name === name);
                if (!body) {
                    const cells: Array<{
                        x: number;
                        y: number;
                        element: string;
                    }> = [];
                    for (let y = 0; y < ctx.state.supplyCatalog.crateHeight; y++)
                        for (let x = 0; x < ctx.state.supplyCatalog.crateWidth; x++) {
                            const band = y < 2 || y >= ctx.state.supplyCatalog.crateHeight - 2 || x < 2 || x >= ctx.state.supplyCatalog.crateWidth - 2 || Math.abs(x - ctx.state.supplyCatalog.crateWidth / 2) < 2;
                            cells.push({ x: Math.round(crate.spawn.x + x - ctx.state.supplyCatalog.crateWidth / 2), y: Math.round(crate.spawn.y + y - ctx.state.supplyCatalog.crateHeight / 2), element: band ? 'IRON' : 'WOOD' });
                        }
                    body = await talus.bodies.create({ cells, name, kind: 'dynamic' }) || undefined;
                }
                if (!body) {
                    crate.state = 'lost';
                    return;
                }
                crate.bodyId = body.id;
                crate.state = 'falling';
                crate.watchStarted = talus.sim.clock;
                ctx.session.persist();
            }
            const until = talus.sim.clock + ctx.state.supplyCatalog.maxFlightSeconds;
            while (ctx.state.match.phase === 'focusing' && talus.sim.clock < until) {
                const body = talus.bodies.get(crate.bodyId), at = body?.snapshot();
                if (!at || ['lost', 'collected'].includes(crate.state))
                    break;
                if (!ctx.core.presenting())
                    ctx.camera.cameraPoint(at, 'supply-flight');
                supplyLabel(crate, at);
                if (talus.sim.clock - (crate.watchStarted || 0) > .6 && (at.sleeping || Math.abs(at.vy) < 6 && talus.world.groundY(at.x, at.y + ctx.state.supplyCatalog.crateHeight / 2, 8) !== null))
                    break;
                await talus.sleepTicks(1);
            }
            if (!['lost', 'collected'].includes(crate.state))
                crate.state = 'available';
        }
        finally {
            supplyState().active = null;
            ctx.state.supplySequence = false;
            ctx.session.persist();
        }
    }
    async function maybeSupplyDrop(boundary: 'round' | 'turn'): Promise<void> {
        if (!ctx.state.supplyCatalog || ctx.state.supplySequence || ctx.state.match.phase !== 'focusing')
            return;
        const state = supplyState(), key = boundary + ':' + (boundary === 'round' ? ctx.state.match.round : ctx.state.match.turnNumber);
        if (state.checked === key)
            return;
        state.checked = key;
        const roll = supplyRandom(), chance = boundary === 'round' ? ctx.state.supplyCatalog.roundChance : ctx.state.supplyCatalog.turnChance;
        ctx.session.persist();
        if (roll >= chance || state.crates.filter((c: any) => !['lost', 'collected'].includes(c.state)).length >= ctx.state.supplyCatalog.maxActive)
            return;
        const options = ctx.state.supplyCatalog.contents.filter((c: any) => ctx.economy.itemById(c.item)?.enabled && !ctx.economy.unlimited(c.item));
        if (!options.length)
            return;
        let draw = supplyRandom() * options.reduce((sum: number, c: any) => sum + c.weight, 0);
        const content = options.find((c: any) => (draw -= c.weight) < 0) || options[options.length - 1];
        const anchor = ctx.aiming.targetSnapshot(ctx.core.current());
        if (!anchor)
            return;
        let spawn: Vec2 | null = null;
        for (let n = 0; n < 6 && !spawn; n++) {
            const x = Math.round(ctx.core.clamp(anchor.x + (supplyRandom() < .5 ? -1 : 1) * (100 + supplyRandom() * 220), ctx.state.match.bounds.x + 48, ctx.state.match.bounds.x + ctx.state.match.bounds.w - 48));
            if (ctx.state.match.roster.some((p: any) => { const at = ctx.aiming.targetSnapshot(p); return at && Math.abs(at.x - x) < 70; }))
                continue;
            const ground = await talus.world.findSurface(x, ctx.state.match.bounds.y, ctx.state.match.bounds.h);
            if (ground === null || ground < ctx.state.match.bounds.y + 70)
                continue;
            spawn = { x, y: Math.max(ctx.state.match.bounds.y + 24, ground - ctx.state.supplyCatalog.height) };
        }
        if (ctx.state.match.phase !== 'focusing') {
            ctx.session.persist();
            return;
        }
        if (!spawn) {
            ctx.session.persist();
            return;
        }
        const crate = { id: key, item: content.item, units: content.units, spawn, bodyId: null, state: 'incoming' };
        state.crates.push(crate);
        state.active = crate.id;
        ctx.session.persist();
        await watchSupply(crate);
    }
    return { supplyState, supplyRandom, supplyLabel, claimSupply, tickSupplies, watchSupply, maybeSupplyDrop };
}
export = create;
