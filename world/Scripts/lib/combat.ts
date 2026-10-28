/** Weapon firing, projectile children and material payloads. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function aim(): boolean {
        const e = ctx.core.entity(ctx.core.current());
        return !!e?.isLive && e.weapon.aim(-Number(e.blackboard.get('custom.angle')) * Math.PI / 180, Number(e.blackboard.get('custom.power')) / 100);
    }
    function adjust(angle: number, power: number): void {
        if (!ctx.core.human())
            return;
        const e = ctx.core.entity(ctx.core.current());
        const oldAngle = Number(e.blackboard.get('custom.angle')), oldPower = Number(e.blackboard.get('custom.power'));
        const newAngle = Math.round(ctx.core.clamp(oldAngle + angle, -90, 270) * 10) / 10;
        const newPower = Math.round(ctx.core.clamp(oldPower + power, 1, 100) * 10) / 10;
        e.blackboard.set('custom.angle', newAngle);
        e.blackboard.set('custom.power', newPower);
        if (!ctx.economy.itemById(ctx.core.current().weaponId)?.noCombatRewards) {
            if (oldAngle !== newAngle)
                ctx.economy.reward(ctx.core.current(), 'aim');
            if (oldPower !== newPower)
                ctx.economy.reward(ctx.core.current(), 'power');
        }
        aim();
    }
    async function fire(): Promise<void> {
        if (!ctx.core.active() || ctx.core.current().eliminated)
            return;
        const p = ctx.core.current(), e = ctx.core.entity(p);
        if (!e.isLive)
            return;
        const item = ctx.economy.itemById(p.weaponId);
        if (!ctx.payloads.canFire(item)) {
            ctx.state.match.message = 'This payload cannot be deployed now. Ammunition retained.';
            if (p.control === 'cpu') ctx.equipment.chooseWeapon(p, 'standard');
            ctx.menus.publish();
            return;
        }
        if (p.control === 'cpu')
            ctx.attachments.armCpu(p);
        if (p.guidanceArmed && (!await ctx.attachments.prepare(p) || !ctx.core.active() || p !== ctx.core.current()))
            return;
        if (item.behavior?.mode.startsWith('battery') && ctx.economy.owned(p, 'battery') < 1) {
            if (p.control === 'cpu')
                ctx.equipment.chooseWeapon(p, 'standard');
            else {
                ctx.state.match.message = 'This weapon also needs one Battery';
                ctx.menus.publish();
                return;
            }
        }
        ctx.menus.input(false);
        aim();
        ctx.state.match.phase = 'telegraph';
        ctx.state.match.waitTicks = 0;
        const s = e.snapshot()!;
        e.setVelocity(0, s.vy);
        ctx.presentation.queuePresentation(p, 'shooting');
        ctx.session.persist();
        ctx.menus.publish();
    }
    function performAttack(p: any): void {
        const e = ctx.core.entity(p), s = e.snapshot()!;
        if (!e.isLive || !s?.alive) {
            ctx.residency.checkRoster();
            return;
        }
        if (!ctx.attachments.ready(p))
            return;
        if (!ctx.payloads.canFire(ctx.economy.itemById(p.weaponId))) {
            ctx.state.match.phase = 'turn';
            ctx.state.match.message = 'Payload capacity changed. Ammunition retained.';
            if (p.control === 'cpu') ctx.cpu.cpuNoAction(p, ctx.state.match.message);
            else ctx.menus.input(true);
            ctx.session.persist();
            ctx.menus.publish();
            return;
        }
        if (p.fireSolution?.kind === 'special' && !ctx.aiming.refreshSpecialShot(p)) {
            ctx.state.match.phase = 'turn';
            ctx.cpu.cpuNoAction(p, 'The cutting route changed during dialogue; ammunition retained');
            return;
        }
        const solution = p.fireSolution, target = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId));
        if (p.control === 'cpu' && solution?.kind === 'tank' && solution.turn === ctx.state.match.turnNumber
            && p.fireRefreshTurn !== ctx.state.match.turnNumber && target && (!ctx.aiming.comparableShot(solution, s, target, true)
            || Math.abs((solution.hullAngle ?? s.angle) - s.angle) > .02)) {
            p.fireRefreshTurn = ctx.state.match.turnNumber;
            ctx.session.run(() => refreshCpuShot(p, solution));
            return;
        }
        aim();
        p.shotFrom = { x: s.x, y: s.y };
        ctx.state.match.phase = 'firing';
        ctx.state.match.waitTicks = 0;
        ctx.state.match.message = 'Firing';
        ctx.state.match.attack = { owner: p.entityId, item: p.weaponId, damageBefore: p.damage || 0, rootId: null, ids: {},
            launched: 0, ended: 0, emitted: 1, tasks: 0, pending: [], launchClock: null, spent: false, lastPoint: null,
            angle: e.weapon.state!.angle, power: Number(e.blackboard.get('custom.power')), origin: null,
            targetId: p.targetId, targetAtLaunch: ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId)),
            solution: p.fireSolution?.turn === ctx.state.match.turnNumber && p.fireSolution.weapon === p.weaponId ? p.fireSolution : null,
            wind: talus.world.wind || 0 };
        if (!ctx.attachments.stage(p, ctx.state.match.attack)) {
            ctx.state.match.attack = null;
            ctx.state.match.phase = 'turn';
            ctx.menus.input(p.control === 'human');
            ctx.session.persist();
            ctx.menus.publish();
            return;
        }
        ctx.presentation.playCue("fire");
        ctx.tricksters.prepareAttack(p.entityId, ctx.state.match.attack, ctx.economy.itemById(p.weaponId));
        if (!e.weapon.fire(p.targetId || undefined))
            ctx.session.fail('Cannon did not accept the trigger');
    }
    async function refreshCpuShot(p: any, previous: any): Promise<void> {
        const tank = ctx.core.entity(p), token = ctx.state.utilityGeneration, turn = ctx.state.match.turnNumber;
        if (!ctx.attachments.clear(p))
            return;
        const valid = () => token === ctx.state.utilityGeneration && ctx.state.match?.phase === 'telegraph' && ctx.core.current() === p
            && !p.eliminated && ctx.state.match.turnNumber === turn && p.weaponId === previous.weapon;
        const target = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId));
        if (!target || !valid())
            return;
        const point = { x: target.x + previous.offsetX, y: target.y };
        const request: BallisticPlanRequest = { target: point, targetEntityId: p.targetId, fixedAngle: previous.angle,
            maxCandidates: 1, tolerance: 8, terrain: 'materialize', maxSteps: 500000, maxCells: 1000000 };
        const plan = await tank.weapon.plan(request);
        while (valid() && talus.sim.paused)
            await talus.sleepTicks(1);
        if (!valid())
            return;
        if (plan.status !== 'clear' || !plan.solution) {
            ctx.state.match.phase = 'turn';
            ctx.cpu.cpuNoAction(p, 'Firing position changed during dialogue; fresh native survey refused: ' + plan.reason);
            return;
        }
        p.fireSolution = { ...previous, origin: { ...tank.position! }, target, point, hullAngle: tank.snapshot()?.angle,
            angle: plan.solution.angle, power: plan.solution.power, wind: talus.world.wind || 0, predicted: plan.solution.end };
        tank.blackboard.set('custom.aimPlan', JSON.parse(JSON.stringify(plan)));
        tank.blackboard.set('custom.aimAngle', plan.solution.angle);
        tank.blackboard.set('custom.aimPower', plan.solution.power);
        tank.blackboard.set('custom.angle', -plan.solution.angle * 180 / Math.PI);
        tank.blackboard.set('custom.power', plan.solution.power * 100);
        performAttack(p);
    }
    function attackShell(at: any, spec: any, depth = 1): Projectile {
        const a = ctx.state.match.attack;
        if (!a)
            throw new Error('No attack for secondary warhead');
        ctx.state.childDepth = depth;
        try {
            const shell = talus.projectiles.launch({ kind: 'rigid-body', element: 'IRON', owner: a.owner,
                x: at.x, y: at.y, vx: at.vx || 0, vy: at.vy || 0,
                bodySizePx: 4, gravityScale: 1, drag: 0, lifetime: 8, independent: true,
                damage: 55, damageType: 'blast', aoeRadius: 80, carveRadius: 32, carveMode: 'erase',
                ...spec, detonate: { ...(spec.detonate ?? { onBody: true, onTerrain: true, atLifetime: true }), looseMatter: ctx.state.market.looseMatter } });
            if (!shell)
                throw new Error('Secondary projectile launch refused');
            return shell;
        }
        finally {
            ctx.state.childDepth = 0;
        }
    }
    function splitAttack(entry: any, position: any, behavior: any): void {
        entry.split = true;
        for (let n = 0; n < behavior.count; n++) {
            const apex = behavior.mode === 'apex';
            const angle = -Math.PI + ctx.chaos.chaosRandom() * Math.PI;
            const vx = apex ? Number(position.vx ?? entry.vx ?? 0) + (n - (behavior.count - 1) / 2) * behavior.spread : Math.cos(angle) * behavior.speed;
            const vy = apex ? 40 + Math.abs(n - (behavior.count - 1) / 2) * 12 : Math.sin(angle) * behavior.speed;
            attackShell({ x: position.x, y: position.y - 8, vx, vy }, { damage: behavior.childDamage,
                aoeRadius: behavior.childRadius, carveRadius: behavior.childCarve }, 1);
        }
    }
    function materialRecipe(element: string): {
        id: string;
        name: string;
        description: string;
        tags: string[];
        macro: {
            mode: string;
            support: string;
            strata: {
                element: string;
                thickness: number[];
            }[];
        };
        micro: {
            noise: {
                algorithm: string;
                frequency: number;
                octaves: number;
                persistence: number;
                lacunarity: number;
            };
        };
    } {
        return { id: 'indigo-payload-' + element.toLowerCase(), name: element + ' payload', description: 'Native material payload', tags: ['payload'],
            macro: { mode: 'volumetric', support: 'none', strata: [{ element, thickness: [1, 1] }] },
            micro: { noise: { algorithm: 'simplex', frequency: .08, octaves: 3, persistence: .5, lacunarity: 2 } } };
    }
    async function deposit(a: any, at: any, behavior: any): Promise<void> {
        a.tasks++;
        try {
            const radius = behavior.radius, x = Math.round(at.x), y = Math.round(at.y - radius / 2);
            const cells = radius * radius * 4;
            const receipt = await talus.world.terrainWork({ kind: 'recipe', shape: { x, y, radius },
                simulationRegion: { x: x - radius - 32, y: y - radius - 32, w: radius * 2 + 64, h: radius * 2 + 256 },
                bounds: { ...ctx.state.arena.bounds, h: 1024 }, replacement: 'empty', budget: { cells, particles: cells, work: cells },
                recipe: materialRecipe(behavior.element) as TerrainRecipe, seed: ctx.core.chaosSeed(ctx.state.match.seed + ':' + a.rootId), holdSeconds: 1 });
            if (receipt.status !== 'completed')
                throw new Error(a.item + ' payload: ' + receipt.reason);
            if (behavior.ignite) {
                const fire = await talus.world.terrainWork({ kind: 'recipe', shape: { x: x - 8, y: y - radius - 5, w: 16, h: 4 },
                    bounds: ctx.state.arena.bounds, replacement: 'empty', budget: { cells: 64, particles: 64, work: 64 },
                    recipe: materialRecipe('FIRE') as TerrainRecipe, seed: ctx.core.chaosSeed(ctx.state.match.seed + ':ignition:' + a.rootId), holdSeconds: .25 });
                if (fire.status !== 'completed')
                    throw new Error('Ignition: ' + fire.reason);
            }
        }
        finally {
            a.tasks--;
        }
    }
    async function terrainPayload(a: any, at: any, b: any): Promise<void> {
        a.tasks++;
        try {
            const origin = b.origin === 'launch' ? a.origin : at;
            const x = Math.round(origin.x), y = Math.round(origin.y);
            const direction = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
            const tip = { x: x + direction.x * b.length, y: y + direction.y * b.length };
            const shape: TerrainShape = b.shape === 'wedge' ? { kind: 'polygon', points: [
                    { x, y }, { x: tip.x - direction.y * b.width / 2, y: tip.y + direction.x * b.width / 2 },
                    { x: tip.x + direction.y * b.width / 2, y: tip.y - direction.x * b.width / 2 },
                ] } : { x, y, radius: b.radius };
            const points = 'points' in shape ? shape.points : [{ x: x - b.radius, y: y - b.radius }, { x: x + b.radius, y: y + b.radius }];
            const x0 = Math.floor(Math.min(...points.map(p => p.x))), y0 = Math.floor(Math.min(...points.map(p => p.y)));
            const w = Math.ceil(Math.max(...points.map(p => p.x))) - x0, h = Math.ceil(Math.max(...points.map(p => p.y))) - y0;
            const halo = b.operation === 'fracture' ? 1 : 0, cells = (w + halo * 2) * (h + halo * 2);
            const floorY = ctx.state.arena.terrain.solidBottomTileRow * ctx.state.arena.tiles.chunksPerTile * 64;
            const bounds = { ...ctx.state.arena.bounds, h: floorY };
            const receipt = await talus.world.terrainWork({ kind: b.operation, shape, bounds,
                simulationRegion: { x: x0 - halo, y: y0 - halo, w: w + halo * 2, h: h + halo * 2 + 128 },
                replacement: b.replacement,
                materials: b.materials.map((m: any) => {
                    const element = talus.elements.get(m.name);
                    if (!element)
                        throw new Error('Terrain material is missing: ' + m.name);
                    return { element: element.id, hardness: m.hardness };
                }),
                budget: { cells, particles: cells, work: cells * Math.max(1, ...b.materials.map((m: any) => m.hardness)) },
                ...(b.operation === 'recipe' ? { recipe: materialRecipe(b.element) as TerrainRecipe } : {}),
                ...(b.operation === 'fracture' ? { fracture: b.fracture } : {}),
                seed: ctx.core.chaosSeed(ctx.state.match.seed + ':terrain:' + a.rootId), holdSeconds: b.holdSeconds });
            const owner = ctx.state.match.roster.find((p: any) => p.entityId === a.owner);
            if (receipt.status === 'completed' && receipt.accepted > 0 && owner)
                ctx.cpu.cpuProgress(owner);
            else
                ;
            if (receipt.status !== 'completed') {
                ctx.state.match.message = 'Terrain work refused: ' + receipt.reason;
                ctx.menus.publish();
            }
        }
        finally {
            a.tasks--;
        }
    }
    function tickAttack(): void {
        if (talus.sim.paused || ctx.state.match.phase === 'fault')
            return;
        const a = ctx.state.match.attack;
        if (!a || a.rootId == null) {
            ctx.residency.releaseEmissionRegions('burst:');
            return;
        }
        const item = ctx.economy.itemById(a.item), b = item.behavior;
        const burstKey = 'burst:' + a.rootId;
        for (const key of [...ctx.state.emissionRegions.keys()])
            if (key.startsWith('burst:') && key !== burstKey)
                ctx.residency.releaseEmissionRegion(key);
        if (b?.mode === 'burst' && a.emitted < b.count) {
            const p = ctx.state.match.roster.find((r: any) => r.entityId === a.owner), tank = ctx.core.entity(p);
            const clock = talus.sim.clock, elapsed = Math.max(0, clock - (a.burstClock ?? a.launchClock));
            a.burstClock = clock;
            if (p.eliminated || tank?.alive === false || tank?.residency === 'destroyed') {
                a.emitted = b.count;
                ctx.residency.releaseEmissionRegion(burstKey);
            }
            else if (ctx.residency.emissionRegionReady(burstKey, { follow: tank, halfWidth: 64, halfHeight: 64,
                label: 'terra-burst-' + a.rootId }, false, !!tank?.isLive)) {
                a.burstElapsed = (a.burstElapsed || 0) + elapsed;
                if (a.burstElapsed >= a.emitted * b.interval) {
                    const angle = -Number(tank.blackboard.get('custom.angle')) * Math.PI / 180 + (ctx.chaos.chaosRandom() - .5) * b.jitter * 2;
                    const spec = item.projectile, pos = tank.position!, count = spec.projectilesPerShot || 1;
                    for (let n = 0; n < count; n++)
                        attackShell({ x: pos.x + Math.cos(angle) * spec.spawnOffset,
                            y: pos.y + Math.sin(angle) * spec.spawnOffset, vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed }, { ...spec, projectilesPerShot: 1, element: spec.material || 'IRON' }, 1);
                    a.emitted++;
                }
            }
        }
        if (b?.mode !== 'burst' || a.emitted >= b.count)
            ctx.residency.releaseEmissionRegion(burstKey);
        if (b?.mode === 'apex') {
            const entry = a.ids[a.rootId], projectile = talus.projectiles.get(a.rootId), s = projectile?.snapshot();
            if (entry && s && !entry.split) {
                if (entry.vy < 0 && s.vy >= 0) {
                    splitAttack(entry, s, b);
                    projectile!.remove();
                }
                else
                    entry.vy = s.vy;
            }
        }
        for (const job of a.pending.splice(0)) {
            if (job.kind === 'cluster')
                splitAttack(job.entry, job.at, b);
            if (job.kind === 'leap')
                attackShell({ x: job.at.x, y: job.at.y - 12, vx: job.vx, vy: -260 }, { damage: 70, aoeRadius: 95, carveRadius: 42 }, job.depth + 1);
            if (job.kind === 'deposit')
                ctx.session.run(() => deposit(a, job.at, b));
            if (job.kind === 'terrain')
                ctx.session.run(() => terrainPayload(a, job.at, b));
            if (job.kind === 'sand')
                ctx.session.run(() => deposit(a, job.at, { element: 'SAND', radius: 64 }));
            if (job.kind === 'payload')
                ctx.session.run(() => ctx.payloads.impact(a, job.at));
        }
        const emitting = b?.mode === 'burst' && a.emitted < b.count;
        if (!emitting && !Object.keys(a.ids).length && !a.pending.length && !a.tasks) {
            observeSpecialAttack(a);
            ctx.state.match.impact = a.lastPoint;
            ctx.state.match.attack = null;
            ctx.state.shot = null;
            ctx.state.match.shotId = null;
            ctx.session.run(ctx.turns.settle);
        }
        else {
            const id = Object.keys(a.ids).map(Number).find(id => talus.projectiles.get(id)?.exists);
            if (id !== undefined) {
                ctx.state.shot = talus.projectiles.get(id);
                ctx.state.match.shotId = id;
            }
        }
    }
    function observeSpecialAttack(a: any): void {
        if (a.solution?.kind !== 'special')
            return;
        const p = ctx.state.match.roster.find((r: any) => r.entityId === a.owner);
        const target = ctx.state.match.roster.find((r: any) => r.entityId === a.targetId);
        const targetAt = target && ctx.core.entity(target)?.position || a.targetAtLaunch;
        const at = a.measuredHit || a.lastPoint;
        if (p?.control !== 'cpu' || !p.shotFrom || !targetAt || !a.targetAtLaunch || !at)
            return;
        ctx.aiming.observeCpuShot(p, {
            turn: ctx.state.match.turnNumber, targetId: a.targetId, weapon: a.item, origin: p.shotFrom,
            target: { x: targetAt.x, y: targetAt.y }, targetAtLaunch: a.targetAtLaunch, impact: at,
            reason: a.endReason, collision: a.endCollision, damageBefore: a.damageBefore || 0,
            dx: at.x - targetAt.x, dy: at.y - targetAt.y, power: a.power / 100, angle: a.angle,
            hit: !!a.targetHit, direct: !!a.directHit, split: !!a.nativePayload, solution: a.solution,
            wind: a.wind, flightSeconds: talus.sim.clock - a.launchClock,
        });
    }
    function bind() {
        talus.on('weapon.beforeFire', e => {
            if (ctx.state.match?.roster.some((p: any) => p.entityId === e.entity?.id))
                return ctx.state.match.phase === 'firing' && ctx.core.current().entityId === e.entity?.id;
        });
        talus.on('projectile.launch', e => {
            ctx.economy.shotReward(e, 'launch');
            const a = ctx.state.match?.attack;
            if (ctx.state.launchingChaos || !a || (e.owner?.id || e.ownerEntityId) !== a.owner)
                return;
            const p = ctx.state.match.roster.find((r: any) => r.entityId === a.owner), item = ctx.economy.itemById(a.item);
            if (!a.spent) {
                if (!ctx.economy.unlimited(a.item)) {
                    if (ctx.economy.owned(p, a.item) < 1) {
                        ctx.session.fail('Paid cannon fired without purchased ammunition');
                        return;
                    }
                    ctx.economy.wallet(p).stock[a.item]--;
                    ctx.economy.wallet(p).revision++;
                }
                if (item.behavior?.mode.startsWith('battery'))
                    ctx.economy.wallet(p).stock.battery--;
                ctx.attachments.attach(p, a);
                if (a.solution)
                    a.solution.guidance = a.guidanceArmed || null;
                p.shots = (p.shots || 0) + 1;
                if (item.behavior?.mode !== 'terrain')
                    ctx.cpu.cpuProgress(p);
                a.spent = true;
                ctx.economy.saveBank();
            }
            const snapshot = e.projectile.snapshot();
            a.ids[e.projectileId] = { depth: ctx.state.childDepth, vy: snapshot?.vy ?? -1, vx: snapshot?.vx ?? 0, split: false,
                launch: snapshot && { x: snapshot.x, y: snapshot.y, vx: snapshot.vx, vy: snapshot.vy }, launchClock: talus.sim.clock };
            a.launched++;
            if (a.rootId == null) {
                a.rootId = e.projectileId;
                a.launchClock = talus.sim.clock;
                a.origin = { x: snapshot!.x, y: snapshot!.y };
            }
            let homingAccepted: boolean | null = null;
            if (item.behavior?.mode === 'homing' && p.targetId) {
                homingAccepted = e.projectile.setTarget(p.targetId);
            }
            ctx.state.shot = e.projectile;
            ctx.state.match.shotId = e.projectileId;
            ctx.state.match.phase = 'flight';
            ctx.state.match.waitTicks = 0;
            ctx.state.match.message = homingAccepted === false ? 'Homing refused · rocket in flight' : 'Attack in flight';
            ctx.session.persist();
            ctx.menus.publish();
        });
        talus.on('projectile.apex', e => {
            const a = ctx.state.match?.attack, entry = a?.ids[e.projectileId], b = a && ctx.economy.itemById(a.item).behavior;
            if (entry && e.projectileId === a.rootId && b?.mode === 'apex' && !entry.split) {
                splitAttack(entry, e.projectile.snapshot() || e, b);
                e.projectile.remove();
            }
        });
        talus.on('projectile.payload', e => {
            const a = ctx.state.match?.attack, entry = a?.ids[e.projectileId];
            if (entry) {
                entry.split = true;
                a.nativePayload = true;
            }
        });
        talus.on('projectile.collision', e => {
            ctx.economy.shotReward(e, 'landing');
            const entry = ctx.state.match?.attack?.ids[e.projectileId];
            if (entry) {
                entry.collision = e.with;
            }
        });
        talus.on('projectile.bounce', e => ctx.economy.shotReward(e, 'bounce'));
        talus.on('damage', e => {
            if (!ctx.state.match || e.blocked || e.amount <= 0)
                return;
            const attacker = ctx.state.match.roster.find((p: any) => p.entityId === (e.source?.id || e.sourceEntityId));
            const victim = ctx.state.match.roster.find((p: any) => p.entityId === (e.target?.id || e.targetStableId));
            if (attacker)
                attacker.damage = (attacker.damage || 0) + e.amount;
            if (victim)
                victim.damageTaken = (victim.damageTaken || 0) + e.amount;
            if (attacker && victim !== attacker && ctx.state.match.attack?.owner === attacker.entityId && !ctx.state.match.attack.hitCounted) {
                ctx.state.match.attack.hitCounted = true;
                attacker.hits = (attacker.hits || 0) + 1;
            }
            ctx.economy.reward(attacker, 'hit');
            ctx.economy.reward(attacker, 'damage', e.amount);
            ctx.economy.reward(victim, 'hurt', e.amount);
            ctx.session.persist();
        });
        talus.on('projectile.hit', e => {
            if (!ctx.state.match?.attack?.ids[e.projectileId])
                return;
            ctx.tricksters.hit(e, ctx.state.match.attack, ctx.economy.itemById(ctx.state.match.attack.item));
            if (e.targetStableId === ctx.state.match.attack.targetId && e.amount > 0) {
                const entry = ctx.state.match.attack.ids[e.projectileId];
                entry.targetHit = true;
                entry.directHit ||= e.direct;
                const a = ctx.state.match.attack;
                a.targetHit = true;
                const at = e.projectile.snapshot() || e;
                if ((!a.directHit || e.direct) && Number.isFinite(at.x) && Number.isFinite(at.y))
                    a.measuredHit = { x: at.x, y: at.y };
                a.directHit ||= e.direct;
            }
            const target = ctx.state.match.roster.find((p: any) => p.entityId === e.targetStableId);
            ctx.state.match.lastHit = (target?.name || 'Tank') + ' −' + Math.round(e.amount) + ' HP' + (e.killed ? ' · ELIMINATED' : e.direct ? ' · DIRECT HIT' : ' · SPLASH');
            ctx.session.persist();
            ctx.menus.publish();
        });
        talus.on('projectile.end', e => {
            ctx.economy.shotReward(e, 'end');
            const job = ctx.state.match?.chaos.jobs.find((j: any) => j.projectileIds.includes(e.projectileId));
            if (job) {
                job.projectileIds = job.projectileIds.filter((id: number) => id !== e.projectileId);
                job.ended++;
                ctx.session.persist();
            }
            const a = ctx.state.match?.attack, entry = a?.ids[e.projectileId];
            if (!a || !entry)
                return;
            const at = { x: Number(e.x), y: Number(e.y) };
            if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) {
                ctx.session.fail('Projectile ended without a resolution point');
                return;
            }
            delete a.ids[e.projectileId];
            a.ended++;
            a.lastPoint = at;
            a.endReason = e.reason;
            a.endCollision = entry.collision;
            ctx.payloads.queue(a, entry, e);
            const b = ctx.economy.itemById(a.item).behavior;
            if (!entry.split && entry.depth === 0) {
                if (b?.mode === 'cluster' || b?.mode === 'apex')
                    a.pending.push({ kind: 'cluster', at, entry });
                if (b?.mode === 'deposit')
                    a.pending.push({ kind: 'deposit', at });
                if (b?.mode === 'terrain')
                    a.pending.push({ kind: 'terrain', at });
                if (a.item === 'sand')
                    a.pending.push({ kind: 'sand', at });
            }
            if (b?.mode === 'leap' && entry.depth < b.hops - 1)
                a.pending.push({ kind: 'leap', at, vx: entry.vx * .35, depth: entry.depth });
            const p = ctx.state.match.roster.find((r: any) => r.entityId === a.owner);
            if (p.control === 'cpu' && p.shotFrom && e.projectileId === a.rootId && a.solution?.kind !== 'special') {
                const target = ctx.state.match.roster.find((r: any) => r.entityId === a.targetId), targetAt = target && ctx.core.entity(target)?.position || a.targetAtLaunch;
                if (targetAt && a.targetAtLaunch)
                    ctx.aiming.observeCpuShot(p, {
                        turn: ctx.state.match.turnNumber, targetId: a.targetId, weapon: a.item, origin: p.shotFrom, target: { x: targetAt.x, y: targetAt.y },
                        targetAtLaunch: { x: a.targetAtLaunch.x, y: a.targetAtLaunch.y }, impact: at, reason: e.reason, collision: entry.collision,
                        damageBefore: a.damageBefore || 0, dx: at.x - targetAt.x, dy: at.y - targetAt.y, power: a.power / 100, angle: a.angle,
                        hit: !!entry.targetHit, direct: !!entry.directHit, split: entry.split, solution: a.solution, wind: a.wind,
                        launch: entry.launch, flightSeconds: talus.sim.clock - entry.launchClock
                    });
            }
            ctx.session.persist();
        });
    }
    return { aim, adjust, fire, performAttack, refreshCpuShot, attackShell, splitAttack, materialRecipe, deposit, terrainPayload, tickAttack, bind };
}
export = create;
