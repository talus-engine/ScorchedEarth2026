/** Persistent native creatures, driven by physics and real contact events. */
import type { Runtime } from 'context';
type Kind = 'worm' | 'crow';
type Creature = {
    id: number; kind: Kind; entityId: string | null; owner: string; rng: number;
    mode: 'spawning' | 'roaming' | 'attacking' | 'exiting' | 'done';
    heading: number; remaining: number; turns: number; checkedTurn: number;
    target: string | null; hitAt: Record<string, number>; waypoint: Vec2 | null; retryAt: number; exitRemaining: number;
    reason?: string; work?: number;
};
function create(ctx: Runtime) {
    let catalog: any = null, generation = 0, stopped = false;
    const pending = new Set<Creature>();
    function configure(value: any): void { catalog = value; stopped = false; }
    function state(): { serial: number; items: Creature[] } {
        return ctx.state.match.creatures ||= { serial: 0, items: [] };
    }
    function random(c: Creature): number {
        let x = c.rng;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        c.rng = x >>> 0;
        return c.rng / 4294967296;
    }
    function actor(c: Creature): Entity | null { return c.entityId ? talus.entities.get(c.entityId) : null; }
    function busy(): boolean { return pending.size > 0; }
    function settling(): boolean {
        return !!ctx.state.match?.creatures?.items.some((c: Creature) => c.kind === 'crow' && c.mode === 'attacking' && c.remaining > 0);
    }
    function handles(item: any): boolean {
        return item?.behavior?.mode === 'creature' && ['worm', 'crow'].includes(item.behavior.creature);
    }
    function canFire(item: any): boolean {
        if (!handles(item)) return true;
        const kind = item.behavior.creature, spec = catalog?.[kind];
        if (!spec?.template || stopped || !ctx.state.match || ctx.state.exitDrain) return false;
        const active = (ctx.state.match.creatures?.items || []).filter((c: Creature) => c.mode !== 'done');
        return active.length < catalog.maxActive && active.filter((c: Creature) => c.kind === kind).length < spec.maxActive;
    }
    function halt(e: Entity | null): void { if (e?.can('setVelocity')) e.setVelocity(0, 0); }
    function release(c: Creature): void { ctx.residency.releaseEmissionRegion('creature:' + c.id); }
    function remove(c: Creature, reason: string): void {
        const e = actor(c);
        if (e?.exists) e.despawn();
        c.mode = 'done'; c.reason = reason; c.waypoint = null;
        release(c);
    }
    function stop(): void {
        stopped = true; generation++;
        for (const c of ctx.state.match?.creatures?.items || []) {
            try { halt(actor(c)); }
            catch (error) { talus.log('Creature stop: ' + String(error)); }
            release(c);
        }
    }
    function finish(): void {
        stop();
        for (const c of ctx.state.match?.creatures?.items || []) remove(c, 'match-finished');
    }
    function groundBounds(): Rect {
        const b = ctx.state.match.bounds, a = ctx.state.arena;
        return { ...b, h: Math.min(b.h, a.terrain.solidBottomTileRow * a.tiles.chunksPerTile * 64) };
    }
    function outside(c: Creature, at: Vec2): boolean {
        const view = talus.camera.view.viewport, extent = catalog[c.kind].length;
        return at.x + extent < view.x || at.x - extent > view.x + view.w || at.y + extent < view.y || at.y - extent > view.y + view.h;
    }
    function exit(c: Creature, at: Vec2): void {
        c.mode = 'exiting'; c.waypoint = null; c.exitRemaining = catalog[c.kind].exitSeconds;
        const view = talus.camera.view.viewport;
        c.heading = c.kind === 'crow' ? -Math.PI / 2 + (random(c) - .5) * .9
            : at.x < view.x + view.w / 2 ? Math.PI : 0;
    }
    function chooseTarget(c: Creature, at: Vec2): Entity | null {
        const choices = ctx.state.match.roster.filter((p: any) => !p.eliminated)
            .map((p: any) => ctx.core.entity(p)).filter((e: Entity | null) => e?.exists && e.alive && e.position)
            .sort((a: Entity, b: Entity) => Math.hypot(a.position!.x - at.x, a.position!.y - at.y)
                - Math.hypot(b.position!.x - at.x, b.position!.y - at.y) || a.id.localeCompare(b.id));
        c.target = choices[0]?.id || null;
        return choices[0] || null;
    }
    async function clear(c: Creature, from: Vec2, to: Vec2): Promise<TerrainWorkReceipt> {
        const spec = catalog.worm, radius = spec.clearanceWidth / 2 + spec.edgeWidth + 2;
        const cells = Math.ceil(Math.abs(to.x - from.x) + radius * 2) * Math.ceil(Math.abs(to.y - from.y) + radius * 2);
        const materials = spec.materials.map((name: string) => {
            const material = talus.elements.get(name);
            if (!material) throw Error('Missing creature excavation material: ' + name);
            return { element: material.id, hardness: 1 };
        });
        // Protected geometry stays in place; native collision decides where the head can move.
        return talus.world.terrainWork({ kind: 'excavate',
            shape: { kind: 'polyline', points: [from, to], width: spec.clearanceWidth },
            excavation: { output: 'EMPTY', clearance: 'solid', edge: { seed: c.rng, algorithm: 'simplex', frequency: .09, width: spec.edgeWidth } },
            replacement: 'matching', materials, bounds: groundBounds(),
            budget: { cells, particles: cells, work: cells }, seed: c.rng,
            admissionTimeoutSeconds: spec.admissionSeconds, holdSeconds: 0 });
    }
    async function spawn(kind: Kind, owner: string, impact: Vec2): Promise<{ status: string; reason?: string; entityId?: string }> {
        if (!catalog?.[kind] || stopped || !ctx.state.match || ctx.state.exitDrain)
            return { status: 'refused', reason: 'inactive' };
        const match = ctx.state.match, s = state(), spec = catalog[kind], active = s.items.filter(c => c.mode !== 'done');
        if (active.length >= catalog.maxActive || active.filter(c => c.kind === kind).length >= spec.maxActive)
            return { status: 'refused', reason: 'creature-limit' };
        const id = ++s.serial, token = generation;
        const c: Creature = { id, kind, owner, entityId: null, rng: ctx.core.chaosSeed(match.seed + ':creature:' + id),
            mode: 'spawning', heading: 0, remaining: 0, turns: 0, checkedTurn: match.turnNumber, target: null, hitAt: {}, waypoint: null, retryAt: 0, exitRemaining: 0 };
        s.items.push(c); pending.add(c); ctx.session.persist();
        try {
            const b = groundBounds(), margin = kind === 'worm' ? spec.clearanceWidth / 2 + spec.edgeWidth + 2 : 16;
            const at = { x: ctx.core.clamp(impact.x, b.x + (kind === 'worm' ? spec.length : margin), b.x + b.w - margin),
                y: ctx.core.clamp(impact.y - margin, b.y + margin, b.y + b.h - margin - 1) };
            if (kind === 'worm') {
                const receipt = await clear(c, { x: at.x - spec.length + 16, y: at.y }, at);
                if (receipt.status !== 'completed') {
                    c.mode = 'done'; c.reason = receipt.reason;
                    return { status: receipt.status, reason: receipt.reason };
                }
                c.work = receipt.work;
            }
            if (stopped || token !== generation || ctx.state.match !== match) return { status: 'cancelled' };
            const e = await talus.entities.spawn(spec.template, at);
            if (!e) { c.mode = 'done'; c.reason = 'native-spawn-refused'; return { status: 'refused', reason: c.reason }; }
            if (stopped || token !== generation || ctx.state.match !== match) {
                if (e.exists) e.despawn();
                return { status: 'cancelled' };
            }
            if (!e.persistent) { e.despawn(); throw Error('Creature requires a durable native entity'); }
            c.entityId = e.id;
            c.mode = kind === 'worm' ? 'roaming' : 'attacking';
            c.remaining = kind === 'worm' ? spec.turnSeconds : spec.attackSeconds;
            c.turns = kind === 'worm' ? spec.minTurns + Math.floor(random(c) * (spec.maxTurns - spec.minTurns + 1)) : 0;
            if (kind === 'crow') chooseTarget(c, at);
            return { status: 'spawned', entityId: e.id };
        }
        finally {
            if (!c.entityId) c.mode = 'done';
            pending.delete(c);
            if (ctx.state.match === match) ctx.session.persist();
        }
    }
    function impact(item: any, owner: string, at: Vec2) { return spawn(item.behavior.creature, owner, at); }
    function onTurn(): void {
        if (!catalog || stopped || !ctx.state.match?.creatures) return;
        for (const c of state().items) {
            if (c.kind !== 'worm' || c.mode !== 'roaming' || c.checkedTurn === ctx.state.match.turnNumber) continue;
            c.checkedTurn = ctx.state.match.turnNumber;
            c.turns--;
            const at = actor(c)?.position;
            if (!at) continue;
            if (c.turns <= 0) exit(c, at);
            else { c.heading += (random(c) - .5) * Math.PI * 1.5; c.remaining = catalog.worm.turnSeconds; c.waypoint = null; halt(actor(c)); }
        }
        ctx.session.persist();
    }
    function propel(e: Entity, target: Vec2, spec: any): void {
        const at = e.position!, v = e.velocity || { x: 0, y: 0 }, distance = Math.hypot(target.x - at.x, target.y - at.y);
        if (!distance || !e.can('applyForce')) return;
        const speed = Math.min(spec.speed, distance * 8);
        e.applyForce(ctx.core.clamp(((target.x - at.x) / distance * speed - v.x) * spec.driveForce, -spec.forceLimit, spec.forceLimit),
            ctx.core.clamp(((target.y - at.y) / distance * speed - v.y) * spec.driveForce, -spec.forceLimit, spec.forceLimit));
    }
    function prepareStep(c: Creature, e: Entity): void {
        const spec = catalog.worm, from = e.position!, b = groundBounds(), margin = spec.clearanceWidth / 2 + spec.edgeWidth + 2;
        let to = { x: from.x + Math.cos(c.heading) * spec.stepPixels, y: from.y + Math.sin(c.heading) * spec.stepPixels };
        if (to.x < b.x + margin || to.x > b.x + b.w - margin || to.y < b.y + margin || to.y > b.y + b.h - margin) {
            if (c.mode === 'exiting') { c.waypoint = to; return; }
            c.heading = Math.atan2(b.y + b.h / 2 - from.y, b.x + b.w / 2 - from.x);
            to = { x: from.x + Math.cos(c.heading) * spec.stepPixels, y: from.y + Math.sin(c.heading) * spec.stepPixels };
        }
        halt(e);
        const hold = e.controller.holdPose(10);
        if (!hold.accepted) { c.reason = 'pose-hold-' + hold.reason; c.retryAt = talus.sim.clock + 1; return; }
        const token = generation, match = ctx.state.match, turn = c.checkedTurn, mode = c.mode;
        pending.add(c); ctx.session.persist();
        ctx.session.run(async () => {
            let failed = false;
            try {
                const receipt = await clear(c, from, to);
                if (stopped || token !== generation || ctx.state.match !== match || !actor(c)?.exists || c.mode !== mode || c.checkedTurn !== turn) return;
                if (receipt.status === 'completed') { c.waypoint = to; c.work = (c.work || 0) + receipt.work; }
                else { c.reason = receipt.reason; c.heading += Math.PI / 2 + random(c); c.remaining = 0; c.retryAt = talus.sim.clock + 1; }
            }
            catch (error) { failed = true; throw error; }
            finally {
                try {
                    if (e.can('controller')) {
                        const freed = e.controller.holdPose(0);
                        if (!freed.accepted) throw Error('Creature pose release: ' + freed.reason);
                    }
                }
                catch (error) { if (failed) talus.log(String(error)); else throw error; }
                finally { pending.delete(c); if (ctx.state.match === match) ctx.session.persist(); }
            }
        });
    }
    function ready(c: Creature, e: Entity): boolean {
        try {
            const half = catalog[c.kind].anchorHalfExtent;
            return ctx.residency.emissionRegionReady('creature:' + c.id,
                { follow: e.id, halfWidth: half, halfHeight: half, label: 'creature-' + c.kind }, false, e.isLive);
        }
        catch (error) {
            c.reason = String(error); halt(e); release(c);
            if (c.kind === 'worm' && c.mode === 'roaming') c.remaining = 0;
            else remove(c, 'region-unavailable');
            talus.log('Creature paused: ' + c.reason);
            return false;
        }
    }
    function tick(dt: number): void {
        if (!catalog || stopped || !ctx.state.match?.creatures || talus.sim.paused) return;
        const elapsed = Math.max(0, dt);
        for (const c of state().items) {
            if (['done', 'spawning'].includes(c.mode)) continue;
            const e = actor(c), at = e?.position;
            if (!e?.exists || !at || (c.kind === 'crow' && e.alive === false)) { remove(c, 'native-destruction'); continue; }
            if (c.mode === 'exiting' && outside(c, at)) { remove(c, 'offscreen-exit'); continue; }
            if (c.mode === 'exiting') {
                c.exitRemaining -= elapsed;
                if (c.exitRemaining <= 0) { remove(c, 'exit-timeout'); continue; }
            }
            if (c.kind === 'crow') {
                if (c.mode === 'attacking') { c.remaining -= elapsed; if (c.remaining <= 0) exit(c, at); }
                if (!ready(c, e)) continue;
                let target = c.target ? talus.entities.get(c.target) : null;
                if (c.mode === 'attacking' && (!target?.exists || !target.alive)) target = chooseTarget(c, at);
                if (c.mode === 'attacking' && !target) exit(c, at);
                propel(e, c.mode === 'attacking' ? target!.position! : { x: at.x + Math.cos(c.heading) * 100, y: at.y + Math.sin(c.heading) * 100 }, catalog.crow);
            }
            else {
                if (pending.has(c)) continue;
                if (c.mode === 'roaming') {
                    if (!c.remaining) { halt(e); c.waypoint = null; release(c); continue; }
                }
                if (!ready(c, e) || talus.sim.clock < c.retryAt) continue;
                if (c.mode === 'roaming') {
                    c.remaining = Math.max(0, c.remaining - elapsed);
                    if (!c.remaining) { halt(e); c.waypoint = null; release(c); continue; }
                }
                if (c.waypoint && Math.hypot(c.waypoint.x - at.x, c.waypoint.y - at.y) <= 6) { halt(e); c.waypoint = null; }
                if (c.waypoint) propel(e, c.waypoint, catalog.worm);
                else prepareStep(c, e);
            }
        }
        state().items = state().items.filter(c => c.mode !== 'done' || pending.has(c));
    }
    function contact(event: EntityMotionEvent): void {
        if (!catalog || stopped || !ctx.state.match?.creatures || event.with !== 'body') return;
        if (typeof event.otherEntityId !== 'number' && typeof event.otherEntityId !== 'string') return;
        const first = event.entity || talus.entities.get(event.entityId);
        const other = talus.entities.get(typeof event.otherEntityId === 'string' && /^\d+$/.test(event.otherEntityId) ? +event.otherEntityId : event.otherEntityId);
        if (!first || !other) return;
        const c = state().items.find(c => c.entityId === first.id || c.entityId === other.id);
        if (!c || !['roaming', 'attacking', 'exiting'].includes(c.mode)) return;
        const victim = c.entityId === first.id ? other : first;
        if (!victim.alive || !ctx.state.match.roster.some((p: any) => p.entityId === victim.id && !p.eliminated)) return;
        if (c.kind === 'worm') victim.kill(c.owner);
        else if (c.mode === 'attacking' && victim.id === c.target && (c.hitAt[victim.id] ?? -Infinity) + catalog.crow.hitCooldown <= talus.sim.clock) {
            c.hitAt[victim.id] = talus.sim.clock;
            victim.damage(catalog.crow.damage, { type: 'kinetic', source: c.owner });
        }
    }
    function bind(): void { talus.on('entity.contact', contact); }
    return { configure, handles, canFire, impact, spawn, tick, onTurn, bind, busy, settling, stop, finish };
}
export = create;
