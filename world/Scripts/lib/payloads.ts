/** Route landed carriers into persistent creatures and finite ordnance effects. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    const modes = ['creature', 'ordnance', 'trickster'];
    const handles = (item: any): boolean => modes.includes(item?.behavior?.mode);
    function canFire(item: any): boolean {
        if (!handles(item)) return true;
        if (item.behavior.mode === 'creature') return ctx.creatures.canFire(item);
        if (item.behavior.mode === 'ordnance') return ctx.ordnance.canFire(item);
        return ctx.tricksters.canFire(item);
    }
    async function load(): Promise<void> {
        ctx.creatures.configure(JSON.parse((await talus.files.readText('Game/creatures.json'))!));
        ctx.ordnance.configure(JSON.parse((await talus.files.readText('Game/ordnance.json'))!));
        ctx.tricksters.configure(JSON.parse((await talus.files.readText('Game/tricksters.json'))!));
    }
    function queue(attack: any, entry: any, event: ProjectileEvent): void {
        const item = ctx.economy.itemById(attack.item);
        if (!handles(item) || attack.payloadQueued || event.projectileId !== attack.rootId || entry.split
            || !['body', 'terrain', 'particle'].includes(entry.collision)
            || ['removed', 'expired', 'lifetime', 'out-of-bounds', 'wall', 'destroyed'].includes(event.reason))
            return;
        attack.payloadQueued = true;
        attack.pending.push({ kind: 'payload', at: { x: event.x, y: event.y } });
    }
    async function impact(attack: any, at: Vec2): Promise<void> {
        const item = ctx.economy.itemById(attack.item), behavior = item.behavior;
        attack.tasks++;
        ctx.session.persist();
        try {
            if (behavior.mode === 'creature')
                await ctx.creatures.impact(item, attack.owner, at);
            else if (behavior.mode === 'ordnance')
                await ctx.ordnance.impact(behavior.kind, attack.owner, at);
            else if (behavior.mode === 'trickster')
                await ctx.tricksters.impact(behavior.kind, attack.owner, at);
        }
        finally {
            attack.tasks--;
            ctx.session.persist();
        }
    }
    function tick(dt: number): void {
        ctx.creatures.tick(dt);
        ctx.ordnance.tick(dt);
        ctx.tricksters.tick(dt);
    }
    function busy(): boolean {
        return ctx.creatures.busy() || ctx.ordnance.busy() || ctx.tricksters.busy();
    }
    function settling(): boolean {
        return busy() || ctx.creatures.settling() || ctx.tricksters.settling();
    }
    function stop(): void {
        for (const service of [ctx.creatures, ctx.ordnance, ctx.tricksters]) {
            try { service.stop(); }
            catch (error) { talus.log('Payload cleanup failed: ' + String(error)); }
        }
    }
    function finished(): void {
        ctx.creatures.finish();
        ctx.ordnance.finish();
        ctx.tricksters.finish();
    }
    function bind(): void {
        ctx.creatures.bind();
        ctx.ordnance.bind();
        ctx.tricksters.bind();
    }
    return { handles, canFire, load, queue, impact, tick, busy, settling, stop, finished, bind };
}
export = create;
