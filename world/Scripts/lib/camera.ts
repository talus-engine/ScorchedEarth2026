/** Smooth native tracking of tanks, projectiles and presentation points. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    // Canvas pixels per world pixel: one-to-one between turns, double-size close-ups.
    const wideZoom = 1, closeZoom = 2;
    let flight: { id: number; launch: Vec2 & { vy: number }; apexY: number; previous: ProjectileSnapshot;
        gravity: number; probeAge: number; impact: Vec2 | null } | null = null;
    const ease = (value: number): number => {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
    };
    function flightZoom(s: ProjectileSnapshot): number {
        const attack = ctx.state.match.attack;
        if (flight?.id !== s.id) {
            const launch = attack?.ids[s.id]?.launch || s;
            flight = { id: s.id, launch, apexY: Math.min(launch.y, s.y), previous: s,
                gravity: 0, probeAge: -Infinity, impact: null };
        }
        const f = flight, elapsed = s.age - f.previous.age;
        if (elapsed > 0) {
            f.gravity = Math.max(0, Math.min(4000, (s.vy - f.previous.vy) / elapsed));
            f.previous = s;
        }
        f.apexY = Math.min(f.apexY, s.y);
        const destination = attack?.solution?.predicted || attack?.targetAtLaunch || f.launch;
        const speed = Math.hypot(s.vx, s.vy);
        // Short resident-terrain observations anticipate walls without planning or loading distant terrain.
        if (s.age - f.probeAge >= .1) {
            f.probeAge = s.age;
            f.impact = null;
            const horizon = Math.min(.75, 512 / Math.max(1, speed));
            let from: Vec2 = s;
            for (let step = 1; step <= 3; step++) {
                const t = horizon * step / 3;
                const to = { x: s.x + s.vx * t, y: s.y + s.vy * t + .5 * f.gravity * t * t };
                const hit = talus.world.raycast(from, to);
                if (hit) {
                    f.impact = { x: hit.x, y: hit.y };
                    break;
                }
                from = to;
            }
        }
        let close: number;
        if (f.launch.vy < -10 && s.vy < 0) {
            // A small plateau reaches the widest view before the vertical reversal.
            close = ease((Math.abs(s.vy / f.launch.vy) - .12) / .88);
        }
        else if (f.launch.vy < -10 || s.vy > 10) {
            const drop = Math.max(48, destination.y - f.apexY);
            close = ease((s.y - f.apexY) / (drop * .85));
        }
        else {
            // Flat shots have no apex: widen midway along their observed route.
            const range = Math.max(96, Math.hypot(destination.x - f.launch.x, destination.y - f.launch.y));
            const progress = Math.min(1, Math.hypot(s.x - f.launch.x, s.y - f.launch.y) / range);
            close = ease(Math.abs(2 * progress - 1));
        }
        if (f.impact) {
            const seconds = Math.hypot(f.impact.x - s.x, f.impact.y - s.y) / Math.max(1, speed);
            close = Math.max(close, ease(1 - seconds / .75));
        }
        return wideZoom + (closeZoom - wideZoom) * close;
    }
    function tickZoom(dt: number): void {
        const m = ctx.state.match;
        if (!ctx.state.booted || ctx.state.booting || !m || m.phase === 'fault' || talus.sim.paused || ctx.state.shopOpen)
            return;
        let target = wideZoom;
        if (ctx.core.presenting() || ['telegraph', 'firing', 'settling'].includes(m.phase))
            target = closeZoom;
        else if (m.phase === 'flight') {
            const shot = ctx.state.shot?.snapshot();
            if (!shot || shot.held)
                return;
            target = flightZoom(shot);
        }
        if (!m.attack)
            flight = null;
        const current = talus.camera.view.zoom;
        const step = Math.max(0, Math.min(.1, dt)) * 12;
        const zoom = Math.max(wideZoom, Math.min(closeZoom, current + Math.max(-step, Math.min(step, target - current))));
        if (Math.abs(zoom - current) > .0001 || zoom !== current && (zoom === wideZoom || zoom === closeZoom))
            talus.camera.setZoom(zoom);
    }
    function bind(): void {
        talus.on('tick.frame', e => {
            try { tickZoom(Number(e.dt) || 0); }
            catch (error) { ctx.session.fail(error); }
        });
    }
    const closeViewReady = (): boolean => Math.abs(talus.camera.view.zoom - closeZoom) < .001;
    function trackCamera(target: {
        entity: EntityLike;
    } | {
        point: Vec2;
    }, key: string): CameraTracking {
        const state = talus.camera.tracking, point = 'point' in target ? target.point : null;
        if (ctx.state.cameraIntent?.key === key && state?.id === ctx.state.cameraIntent.id && state.phase !== 'held'
            && (!point || point.x === ctx.state.cameraIntent.x && point.y === ctx.state.cameraIntent.y))
            return state;
        const next = talus.camera.track(target, { tolerance: 12, maxSpeed: 2400, smoothSeconds: .32, whilePaused: false });
        ctx.state.cameraIntent = { key, id: next.id, ...(point ? { x: point.x, y: point.y } : {}) };
        return next;
    }
    function cameraTank(p: any): CameraTracking {
        return trackCamera({ entity: p.entityId }, 'tank:' + p.entityId);
    }
    function cameraPoint(point: Vec2, key: string): CameraTracking {
        return trackCamera({ point: { x: point.x, y: point.y } }, key);
    }
    const cameraArrived = (state: CameraTracking): boolean => state.phase === 'arrived' && state.ready;
    function holdCamera(): void {
        if (ctx.state.cameraIntent)
            talus.camera.hold();
        ctx.state.cameraIntent = null;
    }
    async function focus(): Promise<boolean> {
        const p = ctx.core.current(), tank = ctx.core.entity(p);
        let preparedLiveId: number | null = null, waitingTicks = 0;
        while (waitingTicks < 1800) {
            if (p !== ctx.core.current() || p.eliminated || ctx.state.match.phase === 'fault')
                return false;
            if (!ctx.core.presenting()) {
                waitingTicks++;
                const state = cameraTank(p);
                if (tank?.isLive && cameraArrived(state)) {
                    if (preparedLiveId !== tank.liveId) {
                        ctx.equipment.syncLoadout(p);
                        preparedLiveId = tank.liveId;
                    }
                    if (ctx.combat.aim()) {
                        ctx.presentation.nameplate(p);
                        ctx.equipment.autoDefend(p);
                        return true;
                    }
                }
            }
            await talus.sleepTicks(1);
        }
        throw new Error('Camera, terrain or tank weapon did not become ready: ' + p.name);
    }
    return { trackCamera, cameraTank, cameraPoint, cameraArrived, holdCamera, focus, tickZoom, closeViewReady, bind };
}
export = create;
