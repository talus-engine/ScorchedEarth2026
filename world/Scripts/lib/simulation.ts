/** Pin the battlefield independently of camera motion and observe native readiness. */
import type { Runtime } from 'context';
type Policy = {
    startRing: Rect;
    startElectrical: Rect;
    startCameraFrame: CameraFrameSpec;
    engineBudgets: { chunkPoolLayers: number; particleSlots: number };
};
function create(ctx: Runtime) {
    let policy: Policy | null = null, waiting = false, overBudget = false, budgetSeconds = 0, shortfallSeconds = 0;
    function notice(text: string): void { talus.ui.set('simulationNotice', text); }
    async function load(): Promise<void> {
        policy = JSON.parse((await talus.files.readText('Game/input.json'))!);
    }
    async function prepare(): Promise<void> {
        if (!policy) throw new Error('Battlefield simulation settings are missing');
        const b = ctx.state.match.bounds, r = policy.startRing;
        if (b.x < r.x || b.y < r.y || b.x + b.w > r.x + r.w || b.y + b.h > r.y + r.h)
            throw new Error('The active ring must contain the entire battlefield');
        const status = talus.sim.setRing(r, { electrical: policy.startElectrical });
        overBudget = status.overBudget;
        if (status.arena?.wallsOutside.length)
            throw new Error('Arena walls lie outside the active ring: ' + status.problems.join('; '));
        if (status.budget.particles < policy.engineBudgets.particleSlots)
            throw new Error('Reopen the project to apply its battlefield memory settings');
        talus.camera.frame(policy.startCameraFrame);
        budgetSeconds = 0;
        waiting = true;
        try {
            const limit = ctx.state.arena.simulation.loadTimeoutTicks;
            for (let waited = 0; waited < limit; waited += 60) {
                const s = talus.sim.ring;
                notice('Preparing battlefield · ' + s.ready + ' / ' + s.chunks
                    + (s.overBudget ? ' · waiting for simulation memory' : ''));
                if (await talus.sim.whenRingLoaded({ timeoutTicks: Math.min(60, limit - waited) })) {
                    const ready = talus.sim.ring;
                    if (ready.arena?.wallsOutside.length)
                        throw new Error('Arena walls lie outside the active ring: ' + ready.problems.join('; '));
                    return;
                }
                if (ctx.state.match.phase === 'fault') throw new Error('Battlefield preparation stopped');
            }
            const s = talus.sim.ring;
            throw new Error(s.overBudget
                ? 'Battlefield exceeds its simulation memory budget; increase Engine Budgets and reopen the project'
                : 'Battlefield loading timed out: ' + s.ready + ' / ' + s.chunks + ' chunks ready');
        }
        finally { waiting = false; notice(''); }
    }
    function tick(dt: number): void {
        if (waiting || !ctx.state.booted || ctx.state.booting || !ctx.state.match || ctx.state.match.phase === 'fault') return;
        if (overBudget) {
            if (!talus.sim.paused) budgetSeconds += Math.max(0, dt);
            if (budgetSeconds >= ctx.state.arena.simulation.budgetTimeoutSeconds)
                ctx.session.fail(new Error('Battlefield simulation memory is full; increase Engine Budgets and reopen the project'));
        }
        else {
            if (budgetSeconds > 0) notice('');
            budgetSeconds = 0;
            if (shortfallSeconds > 0) {
                shortfallSeconds = Math.max(0, shortfallSeconds - Math.max(0, dt));
                if (shortfallSeconds === 0) notice('');
            }
        }
    }
    function bind(): void {
        talus.on('sim.ring-budget', e => {
            overBudget = e.overBudget;
            if (!overBudget) budgetSeconds = 0;
            if (!waiting && ctx.state.match)
                notice(overBudget ? 'Battlefield memory busy · ' + e.awaitingLayers + ' chunks waiting' : '');
        });
        talus.on('tick.frame', e => {
            try { tick(Number(e.dt) || 0); }
            catch (error) { ctx.session.fail(error); }
        });
        talus.on('world.spawn-shortfall', e => {
            if (!ctx.state.match) return;
            talus.log('Particle placement shortfall: ' + e.placed + '/' + e.requested + ' at ' + e.x + ',' + e.y + ' (' + e.reason + ')');
            shortfallSeconds = 5;
            notice('Effect partially placed · ' + e.placed + ' / ' + e.requested);
        });
    }
    return { load, prepare, tick, bind };
}
export = create;
