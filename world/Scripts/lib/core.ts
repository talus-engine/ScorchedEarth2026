/** Shared game predicates and deterministic random seeds. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    const entity = (p: any): Entity => talus.entities.get(p.entityId)!;
    const current = (): any => ctx.state.match.roster[ctx.state.match.focusIndex];
    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
    const presenting = (): boolean => !!ctx.state.match?.presentation.active || !!ctx.state.match?.presentation.queue.length;
    const active = (): boolean => ctx.state.booted && !ctx.state.booting && !ctx.state.exitDrain && ctx.state.match?.phase === 'turn' && !current().cpuStalled && !presenting();
    const human = (): boolean => active() && current().control === 'human';
    function chaosSeed(seed: string): number {
        let h = 2166136261;
        for (let i = 0; i < seed.length; i++)
            h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
        return h >>> 0 || 1;
    }
    return { entity, current, clamp, presenting, active, human, chaosSeed };
}
export = create;
