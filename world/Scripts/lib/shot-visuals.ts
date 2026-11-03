/** Cosmetic gas and raster paths observed from real native projectile motion. */
import type { Runtime } from 'context';
type Palette = { color: string; gas: string };
type Settings = { palettes: Palette[]; smoke: { spacingPixels: number; widthPixels: number; particlesPerPoint: number; maxPointsPerTick: number };
    path: { layer: string; widthPixels: number; batchSeconds: number; maxSpanPixels: number; maxPending: number } };
type Trail = { projectile: Projectile; color: string; gas: string; points: Vec2[]; last: Vec2; age: number; flushedAt: number; distance: number };
function create(ctx: Runtime) {
    let settings: Settings | null = null, writing = false, warned = false, pathReady = false;
    const trails = new Map<number, Trail>(), pending: TerrainWorkSpec[] = [];
    let rotation = 0;
    const packed = (hex: string): number => (parseInt(hex.slice(1, 3), 16) | parseInt(hex.slice(3, 5), 16) << 8
        | parseInt(hex.slice(5, 7), 16) << 16) >>> 0;
    function report(error: unknown): void {
        if (!warned) talus.log('Shot visuals: ' + String(error));
        warned = true;
    }
    async function load(): Promise<void> {
        try {
            const value = JSON.parse((await talus.files.readText('Game/shot-trails.json'))!) as Settings;
            pathReady = talus.layers.get(value.path.layer)?.type === 'raster';
            if (!pathReady) report('Shot paths raster layer is unavailable in this game.');
            for (const p of value.palettes)
                if (!talus.elements.get(p.gas)) { report('Missing shot material: ' + p.gas); p.gas = ''; }
            settings = value;
        }
        catch (error) { report(error); }
    }
    function barrier(): void {
        talus.game.setSaveBarrier('scorched-earth:shot-paths', writing || pending.length ? 'Finishing shot-path raster strokes' : null);
    }
    async function drain(): Promise<void> {
        if (writing || !pending.length || talus.sim.paused) return;
        writing = true; barrier();
        const job = pending.shift()!;
        try {
            const receipt = await talus.world.terrainWork(job);
            if (receipt.status !== 'completed') report('Raster stroke ' + receipt.status + ': ' + receipt.reason);
        }
        catch (error) { report(error); }
        finally { writing = false; barrier(); }
    }
    function flush(trail: Trail): void {
        if (!settings || trail.points.length < 2) return;
        const points = trail.points, width = settings.path.widthPixels;
        trail.points = [{ ...points[points.length - 1] }]; trail.flushedAt = trail.age;
        if (!pathReady) return;
        const xs = points.map(p => p.x), ys = points.map(p => p.y), pad = Math.ceil(width / 2) + 1;
        const x = Math.floor(Math.min(...xs)) - pad, y = Math.floor(Math.min(...ys)) - pad;
        const area = { x, y, w: Math.ceil(Math.max(...xs)) + pad - x + 1, h: Math.ceil(Math.max(...ys)) + pad - y + 1 };
        if (pending.length >= settings.path.maxPending) { report('Raster stroke queue is full'); return; }
        pending.push({ kind: 'vector', vector: { geometry: { kind: 'line', points, width },
            fill: { kind: 'element', element: 'IRON', color: packed(trail.color) }, output: { kind: 'raster', layer: { name: settings.path.layer } } },
            shape: area, bounds: area, replacement: 'empty', seed: 1,
            budget: { cells: area.w * area.h, particles: 0, pixels: area.w * area.h, work: area.w * area.h },
            holdSeconds: 0 });
        barrier();
    }
    function append(trail: Trail, at: Vec2, smokePoints = 0): void {
        if (!settings || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
        const distance = Math.hypot(at.x - trail.last.x, at.y - trail.last.y);
        if (distance < .5) return;
        // Native snapshots are observations only. Split long segments into bounded raster jobs.
        const from = trail.last, pieces = Math.max(1, Math.ceil(distance / (settings.path.maxSpanPixels / 2)));
        // Observe a swept segment, then leave loose gas behind it. Never alter the shot's body,
        // material, velocity, lifetime, damage, or native emitter configuration.
        const samples = trail.gas ? Math.min(smokePoints, Math.ceil(distance / settings.smoke.spacingPixels)) : 0;
        for (let i = 1; i <= samples; i++) {
            const t = i / samples, phase = trail.distance + distance * t;
            const offset = Math.sin(phase * 1.7) * settings.smoke.widthPixels / 2;
            try {
                talus.world.spawnParticles({ element: trail.gas,
                    x: from.x + (at.x - from.x) * t - (at.y - from.y) / distance * offset,
                    y: from.y + (at.y - from.y) * t + (at.x - from.x) / distance * offset,
                    count: settings.smoke.particlesPerPoint, vx: 0, vy: -3, spread: Math.PI, speedJitter: .8 });
            }
            catch (error) { report(error); break; }
        }
        for (let i = 1; i <= pieces; i++) {
            const next = { x: from.x + (at.x - from.x) * i / pieces, y: from.y + (at.y - from.y) * i / pieces };
            const span = [...trail.points, next];
            if (Math.max(...span.map(p => p.x)) - Math.min(...span.map(p => p.x)) > settings.path.maxSpanPixels
                || Math.max(...span.map(p => p.y)) - Math.min(...span.map(p => p.y)) > settings.path.maxSpanPixels
                || trail.points.length >= 120) flush(trail);
            trail.points.push(next);
        }
        trail.last = { ...at };
        trail.distance += distance;
    }
    function track(e: ProjectileEvent): void {
        if (!settings) return;
        const p = ctx.state.match?.roster.find((p: any) => p.entityId === (e.owner?.id || e.ownerEntityId));
        // Some native launch callbacks precede the projectile's first queryable snapshot.
        const s = e.projectile.snapshot() ?? { x: Number(e.x), y: Number(e.y), age: 0 };
        if (!p || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
        const colors = settings.palettes.find(row => row.color.toUpperCase() === p.color.toUpperCase());
        if (!colors) { report('Missing tank smoke palette: ' + p.color); return; }
        trails.set(e.projectileId, { projectile: e.projectile, color: p.color, gas: colors.gas, points: [{ x: s.x, y: s.y }],
            last: { x: s.x, y: s.y }, age: s.age, flushedAt: s.age, distance: 0 });
    }
    function tick(): void {
        if (!settings || talus.sim.paused) return;
        const shots = [...trails], count = shots.length, budget = settings.smoke.maxPointsPerTick;
        // Rotate the first owner through large volleys so the shared cosmetic budget is fair.
        for (let n = 0; n < count; n++) {
            const [id, trail] = shots[(n + rotation) % count];
            const s = trail.projectile.snapshot();
            if (!s) { flush(trail); trails.delete(id); continue; }
            if (s.held || s.age <= trail.age) continue;
            trail.age = s.age;
            append(trail, s, Math.floor(budget / count) + (n < budget % count ? 1 : 0));
            if (trail.age - trail.flushedAt >= settings.path.batchSeconds) flush(trail);
        }
        if (count) rotation = (rotation + 1) % count;
        void drain();
    }
    function bind(): void {
        talus.on('projectile.launch', track);
        talus.on('projectile.end', e => {
            const trail = trails.get(e.projectileId);
            if (trail) { append(trail, { x: Number(e.x), y: Number(e.y) }); flush(trail); trails.delete(e.projectileId); }
        });
        talus.on('tick.sim.post', tick);
    }
    return { load, bind };
}
export = create;
