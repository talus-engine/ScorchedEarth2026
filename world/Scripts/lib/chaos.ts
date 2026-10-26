/** Delayed death effects and their simulation requirements. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function chaosRandom(): number {
        let x = ctx.state.match.chaos.rng | 0;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        ctx.state.match.chaos.rng = x >>> 0;
        return (x >>> 0) / 4294967296;
    }
    function queueChaos(p: any, at?: {
        x: number | null;
        y: number | null;
    }): void {
        if (p.chaosId || ctx.state.match.phase === 'finished')
            return;
        const tank = ctx.core.entity(p), position = at?.x != null && at.y != null ? at : tank?.position;
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y))
            throw new Error('Death effect has no physical position: ' + p.name);
        const pool = ctx.state.chaosCatalog.effects.filter((fx: any) => fx.enabled);
        const fx = pool[Math.floor(chaosRandom() * pool.length)];
        p.chaosId = ++ctx.state.match.chaos.serial;
        p.deathEffect = fx.id;
        const job = { id: p.chaosId, owner: p.entityId, name: p.name, effect: fx.id,
            x: Number(position.x), y: Number(position.y), elapsed: 0, emitted: 0, particles: 0, livePulses: 0,
            projectileIds: [], launched: 0, ended: 0, started: false, emissionDone: false };
        ctx.state.match.chaos.jobs.push(job);
        ctx.state.match.chaos.quiet = 0;
        ctx.state.match.chaos.notice = p.name + ': ' + fx.name + '!';
        if (tank?.can('blackboard.set'))
            tank.blackboard.set('custom.deathChaos', { id: job.id, effect: fx.id });
        talus.ui.floatText({ x: job.x, y: job.y - 30 }, fx.name + '!', { color: '#ffbd82', ms: 2500, size: 1.3 });
    }
    function chaosShell(job: any, spec: any, instant = false): void {
        ctx.state.launchingChaos = true;
        try {
            const shell = talus.projectiles.launch({ kind: 'rigid-body', element: 'IRON',
                owner: job.owner, x: job.x, y: job.y, vx: 0, vy: 0,
                bodySizePx: 4, gravityScale: 1, drag: 0, lifetime: 6, independent: true,
                damage: 55, damageType: 'blast', aoeRadius: 72, carveRadius: 28, carveMode: 'erase',
                ...spec, detonate: { ...(spec.detonate ?? { onBody: true, onTerrain: true, atLifetime: true }), looseMatter: ctx.state.market.looseMatter } });
            if (!shell)
                throw new Error('Death shell refused: ' + job.effect + ' #' + job.launched);
            job.projectileIds.push(shell.id);
            job.launched++;
            if (instant)
                shell.detonate();
        }
        finally {
            ctx.state.launchingChaos = false;
        }
    }
    function finishEmission(job: any, fx: any): boolean {
        if (!ctx.state.match || ctx.state.match.phase === 'fault') {
            ctx.residency.releaseEmissionRegion('death:' + job.id);
            return false;
        }
        if (job.emissionDone) {
            ctx.residency.releaseEmissionRegion('death:' + job.id);
            return true;
        }
        if (fx.finishBlast) {
            if (!ctx.residency.chaosRegionReady(job, fx))
                return false;
            const result = talus.world.explode({ x: job.x, y: job.y, radius: fx.finishBlast,
                damage: 45, carveRadius: Math.round(fx.finishBlast * .6), carve: 'erase', source: job.owner });
            if (!result)
                throw new Error('Death finale refused: ' + job.effect);
        }
        job.emissionDone = true;
        const corpse = talus.entities.get(job.owner);
        if (corpse?.exists)
            corpse.despawn();
        ctx.residency.releaseEmissionRegion('death:' + job.id);
        return true;
    }
    async function deathBrush(job: any, fx: any): Promise<void> {
        const radius = fx.radiusMin + Math.floor(chaosRandom() * (fx.radiusMax - fx.radiusMin + 1));
        const x = Math.round(job.x), y = Math.round(job.y), cells = radius * radius * 4;
        const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius },
            bounds: { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 }, replacement: 'empty',
            budget: { cells, particles: cells, work: cells }, recipe: ctx.combat.materialRecipe(fx.element) as TerrainRecipe,
            seed: ctx.core.chaosSeed(ctx.state.match.seed + ':death-brush:' + job.id) });
        if (receipt.status !== 'completed')
            throw new Error('Death brush: ' + receipt.reason);
        job.particles = receipt.added;
        job.workPending = false;
        finishEmission(job, fx);
        ctx.session.persist();
    }
    function tickChaos(dt: number): void {
        if (talus.sim.paused || ctx.state.match.phase === 'fault')
            return;
        for (const key of [...ctx.state.emissionRegions.keys()])
            if (key.startsWith('death:')
                && !ctx.state.match.chaos.jobs.some((job: any) => key === 'death:' + job.id && !job.emissionDone))
                ctx.residency.releaseEmissionRegion(key);
        if (!ctx.state.match.chaos.jobs.length) {
            ctx.state.match.chaos.quiet += dt;
            return;
        }
        ctx.state.match.chaos.quiet = 0;
        for (const job of [...ctx.state.match.chaos.jobs]) {
            const fx = ctx.state.chaosCatalog.effects.find((v: any) => v.id === job.effect);
            if (!fx?.enabled)
                throw new Error('Death effect needs engine support: ' + job.effect);
            const wreck = talus.entities.get(job.owner)?.position;
            if (!job.emissionDone && wreck) {
                job.x = wreck.x;
                job.y = wreck.y;
            }
            if (!job.emissionDone && ['spray', 'shells', 'magazine'].includes(fx.mode) && !ctx.residency.chaosRegionReady(job, fx))
                continue;
            job.elapsed += dt;
            if (!job.started) {
                job.started = true;
                ctx.presentation.playCue("death");
                if (fx.mode === 'brush') {
                    job.workPending = true;
                    ctx.session.run(() => deathBrush(job, fx));
                }
                if (fx.mode === 'magazine') {
                    for (let n = 0; n < fx.count; n++)
                        chaosShell(job, {}, true);
                    finishEmission(job, fx);
                }
            }
            if (!job.emissionDone && !job.workPending) {
                const total = fx.mode === 'shells' ? fx.count : Math.ceil(fx.duration / fx.interval);
                while (job.emitted < total && job.emitted * fx.interval <= job.elapsed) {
                    const n = job.emitted;
                    if (fx.mode === 'spray') {
                        const placed = talus.world.spawnParticles({ element: fx.element,
                            x: job.x, y: job.y - 26, count: fx.count, vx: 0, vy: -fx.speed,
                            spread: fx.spread, speedJitter: .3 });
                        if (!(placed > 0))
                            throw new Error('Death spray placed no particles: ' + job.effect + ' pulse ' + n);
                        job.particles += placed;
                        if (placed > 0)
                            job.livePulses++;
                        if (fx.ignite && n % 3 === 0)
                            job.particles += talus.world.spawnParticles({
                                element: 'FIRE', x: job.x, y: job.y - 30, count: 8, vx: 0, vy: -80, spread: 1
                            });
                    }
                    else {
                        const angle = fx.pattern === 'radial' ? n * Math.PI * 2 / total : -Math.PI + chaosRandom() * Math.PI;
                        const rain = fx.pattern === 'rain', bounce = fx.pattern === 'bounce';
                        chaosShell(job, { x: rain ? job.x + (chaosRandom() - .5) * 360 : job.x,
                            y: rain ? Math.max(40, job.y - 300) : job.y - 26,
                            vx: rain ? (chaosRandom() - .5) * 60 : Math.cos(angle) * fx.speed,
                            vy: rain ? fx.speed : Math.sin(angle) * fx.speed,
                            independent: true,
                            ...(bounce ? { bouncing: 6, detonate: { fuse: 2.5, atLifetime: true } } : {}) });
                    }
                    job.emitted++;
                }
                if (job.elapsed >= fx.duration || fx.mode === 'shells' && job.emitted >= total && !fx.finishBlast)
                    finishEmission(job, fx);
            }
            if (job.emissionDone && job.projectileIds.length === 0) {
                ctx.state.match.chaos.jobs = ctx.state.match.chaos.jobs.filter((v: any) => v.id !== job.id);
            }
            else if (job.elapsed > fx.duration + 12) {
                throw new Error('Death projectile did not resolve: ' + job.effect);
            }
        }
        ctx.session.persist();
    }
    return { chaosRandom, queueChaos, chaosShell, finishEmission, deathBrush, tickChaos };
}
export = create;
