/** Shared physical ending after a tank's selected death effect. */
import type { Runtime } from 'context';
async function release(ctx: Runtime, job: any, random: () => number): Promise<void> {
    const match = ctx.state.match;
    const current = () => ctx.state.match === match && match.phase !== 'fault' && match.chaos.jobs.includes(job);
    const corpse = talus.entities.get(job.owner);
    const spec = ctx.state.chaosCatalog.wreckage;
    if (!corpse?.exists) {
        job.partsResult = { status: 'consumed', reason: 'No surviving solid hull', released: 0 };
    }
    else {
        const result = await corpse.releaseParts({ maxMembers: 16384, maxParts: 32, waitSeconds: 5 });
        if (!current())
            return;
        job.partsResult = { status: result.status, reason: result.reason, released: result.released,
            ids: result.parts.map(part => part.id) };
        if (result.status === 'completed') {
            // Native release ends articulation and excludes only this wreck's siblings from collision.
            ctx.state.deathPoseHolds.delete(job.owner);
            const center = result.center || job;
            job.x = center.x;
            job.y = center.y;
            for (const part of result.parts) {
                const angle = Math.atan2(part.center.y - center.y, part.center.x - center.x) + (random() - .5) * Math.PI;
                const impulse = part.members * (spec.impulseMin + random() * (spec.impulseMax - spec.impulseMin));
                if (part.body.can('applyImpulse'))
                    part.body.applyImpulse(Math.cos(angle) * impulse, (Math.sin(angle) - .65) * impulse);
            }
        }
        else
            talus.log('Wreck parts ' + job.name + ': ' + result.status + ' / ' + result.reason);
    }
    if (!current())
        return;
    const x = Math.round(job.x), y = Math.round(job.y), radius = spec.dynamiteRadius;
    const bounds = { x: x - radius - 1, y: y - radius - 1, w: radius * 2 + 2, h: radius * 2 + 2 };
    const cells = bounds.w * bounds.h;
    const charge = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius }, bounds,
        replacement: 'empty', budget: { cells, particles: cells, work: cells }, holdSeconds: .1,
        recipe: ctx.combat.materialRecipe('DYNAMITE') as TerrainRecipe,
        seed: ctx.core.chaosSeed(match.seed + ':wreck-charge:' + job.id) });
    if (!current())
        return;
    job.wreckCharge = { status: charge.status, added: charge.added, reason: charge.reason };
    if (charge.status !== 'completed') {
        talus.log('Wreck charge ' + job.name + ': ' + charge.reason);
        return;
    }
    const fire = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius: spec.ignitionRadius }, bounds,
        replacement: 'matching', materials: [{ element: talus.elements.get('DYNAMITE')!.id, hardness: 1 }],
        budget: { cells, particles: cells, work: cells }, holdSeconds: .1,
        recipe: ctx.combat.materialRecipe('FIRE') as TerrainRecipe,
        seed: ctx.core.chaosSeed(match.seed + ':wreck-fire:' + job.id) });
    if (current())
        job.wreckFire = { status: fire.status, added: fire.added, reason: fire.reason };
}
export = release;
