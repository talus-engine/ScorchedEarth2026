/** Turn progression, elimination and series results. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function scoreSeries(scores: any): void {
        scores.series ||= {};
        const id = ctx.state.match.seriesId || talus.world.id;
        const series = (Object.hasOwn(scores.series, id) ? scores.series[id] : null) || { length: ctx.state.match.seriesLength || 1, rounds: {}, players: {} };
        if (!series.rounds[talus.world.id]) {
            for (const p of ctx.state.match.roster) {
                const key = ctx.economy.playerKey(p), row = Object.hasOwn(series.players, key) ? series.players[key] : { name: p.name, wins: 0, kills: 0, damage: 0, earned: 0, shots: 0, hits: 0 };
                row.wins += p.name === ctx.state.match.winner ? 1 : 0;
                for (const k of ['kills', 'damage', 'shots', 'hits'])
                    row[k] += p[k] || 0;
                row.earned += p.cashEarned;
                series.players = { ...series.players, [key]: row };
            }
            series.rounds[talus.world.id] = { winner: ctx.state.match.winner, seed: ctx.state.match.seed, recipe: ctx.state.match.generation };
        }
        const standings = Object.values(series.players).sort((a: any, b: any) => b.wins - a.wins || b.kills - a.kills || b.damage - a.damage) as any[];
        const leader = standings[0], complete = Object.keys(series.rounds).length >= series.length || leader?.wins >= Math.floor(series.length / 2) + 1;
        const tied = standings.filter((r: any) => r.wins === leader?.wins);
        series.complete = complete;
        series.champion = complete ? (tied.length === 1 ? leader.name : 'Draw: ' + tied.map((r: any) => r.name).join(' / ')) : null;
        scores.series = { ...scores.series, [id]: series };
        const keys = Object.keys(scores.series);
        for (const old of keys.slice(0, Math.max(0, keys.length - 50)))
            if (old !== id)
                delete scores.series[old];
        ctx.state.match.series = { complete, champion: series.champion, standings };
    }
    function eliminate(p: any, reason: string, killerId?: string | null, at?: {
        x: number | null;
        y: number | null;
    }): void {
        if (p.eliminated || ctx.state.match.phase === 'finished')
            return;
        ctx.equipment.accountSupply(p);
        p.eliminated = true;
        p.eliminationReason = reason;
        const killer = ctx.state.match.roster.find((r: any) => r.entityId === killerId);
        if (killer && killer !== p)
            killer.kills++;
        ctx.economy.reward(p, 'death');
        if (killer)
            ctx.economy.reward(killer, 'kill');
        ctx.presentation.queuePresentation(p, 'death', at);
        if (p === ctx.core.current() && ctx.state.match.phase === 'firing') {
            ctx.state.match.phase = 'turn';
            ctx.state.match.waitTicks = 0;
        }
        ctx.session.persist();
        ctx.menus.publish();
    }
    async function announce(story: string, vars: any): Promise<void> {
        if (talus.dialogue.active)
            talus.dialogue.dismiss();
        await talus.dialogue.start(story, { mode: 'announcer', speaker: 'Range control', lineMs: 1600, vars, writeBack: false });
    }
    function finish(): boolean {
        if (ctx.state.match.phase === 'finished')
            return true;
        const alive = ctx.state.match.roster.filter((p: any) => !p.eliminated);
        if (alive.length > 1)
            return false;
        if (ctx.core.presenting() || ctx.state.match.attack || ctx.payloads.settling() || ctx.state.match.chaos.jobs.length || ctx.state.match.chaos.quiet < ctx.state.chaosCatalog.resultQuietSeconds) {
            ctx.state.match.phase = 'aftermath';
            ctx.menus.input(false);
            ctx.state.match.message = 'Last tank standing… waiting for the chain reaction';
            ctx.session.persist();
            ctx.menus.publish();
            return true;
        }
        if (alive[0])
            ctx.economy.reward(alive[0], 'win');
        ctx.state.match.phase = 'finished';
        ctx.payloads.finished();
        ctx.state.match.winner = alive[0]?.name || null;
        ctx.economy.settleWallets();
        ctx.menus.input(false);
        ctx.state.match.message = ctx.state.match.winner ? ctx.state.match.winner + ' wins the match' : 'No tanks remain — draw';
        const scores: any = talus.installed.get('indigo.scores') || { players: {}, matches: {} };
        if (!scores.matches[talus.world.id]) {
            for (const p of ctx.state.match.roster) {
                const key = p.name.toLowerCase(), s = (Object.hasOwn(scores.players, key) ? scores.players[key] : null) || { name: p.name, games: 0, wins: 0, kills: 0 };
                s.games++;
                s.kills += p.kills;
                if (p.name === ctx.state.match.winner)
                    s.wins++;
                for (const field of ['shots', 'hits', 'damage', 'damageTaken'])
                    s[field] = (s[field] || 0) + (p[field] || 0);
                s.earned = (s.earned || 0) + p.cashEarned;
                scores.players = { ...scores.players, [key]: s };
            }
            scores.matches[talus.world.id] = { winner: ctx.state.match.winner, seed: ctx.state.match.seed };
            scoreSeries(scores);
            talus.installed.set('indigo.scores', scores);
        }
        talus.ui.set('scores', Object.values(scores.players));
        ctx.session.persist();
        ctx.menus.publish();
        ctx.presentation.playCue("victory");
        ctx.session.run(async () => {
            await ctx.presentation.turnScoreCard();
            if (ctx.state.match.phase !== 'finished')
                return;
            await ctx.presentation.showArcadeCard(ctx.state.match.winner ? 'VICTORY OVERDRIVE' : 'MUTUALLY ASSURED NONSENSE', ctx.state.match.series?.complete ? ctx.state.match.series.champion : ctx.state.match.winner || 'NO SURVIVORS', 'Round ' + ctx.state.match.round + ' · Seed ' + ctx.state.match.seed, 3);
            ctx.state.match.resultsShown = true;
            ctx.session.persist();
            if (!automaticSeries())
                ctx.economy.openShop();
            ctx.menus.publish();
        });
        return true;
    }
    function automaticSeries(): boolean {
        const m = ctx.state.match;
        return !!(m?.phase === 'finished' && m.series && !m.series.complete && m.roster.length
            && m.roster.every((p: any) => p.control === 'cpu'));
    }
    async function advanceCpuRound(): Promise<void> {
        const m = ctx.state.match;
        if (!automaticSeries() || !m.resultsShown || m.nextRoundRequest || ctx.state.booting
            || talus.sim.paused || ctx.state.exitDrain || ctx.state.shopOpen || ctx.session.sequencePending()
            || !talus.game.saveStatus.allowed)
            return;
        // Persist all purchases and the request before the native transition can end this VM.
        ctx.economy.cpuShopping();
        const params = ctx.menus.nextRoundParams();
        params.seed = (Number(m.seed) + 0x9e3779b9) >>> 0;
        m.nextRoundRequest = { status: 'requested', params };
        m.message = 'Deploying round ' + params.round;
        ctx.session.persist();
        ctx.menus.publish();
        let result: GameTransitionResult;
        try { result = await talus.game.newGame(params); }
        catch (error) { result = { status: 'refused', reason: String(error) }; }
        if (ctx.state.match !== m || result.status === 'accepted')
            return;
        m.nextRoundRequest = { status: 'refused', reason: result.reason, params };
        m.message = 'Next round could not start: ' + result.reason + '. Deploy next round retries.';
        ctx.session.persist();
        ctx.economy.openShop();
        ctx.menus.publish();
    }
    async function beginTurn(next: boolean): Promise<void> {
        if (['focusing', 'refocusing', 'positioning', 'deploying', 'finished', 'fault'].includes(ctx.state.match.phase))
            return;
        if (ctx.core.presenting()) {
            ctx.state.match.pendingTurn = next;
            return;
        }
        ctx.state.match.pendingTurn = null;
        ctx.menus.input(false);
        ctx.state.match.phase = 'focusing';
        ctx.session.persist();
        ctx.residency.checkRoster();
        if (finish())
            return;
        const previous = ctx.core.current();
        if (next)
            await ctx.presentation.turnScoreCard();
        else if (!ctx.state.match.turnNumber)
            await ctx.presentation.showArcadeCard('SCORCHED EARTH 2026', 'BATTLE STATIONS', 'Round ' + ctx.state.match.round + ' · Seed ' + ctx.state.match.seed, 2.5);
        if (ctx.state.match.phase !== 'focusing')
            return;
        ctx.residency.checkRoster();
        if (finish())
            return;
        if (next && !previous.eliminated)
            ctx.equipment.passivePosture(previous);
        if (next)
            do {
                ctx.state.match.focusIndex = (ctx.state.match.focusIndex + 1) % ctx.state.match.roster.length;
            } while (ctx.core.current().eliminated);
        ctx.equipment.autoDefend();
        ctx.state.match.turnNumber++;
        ctx.creatures.onTurn();
        ctx.state.match.remaining = ctx.state.match.turnSeconds;
        ctx.state.match.shotId = null;
        ctx.state.match.impact = null;
        ctx.state.match.message = 'Loading ' + ctx.core.current().name;
        ctx.session.persist();
        ctx.menus.publish();
        await ctx.supplies.maybeSupplyDrop(next ? 'turn' : 'round');
        if (ctx.state.match.phase !== 'focusing' || finish())
            return;
        const ready = await ctx.camera.focus();
        if (ctx.state.match.phase !== 'focusing')
            return;
        if (ready && !ctx.core.current().eliminated) {
            await ctx.presentation.showArcadeCard('TURN ' + ctx.state.match.turnNumber + ' / COMMAND CARTRIDGE', ctx.core.current().name, ctx.core.current().control === 'cpu' ? (ctx.aiming.personaFor(ctx.core.current())?.factionName || 'CPU') + ' · ' + (ctx.state.match.cpuSkill === 'persona' ? ctx.aiming.personaFor(ctx.core.current())?.skill : ctx.state.match.cpuSkill || ctx.aiming.personaFor(ctx.core.current())?.skill) : 'Your controller. Your crater.', 1, ctx.core.current().color);
            if (ctx.state.match.phase !== 'focusing')
                return;
            ctx.residency.checkRoster();
            if (finish())
                return;
            const restored = await ctx.camera.focus();
            if (ctx.state.match.phase !== 'focusing' || finish())
                return;
            if (!restored || ctx.core.current().eliminated) {
                ctx.state.match.phase = 'turn';
                ctx.session.run(() => beginTurn(true));
                return;
            }
            if (ctx.state.match.phase === 'focusing')
                startTurn();
        }
        else {
            ctx.state.match.phase = 'turn';
            ctx.session.run(() => beginTurn(true));
        }
    }
    function startTurn(): void {
        ctx.state.match.phase = 'turn';
        ctx.state.match.message = ctx.core.current().control === 'human' ? 'Position, aim and fire' : 'Computer is choosing its shot';
        ctx.core.current().turnStartCash = ctx.core.current().cashEarned;
        ctx.core.current().turnStartKills = ctx.core.current().kills;
        ctx.economy.reward(ctx.core.current(), 'turn');
        ctx.core.current().lastMoveX = ctx.core.entity(ctx.core.current()).x;
        ctx.menus.input(ctx.core.current().control === 'human');
        ctx.core.entity(ctx.core.current()).blackboard.set('custom.turn', ctx.state.match.turnNumber);
        if (ctx.core.current().control === 'human' && !ctx.state.match.roster.some((r: any) => r.entityId === ctx.core.current().targetId && !r.eliminated)) {
            const target = ctx.state.match.roster.find((r: any) => r !== ctx.core.current() && !r.eliminated);
            if (target)
                ctx.aiming.selectTarget(ctx.core.current(), target.entityId);
        }
        ctx.session.persist();
        ctx.menus.publish();
        ctx.presentation.playCue("turn");
        if (!ctx.state.exitDrain && ctx.core.current().control === 'cpu')
            ctx.session.run(() => ctx.cpu.prepareCpuTurn(ctx.core.current(), ctx.state.match.turnNumber));
    }
    async function settle(): Promise<void> {
        const p = ctx.state.match.impact;
        if (!p)
            throw new Error('Missing impact resolution point');
        ctx.state.match.phase = 'settling';
        ctx.state.match.message = 'Letting the impact settle';
        ctx.session.persist();
        ctx.menus.publish();
        if (!ctx.core.presenting())
            ctx.camera.cameraPoint(p, 'impact');
        await talus.world.watchSettle({ x: p.x - 192, y: p.y - 128, w: 384, h: 384 }, { minTicks: 60, maxTicks: ctx.state.arena.impactWaitTicks ?? 180 }).done;
        ctx.residency.checkRoster();
        if (!finish())
            await beginTurn(true);
    }
    function bind() {
        talus.on('death', e => {
            const p = ctx.state.match?.roster.find((r: any) => r.entityId === (e.entity?.id || e.stableId));
            if (p) {
                try {
                    eliminate(p, 'destroyed', e.killer?.id, e);
                }
                catch (error) {
                    ctx.session.fail(error);
                }
            }
        });
    }
    return { scoreSeries, eliminate, announce, finish, automaticSeries, advanceCpuRound, beginTurn, startTurn, settle, bind };
}
export = create;
