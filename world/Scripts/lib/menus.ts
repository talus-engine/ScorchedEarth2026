/** Menu data, player input and new-match configuration. */
import type { Runtime } from 'context';
import players = require('roster');
function create(ctx: Runtime) {
    function input(enabled: boolean): void {
        enabled = enabled && !ctx.state.exitDrain;
        for (const p of talus.players.list())
            p.inputEnabled = enabled && p.slot === 0;
        if (!enabled) {
            ctx.state.utilityGeneration++;
            if (ctx.state.digging)
                talus.world.cancelTerrainWork();
            for (const p of ctx.state.match?.roster || []) {
                const e = p.entityId ? ctx.core.entity(p) : null;
                if (e?.isLive && e.controller.state?.enabled)
                    e.controller.levitate(false);
                if (e?.isLive && e.controller.groundDrive)
                    e.controller.drive(0);
            }
        }
    }
    function publish(): void {
        if (!ctx.state.match)
            return;
        const p = ctx.state.match.phase === 'finished' ? ctx.state.match.roster.find((r: any) => r.name === ctx.state.match.winner) || ctx.core.current() : ctx.core.current();
        const e = p.entityId ? ctx.core.entity(p) : null;
        talus.ui.set({ biome: ctx.state.arena.biome.name, seed: ctx.state.match.seed, tankCount: ctx.state.match.roster.length,
            seriesStatus: ctx.state.match.series?.complete ? 'Champion · ' + ctx.state.match.series.champion : 'Round ' + ctx.state.match.round + ' / Best of ' + (ctx.state.match.seriesLength || 1),
            roundStats: ctx.state.match.roster.map((r: any) => ({ name: r.name, kills: r.kills, damage: Math.round(r.damage || 0), accuracy: (r.shots ? Math.round((r.hits || 0) / r.shots * 100) : 0) + '%', shots: r.shots || 0, earned: r.cashEarned.toFixed(2) })),
            standings: ctx.state.match.series?.standings || [],
            phase: ctx.state.match.phase, status: ctx.state.match.message, turnNumber: ctx.state.match.turnNumber,
            persona: p.control === 'cpu' ? (ctx.aiming.personaFor(p)?.factionName || 'CPU') + ' · ' + ctx.aiming.skillFor(p) : 'Local hotseat',
            targets: ctx.state.match.roster.filter((r: any) => r !== p && !r.eliminated).map((r: any) => ({ name: r.name, action: 'target-' + r.index, selected: r.entityId === p.targetId })),
            tactic: p.tactic || '', target: ctx.state.match.roster.find((r: any) => r.entityId === p.targetId)?.name || '',
            shotDirection: Math.cos(Number(e?.blackboard.get('custom.angle') ?? 45) * Math.PI / 180) < 0 ? '← LEFT' : 'RIGHT →',
            aimRotation: 'rotate(' + -Number(e?.blackboard.get('custom.angle') ?? 45) + 'deg)',
            lastHit: ctx.state.match.lastHit || '', frameNotice: ctx.state.match.frameNotice || '',
            cashNotice: ctx.state.match.cashNotice || '', round: ctx.state.match.round,
            cash: ctx.state.bank ? ctx.economy.wallet(p).cash : 0, roundCash: p.cashEarned || 0,
            weaponName: ctx.state.market ? ctx.economy.itemById(p.weaponId || 'standard').name : 'Field cannon',
            weaponAmmo: ctx.state.bank && p.weaponId && !ctx.economy.unlimited(p.weaponId) ? ctx.economy.owned(p, p.weaponId) : '∞',
            batteries: ctx.state.bank ? ctx.economy.owned(p, 'battery') : 0,
            reflectiveFieldEnabled: !!ctx.state.market?.items.find((i: any) => i.id === 'super-mag' && i.enabled)?.field,
            attachments: ctx.state.market && ctx.state.bank ? ctx.state.market.items.filter((i: any) => i.enabled && i.attachment).map((i: any) => ({
                name: i.name, action: 'arm-' + i.id, stock: ctx.economy.owned(p, i.id),
                selected: p.guidanceArmed === i.id || p.contactArmed === i.id,
                disabled: p.guidanceArmed !== i.id && p.contactArmed !== i.id
                    && (ctx.economy.owned(p, i.id) < 1 || !ctx.attachments.compatible(ctx.economy.itemById(p.weaponId), i.id)) })) : [],
            autoAimCharges: ctx.state.bank ? ctx.economy.owned(p, 'lazy-boy') : 0,
            groundFuel: e?.isLive ? (e.controller.groundDrive?.fuel ?? 0).toFixed(1) : '0',
            groundFuelStock: ctx.state.bank ? ctx.economy.owned(p, 'fuel-tank').toFixed(1) : '0',
            groundFuelEnabled: !!ctx.state.market?.items.find((i: any) => i.id === 'fuel-tank')?.enabled,
            parachuteCharges: ctx.state.bank ? ctx.economy.owned(p, 'parachute') : 0,
            parachuteEnabled: !!ctx.state.market?.items.find((i: any) => i.id === 'parachute')?.enabled,
            parachuteOn: !!e?.isLive && !!e.controller.fallBrake?.deployed,
            supplies: ctx.state.bank ? { jet: e?.isLive ? (e.controller.state?.fuel ?? 0).toFixed(1) : '0', jetStock: ctx.economy.owned(p, 'jetpack').toFixed(1), dig: ctx.economy.owned(p, 'digger').toFixed(1), jetCapacity: e?.isLive ? (e.controller.state?.capacity ?? null) : null,
                shield: e?.isLive ? Math.round(e.defenses.state?.shield?.remaining || 0) : 0, shieldCapacity: e?.isLive ? (e.defenses.state?.shield?.spec.capacity ?? 0) : 0, magnetCapacity: e?.isLive ? (e.defenses.state?.deflector?.spec.capacity ?? 0) : 0, magnet: e?.isLive ? (e.defenses.state?.deflector?.remaining || 0).toFixed(1) : '0',
                deflectorName: ctx.equipment.selectedDeflector(p) === 'super-mag' ? 'Reflector' : 'Mag',
                magnetStock: ctx.economy.owned(p, 'magnet').toFixed(1), reflectStock: ctx.economy.owned(p, 'super-mag').toFixed(1),
                shieldOn: !!e?.isLive && !!e.defenses.state?.shield?.active,
                magnetOn: !!e?.isLive && !!e.defenses.state?.deflector?.active && !e.defenses.state?.deflector?.spec.reflection,
                reflectOn: !!e?.isLive && !!e.defenses.state?.deflector?.active && !!e.defenses.state?.deflector?.spec.reflection } : null,
            canEquip: !ctx.state.shopOpen && (ctx.core.human() || ctx.state.match.phase === 'ready'),
            loadout: ctx.state.market && ctx.state.bank ? ctx.state.market.items.filter((i: any) => i.enabled && i.kind === 'weapon' && ctx.economy.owned(p, i.id) > 0).map((i: any) => ({
                name: i.name, stock: ctx.economy.unlimited(i.id) ? '∞' : ctx.economy.owned(p, i.id), action: 'equip-' + i.id,
                disabled: ctx.economy.owned(p, i.id) <= 0, selected: p.weaponId === i.id
            })) : [],
            chaosNotice: ctx.state.match.chaos?.notice || '', chaosCount: ctx.state.match.chaos?.jobs.length || 0,
            remaining: Math.max(0, Math.ceil(ctx.state.match.remaining)), turnSeconds: ctx.state.match.turnSeconds,
            ready: ctx.state.match.phase === 'ready', human: ctx.core.human(),
            canSetup: !ctx.state.arcadeCard && ['ready', 'finished', 'fault'].includes(ctx.state.match.phase), canShop: !ctx.state.arcadeCard && ['ready', 'finished'].includes(ctx.state.match.phase), finished: ctx.state.match.phase === 'finished' && !ctx.state.arcadeCard,
            winner: ctx.state.match.winner || 'Draw',
            current: { name: p.name, color: p.color, control: p.control === 'human' ? 'Human' : 'Computer',
                angle: Number(e?.blackboard.get('custom.angle') ?? 45),
                power: Number(e?.blackboard.get('custom.power') ?? 70), health: e?.health == null ? '…' : Math.round(e.health) },
            roster: ctx.state.match.roster.map((r: any) => ({ name: r.name, color: r.color,
                health: r.eliminated ? 0 : !r.entityId ? 100 : ctx.core.entity(r)?.health == null ? '…' : Math.max(0, Math.round(ctx.core.entity(r).health!)),
                status: r.eliminated ? 'OUT' : ctx.state.match.phase === 'finished' ? 'WINNER' : r.index === ctx.state.match.focusIndex ? 'CURRENT' : 'WAITING', kills: r.kills,
                cash: ctx.state.bank ? ctx.economy.wallet(r).cash : 0, earned: r.cashEarned || 0 })),
        });
    }
    function showSetup(draft: any = {}): void {
        if (ctx.state.match && !['ready', 'finished', 'fault'].includes(ctx.state.match.phase))
            return;
        const saved: any = talus.installed.get('indigo') || {};
        talus.ui.set('installed.indigo', { generation: 'wfc', humans: ctx.state.playerCatalog.humans.default,
            computers: ctx.state.playerCatalog.computers.default, turnSeconds: 30, ...saved, ...draft });
        talus.ui.set('canResume', !!ctx.state.match);
        if (!ctx.state.match)
            talus.ui.hud(null);
        talus.ui.openMenu('Menus/setup.html');
    }
    function generationRequest(params: any): any {
        return typeof params?.generation === 'object' && params.generation !== null
            ? params.generation : { recipe: params?.['generation.recipe'] || talus.world.generation.status().recipeId || 'random' };
    }
    function nextGeneration(): any {
        const request = ctx.state.match.baseGeneration || generationRequest(talus.game.params);
        if (!ctx.state.match.biomeCycle)
            return request;
        const cycle = ctx.state.terrainCatalog.recipes.map(recipe => recipe.id);
        const nextRound = ctx.state.match.series?.complete ? 1 : ctx.state.match.round + 1;
        const recipe = cycle[Math.floor((nextRound - 1) / (ctx.state.match.biomeRounds || 1)) % cycle.length];
        return { ...request, recipe, parameters: recipe === request.recipe ? request.parameters : undefined };
    }
    function nextRoundParams(): Record<string, Json> {
        const m = ctx.state.match;
        return JSON.parse(JSON.stringify({ deploy: 'yes', seed: '',
            seriesId: m.series?.complete ? '' : m.seriesId, seriesLength: m.seriesLength || 1,
            round: m.series?.complete ? 1 : m.round + 1, ...players.settings(m),
            turnSeconds: m.turnSeconds, personaSeed: m.personaSeed,
            biomeCycle: m.biomeCycle ? 'cycle' : 'random', biomeRounds: m.biomeRounds || 1,
            baseGeneration: m.baseGeneration, generation: nextGeneration() }));
    }
    function showResults(): void {
        const m = ctx.state.match;
        if (m?.phase !== 'finished' || !m.series?.complete || !m.resultsShown)
            return;
        ctx.state.shopOpen = false;
        input(false);
        talus.ui.set('results', {
            ...nextRoundParams(), champion: m.series.champion || m.winner || 'No survivors',
            roundsPlayed: m.round, standings: m.series.standings,
        });
        talus.ui.openMenu('Menus/results.html');
    }
    function validate(params: any): {
        presentation: {
            active: null;
            queue: never[];
        };
        pendingTurn: null;
        attack: null;
        generation: string;
        generationChoice: any;
        terrainSource: TerrainGenerationStatus;
        seed: number;
        biome: any;
        seriesId: string;
        seriesLength: number;
        biomeCycle: boolean;
        biomeRounds: number;
        baseGeneration: any;
        round: number;
        cashShots: {};
        cashNotice: string;
        bounds: any;
        cameraPolicyVersion: number;
        personaSeed: string;
        humans: number;
        computers: number;
        turnSeconds: number;
        remaining: number;
        phase: string;
        focusIndex: number;
        turnNumber: number;
        shotId: null;
        impact: null;
        roster: {
            index: number;
            name: string;
            control: string;
            color: any;
            templateId: any;
            entityId: null;
            personaId: any;
            characterId: string | null;
            cpuSkill: string | null;
            spawnX: number;
            eliminated: boolean;
            kills: number;
            shots: number;
            hits: number;
            damage: number;
            damageTaken: number;
            cashEarned: number;
            cashBreakdown: {};
            weaponId: string;
            moveDistance: number;
        }[];
        winner: null;
        message: string;
        chaos: {
            rng: number;
            serial: number;
            jobs: never[];
            quiet: number;
            notice: string;
        };
    } {
        const source = talus.world.generation?.status();
        const { humans, computers, humanNames, characters } = players.select(params, ctx.state.playerCatalog);
        const seconds = Number(params.turnSeconds);
        if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120)
            throw new Error('Choose a turn length from 5 to 120 whole seconds.');
        const count = humans + computers, span = ctx.state.arena.combat.w - ctx.state.arena.combat.spawnInset * 2;
        const left = ctx.state.arena.combat.x + ctx.state.arena.combat.spawnInset;
        const paletteOrder = ctx.state.arena.tankPalettes.map((_: any, i: number) => i)
            .filter((i: number) => !characters.some(c => c.paletteIndex === i));
        let rosterRng = ctx.core.chaosSeed(String(params.personaSeed || talus.world.seed) + ':roster');
        for (let i = paletteOrder.length - 1; i > 0; i--) {
            rosterRng ^= rosterRng << 13;
            rosterRng ^= rosterRng >>> 17;
            rosterRng ^= rosterRng << 5;
            const j = (rosterRng >>> 0) % (i + 1);
            [paletteOrder[i], paletteOrder[j]] = [paletteOrder[j], paletteOrder[i]];
        }
        const roster = Array.from({ length: count }, (_, i) => {
            const character = i < humans ? null : characters[i - humans];
            const palette = ctx.state.arena.tankPalettes[character ? character.paletteIndex : paletteOrder[i]];
            return { index: i,
            name: character?.name || humanNames[i],
            control: character ? 'cpu' : 'human', color: palette.color,
            templateId: palette.templateId, entityId: null,
            personaId: character?.personaId || null, characterId: character?.id || null, cpuSkill: character?.skill || null,
            spawnX: Math.round(left + span * i / (count - 1)), eliminated: false, kills: 0,
            shots: 0, hits: 0, damage: 0, damageTaken: 0, cashEarned: 0, cashBreakdown: {}, weaponId: 'standard', moveDistance: 0 };
        });
        return { presentation: { active: null, queue: [] }, pendingTurn: null, attack: null,
            generation: source?.recipeId || 'wfc',
            generationChoice: params.generation?.recipe || params['generation.recipe'] || source?.recipeId || 'wfc',
            terrainSource: source || null,
            seed: talus.world.seed, biome: ctx.state.arena.biome.id,
            seriesId: String(params.seriesId || talus.world.id), seriesLength: [1, 3, 5, 7, 9].includes(Number(params.seriesLength)) ? Number(params.seriesLength) : 1,
            biomeCycle: params.biomeCycle === 'cycle', biomeRounds: ctx.core.clamp(Math.floor(Number(params.biomeRounds) || 1), 1, 9), baseGeneration: params.baseGeneration || generationRequest(params),
            round: Math.max(1, Math.floor(Number(params.round) || 1)), cashShots: {}, cashNotice: '',
            bounds: { ...ctx.state.arena.bounds }, cameraPolicyVersion: 1,
            personaSeed: String(params.personaSeed || talus.world.seed),
            humans, computers, turnSeconds: seconds, remaining: seconds, phase: 'deploying', focusIndex: 0,
            turnNumber: 0, shotId: null, impact: null, roster, winner: null, message: 'Deploying tanks',
            chaos: { rng: ctx.core.chaosSeed(String(talus.world.seed)), serial: 0, jobs: [], quiet: 0, notice: '' } };
    }
    function bind() {
        talus.on('menu.pause.finish-action', ctx.session.prepareExitBoundary);
        talus.on('menu.custom.finish-action', ctx.session.prepareExitBoundary);
        talus.on('menu.pause.cancel-exit', ctx.session.resumeAfterExitPreparation);
        talus.on('menu.custom.cancel-exit', ctx.session.resumeAfterExitPreparation);
        talus.on('menu.pause.resume', ctx.session.resumeAfterExitPreparation);
        talus.on('menu.custom.resume', ctx.session.resumeAfterExitPreparation);
        talus.on('menu.hud.begin', () => {
            if (!ctx.state.shopOpen && ctx.state.match?.phase === 'ready')
                ctx.session.run(() => ctx.turns.beginTurn(false));
        });
        talus.on('menu.hud.shop', ctx.economy.openShop);
        talus.on('menu.custom.results-title', () => {
            if (ctx.state.match?.phase === 'finished' && ctx.state.match.series?.complete)
                talus.game.quitToMenu({ save: 'discard', destination: 'title' });
        });
        talus.on('menu.custom.shop-close', ctx.economy.closeShop);
        talus.on('menu.custom.shop-begin', () => {
            if (!ctx.state.shopOpen || ctx.state.match?.phase !== 'ready')
                return;
            ctx.economy.closeShop();
            ctx.session.run(() => ctx.turns.beginTurn(false));
        });
        talus.on('menu.closed', e => {
            if (e.file === 'Menus/shop.html') {
                ctx.state.shopOpen = false;
                publish();
            }
        });
        talus.on('menu.custom.shop-prev', () => {
            if (ctx.state.shopOpen) {
                ctx.state.shopIndex = (ctx.state.shopIndex + ctx.state.match.roster.length - 1) % ctx.state.match.roster.length;
                ctx.economy.publishShop();
            }
        });
        talus.on('menu.custom.shop-next', () => {
            if (ctx.state.shopOpen) {
                ctx.state.shopIndex = (ctx.state.shopIndex + 1) % ctx.state.match.roster.length;
                ctx.economy.publishShop();
            }
        });
        talus.on('menu.hud.shield', () => {
            if (ctx.core.human())
                ctx.equipment.useDefense(ctx.core.current(), 'shield');
        });
        talus.on('menu.hud.magnet', () => {
            if (ctx.core.human())
                ctx.equipment.useDefense(ctx.core.current(), 'magnet');
        });
        talus.on('menu.hud.super-mag', () => {
            if (ctx.core.human())
                ctx.equipment.useDefense(ctx.core.current(), 'super-mag');
        });
        talus.on('menu.hud.battery', () => {
            if (ctx.core.human())
                ctx.equipment.useBattery(ctx.core.current());
        });
        talus.on('menu.hud.parachute', () => {
            if (ctx.core.human())
                ctx.equipment.useParachute(ctx.core.current());
        });
        talus.on('menu.hud.auto-aim', () => {
            if (ctx.core.human())
                ctx.equipment.useAutoAim(ctx.core.current());
        });
        talus.on('menu.hud.fire', () => {
            if (ctx.core.human())
                ctx.session.run(ctx.combat.fire);
        });
        talus.on('menu.hud.pass', () => {
            if (ctx.core.human()) {
                ctx.economy.reward(ctx.core.current(), 'pass');
                ctx.session.run(() => ctx.turns.beginTurn(true));
            }
        });
        talus.on('menu.hud.angle-up', () => ctx.combat.adjust(5, 0));
        talus.on('menu.hud.angle-down', () => ctx.combat.adjust(-5, 0));
        talus.on('menu.hud.power-up', () => ctx.combat.adjust(0, 5));
        talus.on('menu.hud.power-down', () => ctx.combat.adjust(0, -5));
        for (let i = 0; i < 16; i++)
            talus.on('menu.hud.target-' + i, () => {
                if (ctx.core.human())
                    ctx.aiming.selectTarget(ctx.core.current(), ctx.state.match.roster[i]?.entityId);
            });
        talus.on('menu.hud.flip', () => {
            if (ctx.core.human())
                ctx.equipment.flipUpright(ctx.core.current());
        });
        talus.on('menu.hud.setup', () => showSetup());
        talus.on('input.pressed', e => {
            if (e.slot !== 0 || !ctx.core.human())
                return;
            if (e.action === 'tank_target') {
                const choices = ctx.state.match.roster.filter((r: any) => r !== ctx.core.current() && ctx.aiming.targetSnapshot(r));
                const at = choices.findIndex((r: any) => r.entityId === ctx.core.current().targetId);
                if (choices.length)
                    ctx.aiming.selectTarget(ctx.core.current(), choices[(at + 1) % choices.length].entityId);
            }
            if (e.action === 'tank_flip')
                ctx.equipment.flipUpright(ctx.core.current());
            if (e.action === 'tank_fire')
                ctx.session.run(ctx.combat.fire);
            if (e.action === 'tank_pass') {
                ctx.economy.reward(ctx.core.current(), 'pass');
                ctx.session.run(() => ctx.turns.beginTurn(true));
            }
        });
    }
    return { input, publish, showSetup, showResults, generationRequest, nextGeneration, nextRoundParams, validate, bind };
}
export = create;
