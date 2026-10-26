/** Smooth native tracking of tanks, projectiles and presentation points. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
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
    return { trackCamera, cameraTank, cameraPoint, cameraArrived, holdCamera, focus };
}
export = create;
