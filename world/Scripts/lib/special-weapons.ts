/** Bounded aim estimates for native cutting shots that have no ballistic forecast. */
type Point = { x: number; y: number };
type ShotEstimate = { angle: number; power: number; point: Point; repeated: boolean; reason: string; guidance?: string | null };
type EstimateContext = {
    arena: any;
    obstruction?: RaycastHit | null;
    targetId: string;
    best?: { angle: number; power: number; direct?: boolean; guidance?: string | null } | null;
};

function supported(item: any): boolean {
    const s = item?.projectile;
    return !!(item?.enabled && item.kind === 'weapon' && s && Number.isFinite(s.speed) && s.speed > 0
        && Number.isFinite(s.lifetime) && s.lifetime > 0 && s.speedAtMinPower === s.speed
        && s.gravityScale === 0 && !s.homing
        && (item.id === 'laser' && s.kind === 'particle' && s.caImpact
            || s.kind === 'rigid-body' && s.excavation));
}

function flightReach(spec: any): number {
    const lifetime = spec.lifetime > 0 ? spec.lifetime * spec.speed : Infinity;
    const range = spec.range > 0 ? spec.range : Infinity;
    const travel = spec.excavation?.distance ?? Infinity;
    const fuse = spec.detonate?.fuse > 0 ? spec.detonate.fuse * spec.speed : Infinity;
    const root = Math.min(lifetime, range, travel, fuse);
    const children: any[] = spec.triggerChild || [];
    return root + (children.length ? Math.max(...children.map(child => flightReach(child))) : 0);
}

function candidate(item: any, origin: Point, target: Point, context: EstimateContext): ShotEstimate | null {
    if (!supported(item) || ![origin.x, origin.y, target.x, target.y].every(Number.isFinite))
        return null;
    const s = item.projectile, arena = context.arena, bounds = arena.bounds;
    const floor = bounds.y + arena.terrain.solidBottomTileRow * arena.tiles.chunksPerTile * 64;
    const margin = s.excavation ? s.excavation.radius + (s.excavation.noise?.width || 0) : 2;
    for (const at of [origin, target])
        if (at.x < bounds.x + margin || at.x >= bounds.x + bounds.w - margin
            || at.y < bounds.y + margin || at.y >= floor - margin)
            return null;
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y), muzzle = s.spawnOffset || 0;
    const children: any[] = s.triggerChild || [];
    const blast = Math.max(s.aoeRadius || 0, ...children.map(child => child.aoeRadius || 0));
    if (distance < muzzle + blast + 24 || distance - muzzle > flightReach(s) * .9)
        return null;
    const hit = context.obstruction;
    if (hit && hit.entity?.id !== context.targetId) {
        if (hit.body || hit.entity)
            return null;
        if (s.excavation && hit.element && !s.excavation.materials.some((m: any) =>
            m.element === hit.element!.id || m.element === hit.element!.name))
            return null;
    }
    const best = context.best;
    const repeated = !!(best?.direct && Number.isFinite(best.angle) && Number.isFinite(best.power));
    return {
        angle: repeated ? best!.angle : Math.atan2(target.y - origin.y, target.x - origin.x),
        power: repeated ? Math.max(.01, Math.min(1, best!.power)) : 1,
        point: { ...target }, repeated,
        ...(repeated ? { guidance: best!.guidance || null } : {}),
        reason: repeated ? 'Repeat measured direct hit; native fields remain uncertain'
            : s.excavation ? 'Exploratory cutting route; native material and work limits apply'
                : 'Direct cutting pulses; moving air and material contact remain uncertain',
    };
}

export = { supported, flightReach, candidate };
