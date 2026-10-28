/** Named accounts, stock, rewards and the armory. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    const playerKey = (p: any): any => p.name.toLowerCase();
    const wallet = (p: any): any => Object.hasOwn(ctx.state.bank.players, playerKey(p)) ? ctx.state.bank.players[playerKey(p)] : undefined;
    const itemById = (id: string): any => ctx.state.market.items.find((i: any) => i.id === id);
    const unlimited = (id: string): boolean => id === 'standard' || itemById(id)?.unlimited === true;
    const owned = (p: any, id: string): number => unlimited(id) ? Infinity : Number(wallet(p).stock[id] || 0);
    function saveBank(): void { talus.installed.set('indigo.economy', ctx.state.bank); }
    function ensureWallets(): void {
        ctx.state.bank = talus.installed.get('indigo.economy') || { players: {}, rounds: {}, cpuShops: {} };
        for (const p of ctx.state.match.roster)
            if (!wallet(p))
                ctx.state.bank.players = { ...ctx.state.bank.players, [playerKey(p)]: {
                        name: p.name, cash: ctx.state.market.startingCash, earned: 0, spent: 0, stock: {}, selected: 'standard', revision: 0
                    } };
        saveBank();
    }
    function reward(p: any, action: string, units = 1): void {
        if (!p || !ctx.state.match || ['ready', 'deploying', 'finished', 'fault'].includes(ctx.state.match.phase))
            return;
        const amount = Math.max(0, Math.round(Number(ctx.state.market.awards[action] || 0) * units));
        if (!amount)
            return;
        p.cashEarned += amount;
        p.cashBreakdown[action] = (p.cashBreakdown[action] || 0) + amount;
        ctx.state.match.cashNotice = p.name + ' +$' + amount + ' · ' + action;
        if (p.entityId)
            ctx.state.cashPopups.set(p.entityId, (ctx.state.cashPopups.get(p.entityId) || 0) + amount);
    }
    function settleWallets(): void {
        if (ctx.state.bank.rounds[talus.world.id])
            return;
        const paid: any = Object.create(null);
        for (const p of ctx.state.match.roster) {
            const w = wallet(p);
            w.cash += p.cashEarned;
            w.earned += p.cashEarned;
            w.revision++;
            paid[playerKey(p)] = p.cashEarned;
        }
        ctx.state.bank.rounds[talus.world.id] = { paid, seed: ctx.state.match.seed, round: ctx.state.match.round };
        saveBank();
    }
    function purchase(p: any, id: string, expectedRevision?: number): boolean {
        const item = itemById(id), w = wallet(p);
        if (!['ready', 'finished'].includes(ctx.state.match.phase) || !item?.enabled || item.price <= 0
            || !Number.isSafeInteger(item.price) || !Number.isSafeInteger(item.bundle) || item.bundle <= 0)
            return false;
        if (expectedRevision !== undefined && expectedRevision !== w.revision) {
            talus.ui.set('shop.message', 'The basket changed. Please try again.');
            return false;
        }
        if (w.cash < item.price) {
            talus.ui.set('shop.message', 'Not enough cash for that bundle.');
            return false;
        }
        w.cash -= item.price;
        w.spent += item.price;
        const supply = item.grants?.item || id, units = item.bundle * (item.grants?.units || 1);
        w.stock[supply] = owned(p, supply) + units;
        w.revision++;
        if (item.kind === 'weapon')
            w.selected = id;
        saveBank();
        ctx.presentation.playCue("buy");
        if (ctx.state.match.phase === 'ready')
            ctx.equipment.syncLoadout(p);
        ctx.session.persist();
        return true;
    }
    function cpuShopping(): void {
        const stage = talus.world.id + ':' + ctx.state.match.phase;
        const bought: any = ctx.state.bank.cpuShops[stage] || {};
        for (const p of ctx.state.match.roster) {
            if (p.control !== 'cpu' || Object.hasOwn(bought, playerKey(p)))
                continue;
            const d = ctx.aiming.doctrine(p), w = wallet(p), reserve = Math.floor(w.cash * d.saveFraction);
            const buy = (id: string, cap: number) => {
                const item = itemById(id), stock = item?.grants?.item || id;
                if (!item?.enabled || owned(p, stock) >= cap || w.cash - item.price < reserve)
                    return false;
                return purchase(p, id);
            };
            for (const id of d.weaponPreferences) {
                if (id === 'standard')
                    continue;
                if (ctx.aiming.cpuWeaponUnavailable(itemById(id)))
                    continue;
                if (owned(p, id) >= 2 || buy(id, 2))
                    break;
            }
            if (ctx.state.market.items.some((item: any) => item.enabled && item.kind === 'weapon'
                && item.behavior?.mode.startsWith('battery') && owned(p, item.id) > 0))
                buy('battery', 2);
            if (d.exploration)
                buy('fuel-tank', 2);
            for (const id of d.utilityPreferences.slice(0, 3))
                buy(id, id === 'battery' ? 2 : 1);
            Object.defineProperty(bought, playerKey(p), { value: true, enumerable: true, configurable: true, writable: true });
            ctx.state.bank.cpuShops[stage] = bought;
            saveBank();
        }
    }
    function publishShop(): void {
        if (!ctx.state.shopOpen)
            return;
        const p = ctx.state.match.roster[ctx.state.shopIndex], w = wallet(p);
        talus.ui.set('shop', { name: p.name, persona: p.control === 'cpu' ? (ctx.aiming.personaFor(p)?.factionName || 'CPU') + ' · ' + ctx.aiming.skillFor(p) : 'Local hotseat', color: p.color, cash: w.cash, earned: p.cashEarned,
            revision: w.revision, account: playerKey(p), index: ctx.state.shopIndex + 1, count: ctx.state.match.roster.length,
            title: ctx.state.match.phase === 'finished' ? 'Between rounds' : 'Opening armory',
            result: ctx.state.match.phase === 'finished' ? ctx.state.match.message : 'New pilots get $' + ctx.state.market.startingCash + '. Cash and supplies carry between rounds.',
            finished: ctx.state.match.phase === 'finished', ready: ctx.state.match.phase === 'ready',
            ...ctx.menus.nextRoundParams(),
            seriesStatus: ctx.state.match.series?.complete ? 'Series complete · ' + ctx.state.match.series.champion : 'Best of ' + (ctx.state.match.seriesLength || 1),
            nextLabel: ctx.state.match.series?.complete ? 'Start new series' : 'Deploy next round',
            message: p.control === 'cpu' ? 'Computer pilot: purchases made automatically. You can inspect or add supplies.' : 'Your wallet and unused supplies carry into the next round.',
            receipts: Object.entries(p.cashBreakdown).map(([action, amount]) => ({ action, amount: Number(amount) })),
            categories: ctx.state.market.categories.map((name: string, index: number) => ({ name, action: 'category-' + index, selected: name === ctx.state.shopCategory })),
            items: ctx.state.market.items.filter((item: any) => ctx.state.shopCategory === 'All' || item.category === ctx.state.shopCategory).map((item: any) => ({ id: item.id, name: item.name, description: item.description,
                category: item.category.toUpperCase(), icon: item.kind === 'weapon' ? '✦' : '◆',
                comparison: item.projectile ? 'Damage ' + item.projectile.damage + ' / Blast ' + item.projectile.aoeRadius + 'px / Crater ' + item.projectile.carveRadius + 'px' + (item.behavior?.count ? ' / ' + item.behavior.count + ' stages' : '') : 'Utility · ' + item.bundle + ' per bundle',
                price: !item.enabled ? 'Not available yet' : item.price ? '$' + item.price + ' / ' + item.bundle : 'Always available',
                stock: unlimited(item.id) ? 'Unlimited' : item.grants ? owned(p, item.grants.item) + ' reserve charges' : String(owned(p, item.id)),
                action: 'buy-' + item.id, disabled: !item.enabled || item.price === 0 || w.cash < item.price,
                button: !item.enabled ? 'Unavailable' : item.price === 0 ? 'Included' : w.cash < item.price ? 'Need more cash' : 'Buy bundle' })) });
    }
    function openShop(): void {
        if (!ctx.state.match || ctx.state.arcadeCard || !['ready', 'finished'].includes(ctx.state.match.phase))
            return;
        if (ctx.state.match.phase === 'finished' && ctx.state.match.series?.complete) {
            ctx.menus.showResults();
            return;
        }
        ctx.menus.input(false);
        cpuShopping();
        if (ctx.state.match.phase === 'ready' && ctx.state.match.roster.length > 0 && ctx.state.match.roster.every((p: any) => p.control === 'cpu')) {
            ctx.state.shopOpen = false;
            talus.ui.closeMenu();
            ctx.session.run(() => ctx.turns.beginTurn(false));
            return;
        }
        ctx.state.shopOpen = true;
        ctx.state.shopIndex = Math.max(0, ctx.state.match.roster.findIndex((p: any) => p.control === 'human'));
        publishShop();
        ctx.menus.publish();
        talus.ui.openMenu('Menus/shop.html');
    }
    function closeShop(): void { ctx.state.shopOpen = false; talus.ui.closeMenu(); ctx.menus.publish(); }
    function shotReward(e: any, action: 'launch' | 'landing' | 'bounce' | 'end'): void {
        if (!ctx.state.match || !ctx.state.market || ['deploying', 'ready', 'finished', 'fault'].includes(ctx.state.match.phase))
            return;
        const id = String(e.projectileId);
        if (action === 'launch' && ctx.state.match.attack?.owner === (e.owner?.id || e.ownerEntityId) && itemById(ctx.state.match.attack.item)?.noCombatRewards)
            return;
        if (action === 'launch') {
            if (ctx.state.match.cashShots[id])
                return;
            const p = ctx.state.match.roster.find((r: any) => r.entityId === (e.owner?.id || e.ownerEntityId));
            if (!p)
                return;
            ctx.state.match.cashShots[id] = { owner: p.entityId, landed: false };
            reward(p, 'shoot');
        }
        else {
            const credit = ctx.state.match.cashShots[id];
            if (!credit)
                return;
            const p = ctx.state.match.roster.find((r: any) => r.entityId === credit.owner);
            if (action === 'landing' && !credit.landed) {
                credit.landed = true;
                reward(p, 'landing');
            }
            if (action === 'bounce')
                reward(p, 'bounce');
            if (action === 'end') {
                if (!credit.landed)
                    reward(p, 'resolution');
                delete ctx.state.match.cashShots[id];
            }
        }
        ctx.session.persist();
    }
    return { playerKey, wallet, itemById, unlimited, owned, saveBank, ensureWallets, reward, settleWallets, purchase, cpuShopping, publishShop, openShop, closeShop, shotReward };
}
export = create;
