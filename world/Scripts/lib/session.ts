/** Persistence, save barriers and safe menu exits. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function sequencePending(): boolean {
        return !!(ctx.state.match && (ctx.state.supplySequence || ctx.state.arcadeCard || ctx.state.match.attack || ctx.core.presenting() || ctx.state.match.chaos.jobs.length || ctx.state.launchingChaos || ctx.state.digging
            || ['deploying', 'telegraph', 'firing', 'flight', 'settling', 'focusing', 'refocusing', 'positioning', 'aftermath'].includes(ctx.state.match.phase)));
    }
    function updateExitView(): void {
        const status = talus.game.saveStatus;
        const blocked = !status.allowed || sequencePending() || ctx.state.booting;
        const waiting = ctx.state.exitDrain?.phase === 'running' || ctx.state.exitDrain?.phase === 'closing';
        const stalled = ctx.state.match?.roster[ctx.state.match.focusIndex]?.cpuStalled;
        const message = ctx.state.exitDrain?.phase === 'failed'
            ? 'The action could not finish. Your save has not been replaced. You can still quit now.'
            : waiting ? 'Finishing the current action for a save. Resume battle cancels this wait; Quit now leaves immediately.'
                : ctx.state.exitDrain?.phase === 'ready' ? 'Action complete. Your battle is paused and ready to save.'
                    : blocked ? 'Saving is unavailable while the action runs. Quit now leaves immediately without saving.'
                        : stalled ? 'CPU blocked: ' + stalled.reason + '. Resume battle retries its available actions; you can also save and leave.'
                            : 'Save & title preserves your progress. Quit now leaves immediately without saving.';
        const view = JSON.stringify({ exitBlocked: blocked, exitDraining: !!ctx.state.exitDrain, exitStatus: message,
            exitFinishLabel: waiting ? 'Resume finishing action' : 'Finish action to save' });
        if (view !== ctx.state.exitView) {
            ctx.state.exitView = view;
            talus.ui.set(JSON.parse(view));
        }
    }
    function prepareExitBoundary(): void {
        if (!ctx.state.match || ctx.state.exitDrain?.phase === 'ready')
            return;
        ctx.state.exitDrain = { phase: 'closing', elapsed: 0 };
        ctx.menus.input(false);
        updateExitView();
    }
    function resumeAfterExitPreparation(): void {
        const inhibited = !!ctx.state.exitDrain;
        ctx.state.exitDrain = null;
        talus.sim.resume();
        updateExitView();
        if (inhibited && ctx.core.active()) {
            ctx.menus.input(ctx.core.current().control === 'human');
            if (ctx.core.current().control === 'cpu')
                run(() => ctx.cpu.prepareCpuTurn(ctx.core.current(), ctx.state.match.turnNumber));
        }
    }
    function exitMenuClosed(e: {
        file: string;
        reason: string;
    }): void {
        if (e.file !== 'Menus/pause.html' || !ctx.state.exitDrain)
            return;
        if (ctx.state.exitDrain.phase === 'closing') {
            ctx.state.exitDrain.phase = 'running';
            talus.sim.resume();
        }
        else if (['back', 'close', 'script'].includes(e.reason))
            resumeAfterExitPreparation();
    }
    function tickExitPreparation(dt: number): void {
        updateExitView();
        if (ctx.state.exitDrain?.phase !== 'running')
            return;
        if (talus.sim.paused)
            return;
        ctx.state.exitDrain.elapsed += Math.max(0, dt);
        if (ctx.state.match?.phase === 'fault' || ctx.state.exitDrain.elapsed > 180) {
            ctx.state.exitDrain.phase = 'failed';
            talus.sim.pause();
            updateExitView();
            talus.ui.openMenu('Menus/pause.html');
            return;
        }
        if (!ctx.state.booted || ctx.state.booting || sequencePending() || !talus.game.saveStatus.allowed)
            return;
        ctx.state.exitDrain.phase = 'ready';
        talus.sim.pause();
        updateExitView();
        talus.ui.openMenu('Menus/pause.html');
    }
    function persist(): void {
        const pending = sequencePending();
        talus.game.setSaveBarrier('match-sequence', pending ? 'Finish deployment, volley and death effects before saving' : null);
        talus.state.setJson('indigo.match', ctx.state.match);
    }
    function saveAndReturnToTitle(): void {
        if (ctx.state.booting || sequencePending() || !talus.game.saveStatus.allowed)
            return;
        talus.game.quitToMenu({ save: 'required', destination: 'title' });
    }
    function fail(error: any): void {
        ctx.residency.releaseEmissionRegions();
        ctx.camera.holdCamera();
        const message = String(error);
        ctx.menus.input(false);
        ctx.presentation.cancelArcade();
        ctx.state.cashPopups.clear();
        if (ctx.state.match) {
            ctx.state.match.phase = 'fault';
            ctx.state.match.message = message;
            persist();
            ctx.menus.publish();
        }
        talus.state.set('indigo.error', message);
        talus.ui.banner('Match stopped', { sub: message, ms: 10000 });
    }
    function run(fn: () => Promise<void>): void { void fn().catch(fail); }
    function bind() {
        talus.on('menu.closed', exitMenuClosed);
        talus.on('menu.pause.save-title', saveAndReturnToTitle);
        talus.on('menu.custom.save-title', saveAndReturnToTitle);
    }
    return { sequencePending, updateExitView, prepareExitBoundary, resumeAfterExitPreparation, exitMenuClosed, tickExitPreparation, persist, fail, run, bind };
}
export = create;
