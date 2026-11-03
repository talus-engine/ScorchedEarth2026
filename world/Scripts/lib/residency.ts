/** Bounded simulation anchors and tank restoration. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function checkRoster(): void {
        if (!ctx.state.match || ctx.state.match.phase === 'deploying')
            return;
        const b = ctx.state.match.bounds;
        for (const p of ctx.state.match.roster) {
            if (p.eliminated || !p.entityId)
                continue;
            const e = ctx.core.entity(p), s = e?.snapshot();
            if (e?.residency === 'destroyed' || s?.alive === false) {
                ctx.turns.eliminate(p, 'destroyed');
                continue;
            }
            if (!s)
                continue;
            p.lastKnownPosition = { x: s.x, y: s.y };
            if (s.x < b.x || s.x >= b.x + b.w || s.y < b.y || s.y >= b.y + b.h) {
                ctx.turns.eliminate(p, 'out of bounds');
                e.kill('env:indigo-bounds');
            }
        }
    }
    function refreshRestoredTanks(): void {
        for (const p of ctx.state.match.roster)
            if (p.passivePosturePending) {
                if (p.eliminated || p === ctx.core.current() && !['deploying', 'ready', 'finished'].includes(ctx.state.match.phase)) {
                    delete p.passivePosturePending;
                    ctx.session.persist();
                }
                else
                    ctx.state.pendingTankReady.add(p.entityId);
            }
        for (const id of ctx.state.pendingTankReady) {
            const p = ctx.state.match.roster.find((row: any) => row.entityId === id), tank = p ? ctx.core.entity(p) : null;
            if (!p || tank?.residency === 'destroyed') {
                if (p?.passivePosturePending) {
                    delete p.passivePosturePending;
                    ctx.session.persist();
                }
                ctx.state.pendingTankReady.delete(id);
                continue;
            }
            if (!tank?.isLive)
                continue;
            if (p.passivePosturePending)
                ctx.equipment.passivePosture(p);
            ctx.presentation.nameplate(p);
            if (ctx.core.active() && p === ctx.core.current() && !ctx.combat.aim())
                continue;
            ctx.state.pendingTankReady.delete(id);
        }
    }
    function releaseEmissionRegion(key: string): void {
        const region = ctx.state.emissionRegions.get(key);
        if (region) {
            region.anchor?.release();
            ctx.state.emissionRegions.delete(key);
        }
    }
    function releaseEmissionRegions(prefix = ''): void {
        for (const key of [...ctx.state.emissionRegions.keys()])
            if (key.startsWith(prefix))
                releaseEmissionRegion(key);
    }
    function emissionRegionReady(key: string, spec: AnchorSpec, particles: boolean, actorReady = true): boolean {
        const clock = talus.sim.clock, signature = JSON.stringify(spec);
        let region = ctx.state.emissionRegions.get(key);
        if (!region) {
            region = { anchor: null, spec: signature, lastClock: clock, waited: 0, retryAt: clock, reason: '', ready: false };
            ctx.state.emissionRegions.set(key, region);
        }
        const elapsed = Math.max(0, clock - region.lastClock);
        region.lastClock = clock;
        if (!region.ready)
            region.waited += elapsed;
        if (region.waited > 10) {
            const reason = region.reason || 'native region did not become ready';
            releaseEmissionRegion(key);
            throw new Error(key + ' residency timed out after 10 simulated seconds: ' + reason);
        }
        if (clock >= region.retryAt && (!region.anchor || region.spec !== signature)) {
            try {
                if (region.anchor)
                    region.anchor.update(spec);
                else
                    region.anchor = talus.sim.anchor(spec);
                region.spec = signature;
            }
            catch (error) {
                if ((error as any)?.code !== 'REFUSED' && !/^Error: REFUSED:|^REFUSED:/.test(String(error)))
                    throw error;
                const reason = String(error);
                region.ready = false;
                region.reason = reason;
                region.retryAt = clock + .25;
                return false;
            }
        }
        const anchor = region.anchor, chunks = anchor?.chunks.length || 0;
        region.ready = !!anchor?.active && region.spec === signature && !anchor.refused && chunks > 0
            && anchor.loaded === chunks && (!particles || anchor.particles === 'simulated') && actorReady;
        if (!region.ready)
            region.reason = anchor?.refused || (!anchor && region.reason) || (!actorReady ? 'actor-not-simulated'
                : particles && anchor?.particles !== 'simulated' ? 'world-particles-not-simulated' : 'native-region-loading');
        return region.ready;
    }
    function chaosRegionReady(job: any, fx: any): boolean {
        const wreck = talus.entities.get(job.owner), radius = Math.max(64, Math.ceil(fx.finishBlast || 0) + 16);
        const gone = !wreck?.exists;
        const spec: AnchorSpec = gone
            ? { rect: { x: job.x - radius, y: job.y - radius, w: radius * 2, h: radius * 2 }, label: 'terra-death-' + job.id }
            : { follow: job.owner, halfWidth: radius, halfHeight: radius, label: 'terra-death-' + job.id };
        return emissionRegionReady('death:' + job.id, spec,
            fx.mode === 'spray' || fx.mode === 'transmute' || !!fx.finishMaterial || !!fx.finishBlast,
            gone || !!wreck?.isLive);
    }
    function bind() {
        talus.on('entity.residency', e => {
            const p = ctx.state.match?.roster.find((r: any) => r.entityId === e.entityKey);
            if (p)
                ctx.state.pendingTankReady.add(p.entityId);
        });
    }
    return { checkRoster, refreshRestoredTanks, releaseEmissionRegion, releaseEmissionRegions, emissionRegionReady, chaosRegionReady, bind };
}
export = create;
