/** Native ordnance flights and durable, independently armed battlefield hazards. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    let catalog: any = null, generation = 0, work = 0;
    function configure(data: any): void { catalog = data; }
    function state(): any {
        return ctx.state.match.ordnance ||= { serial: 0, rng: ctx.core.chaosSeed(ctx.state.match.seed + ':ordnance'), jobs: [], flights: {} };
    }
    function random(): number {
        const s = state(); let x = s.rng | 0;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        s.rng = x >>> 0;
        return s.rng / 4294967296;
    }
    function definition(kind: string): any {
        const value = catalog?.effects[kind];
        if (!value) throw new Error('Unknown ordnance: ' + kind);
        return value;
    }
    function permitted(kind: string): boolean {
        return !!catalog?.effects[kind] && (kind !== 'holy' || catalog.nativeLargeBlast === true);
    }
    function canFire(item: any): boolean {
        if (item?.behavior?.mode !== 'ordnance') return true;
        const kind = item.behavior.kind;
        if (!permitted(kind)) return false;
        return definition(kind).mode !== 'mine' || (ctx.state.match?.ordnance?.jobs || [])
            .filter((j: any) => j.kind === kind && !['done', 'cancelled'].includes(j.phase)).length < catalog.maxMines;
    }
    function label(job: any, text: string | null): void {
        talus.ui.worldText('ordnance:' + job.id, text === null ? null : { at: job.at, offset: { x: 0, y: -42 },
            text, size: 48, color: '#fff0a8', outline: '#10102a', background: '#10102acc', maxWidth: 160 });
    }
    function impact(kind: string, owner: string, at: Vec2): boolean {
        if (!ctx.state.match || !permitted(kind) || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return false;
        const s = state(), fx = definition(kind);
        if (fx.mode === 'mine' && s.jobs.filter((j: any) => j.kind === kind && !['done', 'cancelled'].includes(j.phase)).length >= catalog.maxMines) {
            ctx.state.match.message = 'Mine capacity reached'; return false;
        }
        const job = { id: ++s.serial, kind, owner, at: { x: at.x, y: at.y }, phase: 'queued', elapsed: 0,
            emitted: 0, bodyId: null, lastCount: null, particles: 0 };
        s.jobs.push(job);
        ctx.session.persist();
        return true;
    }
    function inside(at: Vec2): boolean {
        const b = ctx.state.match.bounds;
        return at.x >= b.x && at.x < b.x + b.w && at.y >= b.y && at.y < b.y + b.h;
    }
    function grid(id: string): any {
        const sprite = catalog.sprites[id];
        const material = (code: string): number => {
            if (code === '.') return 0;
            const element = talus.elements.get(sprite.materials[code]);
            if (!element) throw new Error('Ordnance sprite material is unavailable: ' + sprite.materials[code]);
            return element.id;
        };
        return { kind: 'grid', width: sprite.rows[0].length, height: sprite.rows.length,
            cells: sprite.rows.flatMap((row: string) => [...row].map(material)) };
    }
    function launch(job: any, at: Vec2, spec: any, payload: any = null): Projectile {
        const previous = ctx.state.launchingChaos;
        ctx.state.launchingChaos = true;
        try {
            const shot = talus.projectiles.launch({ kind: 'rigid-body', element: 'IRON', owner: job.owner,
                x: at.x, y: at.y, vx: 0, vy: 200, bodySizePx: 4, gravityScale: 1, drag: 0, lifetime: 12,
                independent: true, damageType: 'blast', carveMode: 'erase', ...spec,
                detonate: { onBody: true, onTerrain: true, atLifetime: false, ...spec.detonate, looseMatter: ctx.state.market.looseMatter } });
            if (!shot) throw new Error('Native ordnance launch refused: ' + job.kind);
            state().flights[shot.id] = { job: job.id, owner: job.owner, payload, collision: null };
            return shot;
        }
        finally { ctx.state.launchingChaos = previous; }
    }
    function run(operation: () => Promise<void>): void {
        work++;
        ctx.session.run(async () => { try { await operation(); } finally { work--; } });
        ctx.session.persist();
    }
    function current(match: any, token: number): boolean {
        return ctx.state.match === match && generation === token && match.phase !== 'fault';
    }
    function destroyBody(id: string | null): void {
        const body = id ? talus.bodies.get(id) : null;
        if (body?.exists) body.destroy();
    }
    function placeMine(job: any): void {
        job.phase = 'placing';
        const match = ctx.state.match, token = generation, x = Math.round(job.at.x), y = Math.round(job.at.y - 7);
        const box = { x: x - 16, y: y - 13, w: 33, h: 23 };
        const offsets = [{ x: 0, y: 0 }, { x: 0, y: -8 }, { x: -8, y: -8 }, { x: 8, y: -8 }];
        const xs = [0, ...offsets.map(p => p.x)], ys = [0, ...offsets.map(p => p.y)];
        // Native placement admission charges every translated job region, not only the body's pixels.
        const cells = (box.w + Math.max(...xs) - Math.min(...xs)) * (box.h + Math.max(...ys) - Math.min(...ys));
        run(async () => {
            const receipt = await talus.world.terrainWork({ kind: 'vector', shape: box, bounds: match.bounds,
                replacement: 'empty', layerPolicy: 'active-only', targetLayer: 'world', seed: ctx.core.chaosSeed(match.seed + ':mine:' + job.id),
                placement: { offsets, maxChecks: 540 },
                budget: { cells, particles: 135, work: 135 }, vector: {
                    geometry: { kind: 'line', points: [{ x: x - 4, y }, { x: x + 4, y }], width: 5 },
                    fill: { kind: 'element', element: 'IRON', color: 0x448844 },
                    output: { kind: 'body', name: 'Proximity mine ' + job.id, maxBodies: 1, friction: .9, restitution: 0 } } });
            if (!current(match, token)) {
                for (const id of receipt.bodies || []) destroyBody(id);
                return;
            }
            if (receipt.status !== 'completed' || receipt.bodies?.length !== 1) {
                job.phase = 'done'; job.reason = receipt.reason || 'no-complete-body';
                match.message = 'Mine could not settle: ' + job.reason;
            }
            else { job.bodyId = receipt.bodies[0]; job.phase = 'arming'; job.elapsed = 0; }
            ctx.session.persist();
        });
    }
    function placeHoly(job: any): void {
        if (!catalog.nativeLargeBlast) throw new Error('Holy Hand Grenade requires native 2800-pixel blast admission');
        const radius = 32, key = 'ordnance:' + job.id;
        if (!ctx.residency.emissionRegionReady(key, { rect: { x: job.at.x - radius, y: job.at.y - radius, w: radius * 2, h: radius * 2 }, label: key }, true)) return;
        job.phase = 'placing';
        const match = ctx.state.match, token = generation, shape = grid('holy'), cells: Array<{ x: number; y: number; element: number }> = [];
        for (let y = 0; y < shape.height; y++) for (let x = 0; x < shape.width; x++) {
            const element = shape.cells[y * shape.width + x];
            if (element) cells.push({ x: Math.round(job.at.x + x - shape.width / 2), y: Math.round(job.at.y + y - shape.height - 2), element });
        }
        run(async () => {
            const body = await talus.bodies.create({ cells, kind: 'dynamic', name: 'Holy Hand Grenade ' + job.id });
            if (!current(match, token)) { destroyBody(body?.id || null); return; }
            if (!body || body.snapshot()?.cells !== cells.length) {
                destroyBody(body?.id || null); throw new Error('Holy Hand Grenade requires its complete native body');
            }
            job.bodyId = body.id; job.phase = 'counting'; job.elapsed = 0;
            label(job, '1'); job.lastCount = 0;
            ctx.residency.releaseEmissionRegion(key); ctx.session.persist();
        });
    }
    function burst(job: any, at: Vec2, spec: any): void {
        const shot = launch(job, at, { vx: 0, vy: 0, ...spec });
        job.phase = 'done';
        destroyBody(job.bodyId);
        label(job, null);
        shot.detonate();
        ctx.residency.releaseEmissionRegion('ordnance:' + job.id);
        ctx.session.persist();
    }
    function tickMine(job: any, fx: any, dt: number): void {
        const body = talus.bodies.get(job.bodyId), at = body?.snapshot();
        if (!body?.exists || !at || !inside(at)) {
            destroyBody(job.bodyId); job.phase = 'done'; ctx.session.persist(); return;
        }
        if (!body.isLive) return;
        job.at = { x: at.x, y: at.y };
        if (job.phase === 'arming') {
            job.elapsed += dt;
            if (job.elapsed < fx.armSeconds) return;
            job.phase = 'armed'; ctx.session.persist();
        }
        const target = ctx.state.match.roster.some((p: any) => {
            if (p.eliminated) return false;
            const tank = ctx.core.entity(p), spot = tank?.snapshot();
            return !!tank?.isLive && spot && Math.hypot(spot.x - at.x, spot.y - at.y) <= fx.triggerRadius;
        });
        if (target) burst(job, at, fx.blast);
    }
    function tickHoly(job: any, fx: any, dt: number): void {
        const body = talus.bodies.get(job.bodyId), at = body?.snapshot();
        if (!body?.exists || !at || !inside(at)) { destroyBody(job.bodyId); label(job, null); job.phase = 'done'; return; }
        if (!body.isLive) return;
        job.elapsed += dt;
        if (job.elapsed >= fx.countSeconds) { burst(job, at, fx.blast); return; }
        const count = Math.min(2, Math.floor(job.elapsed * 3 / fx.countSeconds));
        if (count !== job.lastCount) { label(job, String(fx.count[count])); job.lastCount = count; }
    }
    function emit(job: any, fx: any): void {
        const index = job.emitted, b = ctx.state.match.bounds;
        let spec: any, at: Vec2, payload: any = null;
        if (fx.mode === 'ducks') {
            const angle = Math.PI + (.15 + random() * .7) * Math.PI;
            const speed = fx.speedMin + random() * (fx.speedMax - fx.speedMin);
            at = { x: job.at.x, y: Math.max(b.y + 10, job.at.y - 12) };
            spec = { ...fx.projectile, missileSlot: grid('duck'), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
            payload = fx.payload;
        }
        else {
            const selected = fx.mode === 'meteors' ? (random() < fx.catastropheChance ? fx.catastrophe : fx.ordinary)
                : fx.pattern[index % fx.pattern.length];
            const shot = catalog.payloads[selected];
            const jitter = fx.jitter ? (random() * 2 - 1) * fx.jitter : 0;
            const x = job.at.x + (index - (fx.count - 1) / 2) * fx.spacing + jitter;
            at = { x: ctx.core.clamp(x, b.x + 16, b.x + b.w - 16), y: Math.max(b.y + 16, job.at.y - fx.height) };
            spec = { ...shot.projectile, vx: fx.drift || 0, vy: fx.speed };
            if (shot.sprite) spec.missileSlot = grid(shot.sprite);
            payload = shot.payload || null;
        }
        launch(job, at, spec, payload);
        job.emitted++;
        if (job.emitted >= fx.count) job.phase = 'done';
        ctx.session.persist();
    }
    function tick(dt: number): void {
        if (!catalog || !ctx.state.match?.ordnance || ctx.state.match.phase === 'fault' || !(dt > 0)) return;
        const s = state();
        for (const job of s.jobs) {
            const fx = definition(job.kind);
            if (job.phase === 'queued') {
                if (fx.mode === 'mine') { placeMine(job); continue; }
                if (fx.mode === 'holy') { placeHoly(job); continue; }
                job.phase = 'emitting';
            }
            if (['arming', 'armed'].includes(job.phase)) tickMine(job, fx, dt);
            else if (job.phase === 'counting') tickHoly(job, fx, dt);
            else if (job.phase === 'emitting') {
                job.elapsed += dt;
                if (job.elapsed >= job.emitted * fx.interval) emit(job, fx);
            }
        }
        const live = new Set(Object.values(s.flights).map((f: any) => f.job));
        s.jobs = s.jobs.filter((job: any) => !['done', 'cancelled'].includes(job.phase) || live.has(job.id));
    }
    function busy(): boolean {
        const s = ctx.state.match?.ordnance;
        return work > 0 || !!s && (Object.keys(s.flights).length > 0 || s.jobs.some((j: any) => !['arming', 'armed', 'done', 'cancelled'].includes(j.phase)));
    }
    function stop(): void {
        generation++;
        const s = ctx.state.match?.ordnance;
        if (!s) return;
        for (const job of s.jobs) {
            label(job, null);
            ctx.residency.releaseEmissionRegion('ordnance:' + job.id);
            if (!['arming', 'armed'].includes(job.phase)) job.phase = 'cancelled';
        }
        const ids = Object.keys(s.flights); s.flights = {};
        for (const id of ids) {
            const shot = talus.projectiles.get(Number(id));
            if (shot?.exists) shot.remove();
        }
    }
    function finish(): void {
        stop();
        const s = ctx.state.match?.ordnance;
        if (!s) return;
        for (const job of s.jobs) destroyBody(job.bodyId);
        s.jobs = [];
    }
    function bind(): void {
        talus.on('projectile.collision', e => {
            const flight = ctx.state.match?.ordnance?.flights[e.projectileId];
            if (flight) flight.collision = e.with;
        });
        talus.on('projectile.end', e => {
            const s = ctx.state.match?.ordnance, flight = s?.flights[e.projectileId];
            if (!flight) return;
            delete s.flights[e.projectileId];
            const job = s.jobs.find((j: any) => j.id === flight.job);
            const impactAccepted = ['body', 'terrain', 'particle'].includes(flight.collision) || flight.payload?.requireImpact === false && e.reason === 'detonated';
            if (flight.payload && job && impactAccepted && !['expired', 'removed', 'out-of-bounds', 'wall', 'destroyed'].includes(e.reason)) {
                const match = ctx.state.match, token = generation, at = { x: Number(e.x), y: Number(e.y) };
                if (Number.isFinite(at.x) && Number.isFinite(at.y) && inside(at)) run(async () => {
                    const radius = flight.payload.radius, x = Math.round(at.x), y = Math.round(at.y - radius / 2), cells = 4 * radius * radius;
                    const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius }, bounds: match.bounds,
                        replacement: 'empty', targetLayer: 'world', layerPolicy: 'active-only',
                        simulationRegion: { x: x - radius - 16, y: y - radius - 16, w: radius * 2 + 32, h: radius * 2 + 128 },
                        budget: { cells, particles: cells, work: cells }, seed: ctx.core.chaosSeed(match.seed + ':ordnance:' + job.id + ':' + e.projectileId),
                        recipe: ctx.combat.materialRecipe(flight.payload.element) as TerrainRecipe, holdSeconds: 1 });
                    if (!current(match, token)) return;
                    if (receipt.status !== 'completed') throw new Error('Native ordnance material payload refused: ' + receipt.reason);
                    job.particles += receipt.added; ctx.session.persist();
                });
            }
            ctx.session.persist();
        });
    }
    return { configure, permitted, canFire, impact, tick, busy, stop, finish, bind };
}
export = create;
