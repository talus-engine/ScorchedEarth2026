/** Noise-seeking explosive sheep credited to the original shooter. */
import type { Runtime } from 'context';
type Point = { x: number; y: number };
function create(ctx: Runtime) {
    let catalog: any = null, generation = 0;
    const pending = new Set<any>();
    const current = () => ctx.state.match;
    function state(): any {
        const m = current();
        if (!m)
            return null;
        return m.tricksters ||= { serial: 0, clock: 0, sheep: [], noises: [] };
    }
    const finite = (at: any): at is Point => Number.isFinite(at?.x) && Number.isFinite(at?.y);
    const roster = (id: string) => current()?.roster.find((p: any) => p.entityId === id);
    function inside(at: Point): boolean {
        const b = current()?.bounds || ctx.state.arena.bounds;
        return finite(at) && at.x >= b.x && at.x < b.x + b.w && at.y >= b.y && at.y < b.y + b.h;
    }
    const regionKey = (job: any) => 'trickster:' + job.id;
    function barrier(): void {
        talus.game.setSaveBarrier('tricksters', pending.size ? 'Creating native Black Sheep' : null);
    }
    function configure(data: any): void { catalog = data; }
    function canFire(item: any): boolean {
        return item?.behavior?.mode !== 'trickster' || item.behavior.kind !== 'black-sheep'
            || !!catalog && (current()?.tricksters?.sheep.length || 0) < catalog.sheep.maxActive;
    }
    function hear(at: Point): void {
        if (!catalog || !finite(at) || !current() || ['ready', 'deploying', 'finished', 'fault'].includes(current().phase))
            return;
        const s = state();
        s.noises.push({ x: at.x, y: at.y, clock: s.clock });
        s.noises = s.noises.slice(-8);
    }
    function impact(kind: string, owner: string, at: Point): boolean {
        if (!catalog || kind !== 'black-sheep' || !current() || !inside(at))
            return false;
        const s = state();
        if (s.sheep.length >= catalog.sheep.maxActive)
            throw new Error('Black Sheep capacity reached');
        const job = { id: ++s.serial, source: owner, entityId: null, mode: 'queued', age: 0, spawnAttempts: 0, retryAt: 0,
            x: at.x, y: Math.max(current().bounds.y + 12, at.y - catalog.sheep.spawnLift), stuck: 0, lastX: at.x };
        s.sheep.push(job);
        ctx.session.persist();
        return true;
    }
    function ready(job: any, particles = false): boolean {
        const radius = Math.max(64, catalog.sheep.blastRadius + 12);
        const entity = job.entityId ? talus.entities.get(job.entityId) : null;
        const spec: AnchorSpec = entity?.exists
            ? { follow: job.entityId, halfWidth: radius, halfHeight: radius, label: 'Black Sheep ' + job.id }
            : { rect: { x: job.x - radius, y: job.y - radius, w: radius * 2, h: radius * 2 }, label: 'Black Sheep ' + job.id };
        return ctx.residency.emissionRegionReady(regionKey(job), spec, particles, !entity?.exists || entity.isLive);
    }
    function remove(job: any): void {
        const entity = job.entityId ? talus.entities.get(job.entityId) : null;
        if (entity?.exists)
            entity.despawn();
        ctx.residency.releaseEmissionRegion(regionKey(job));
        const s = state();
        if (s)
            s.sheep = s.sheep.filter((row: any) => row.id !== job.id);
    }
    function spawn(job: any): void {
        if (pending.has(job))
            return;
        const token = generation, match = current();
        pending.add(job);
        job.spawnAttempts = (job.spawnAttempts || 0) + 1;
        barrier();
        void (async () => {
            try {
                const entity = await talus.entities.spawn(catalog.sheep.template, job.x, job.y);
                if (token !== generation || current() !== match) {
                    if (entity?.exists)
                        entity.despawn();
                    return;
                }
                if (!entity) {
                    retry(job);
                    return;
                }
                job.entityId = entity.id;
                job.mode = 'running';
                entity.blackboard.set('custom.originalShooter', job.source);
                ctx.session.persist();
            }
            catch (error) {
                if (token === generation && current() === match)
                    retry(job, String(error));
            }
            finally {
                pending.delete(job);
                barrier();
            }
        })();
    }
    function retry(job: any, reason = 'Native entity spawn unavailable'): void {
        // Saving particles can temporarily defer native entity creation.
        if (job.entityId || job.spawnAttempts >= 6 || job.age >= 8) {
            remove(job);
            talus.log('Black Sheep cancelled: ' + reason);
        }
        else {
            job.retryAt = state().clock + .5;
        }
        ctx.session.persist();
    }
    function explode(job: any): boolean {
        if (!ready(job, true))
            return false;
        const fx = catalog.sheep;
        const result = talus.world.explode({ x: job.x, y: job.y, radius: fx.blastRadius, damage: fx.damage,
            damageType: 'blast', carveRadius: 0, carve: 'none', source: job.source });
        if (!result)
            throw new Error('Native Black Sheep explosion refused');
        remove(job);
        ctx.session.persist();
        // The visible smoke is finite and harmless; all damage belongs to the credited native explosion.
        talus.world.spawnParticles({ element: 'SMOKE', x: job.x, y: job.y, count: 36, vx: 0, vy: -90, spread: Math.PI * 2, speedJitter: .7 });
        return true;
    }
    function tick(dt: number): void {
        if (!catalog || !current() || ['ready', 'deploying', 'finished', 'fault'].includes(current().phase))
            return;
        const s = state(), fx = catalog.sheep, elapsed = Math.max(0, Math.min(1, Number(dt) || 0));
        s.clock += elapsed;
        s.noises = s.noises.filter((noise: any) => s.clock - noise.clock <= fx.noiseSeconds);
        for (const job of [...s.sheep]) {
            job.age += elapsed;
            if (pending.has(job))
                continue;
            if (job.mode === 'queued') {
                if (job.age >= 8) {
                    remove(job);
                    talus.log('Black Sheep cancelled: spawn area unavailable');
                    ctx.session.persist();
                }
                else if (s.clock >= (job.retryAt || 0) && ready(job))
                    spawn(job);
                continue;
            }
            const entity = talus.entities.get(job.entityId), pose = entity?.snapshot();
            if (pose && finite(pose)) {
                job.x = pose.x;
                job.y = pose.y;
            }
            if (!inside(job)) {
                remove(job);
                ctx.session.persist();
                continue;
            }
            if (job.age >= fx.fuseSeconds || !pose?.alive)
                job.mode = 'detonating';
            if (job.mode === 'detonating') {
                explode(job);
                continue;
            }
            if (!ready(job) || !entity?.isLive)
                continue;
            if (job.age >= fx.armSeconds && current().roster.some((p: any) => {
                if (p.eliminated)
                    return false;
                const target = ctx.core.entity(p)?.snapshot();
                return target?.alive && Math.hypot(target.x - job.x, target.y - job.y) <= fx.triggerRadius;
            })) {
                job.mode = 'detonating';
                explode(job);
                continue;
            }
            const noise = [...s.noises].reverse().find((at: any) => Math.hypot(at.x - job.x, at.y - job.y) <= fx.hearingRadius);
            const dx = noise ? noise.x - job.x : 0, vx = Math.abs(dx) > 8 ? Math.sign(dx) * fx.runSpeed : 0;
            job.stuck = vx && Math.abs(job.x - job.lastX) < .25 ? job.stuck + elapsed : 0;
            let vy = pose?.vy || 0;
            if (job.stuck >= fx.hopDelay && Math.abs(vy) < 5) {
                vy = -fx.hopSpeed;
                job.stuck = 0;
            }
            entity.setVelocity(vx, vy);
            job.lastX = job.x;
        }
    }
    const busy = () => pending.size > 0;
    const settling = () => busy() || !!current()?.tricksters?.sheep.length;
    function finish(): void {
        generation++;
        for (const job of [...(current()?.tricksters?.sheep || [])])
            remove(job);
        if (current()?.tricksters)
            current().tricksters.noises = [];
    }
    function stop(): void {
        generation++;
        ctx.residency.releaseEmissionRegions('trickster:');
        // Native entities and their durable state survive a script reload.
    }
    function bind(): void {
        talus.on('weapon.fire', event => {
            const at = event.entity?.position;
            if (at)
                hear(at);
        });
        talus.on('explosion', hear);
        talus.on('entity.contact', event => {
            const s = current()?.tricksters;
            if (!s || !catalog)
                return;
            const job = s.sheep.find((row: any) => row.entityId === (event.stableId || event.entity?.id));
            const other = event.otherEntityId == null ? null : talus.entities.get(event.otherEntityId);
            const player = other ? roster(other.id) : null;
            if (job && job.age >= catalog.sheep.armSeconds && player && !player.eliminated)
                job.mode = 'detonating';
        });
        talus.on('death', event => {
            const job = current()?.tricksters?.sheep.find((row: any) => row.entityId === (event.stableId || event.entity?.id));
            if (job)
                job.mode = 'detonating';
        });
    }
    return { configure, canFire, hear, impact, tick, busy, settling, finish, stop, bind };
}
export = create;
