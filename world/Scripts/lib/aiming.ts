/** Terrain-aware shot planning and persistent target/weapon learning. */
import type { Runtime } from 'context';
import specialWeapons = require('special-weapons');
function create(ctx: Runtime) {
    function personaFor(p: any): any {
        return ctx.state.personaCatalog?.personas.find((v: any) => v.id === p.personaId) || ctx.state.personaCatalog?.personas[0];
    }
    function doctrine(p: any): any {
        const profile = personaFor(p)?.strategy || { risk: .5, saveFraction: .2, weaponPreferences: ['heavy', 'standard'],
            utilityPreferences: ['battery'], candidateBudget: 24, learningRate: .55 };
        const skill = ctx.state.personaCatalog?.personas.find((v: any) => v.skill === ctx.state.match?.cpuSkill)?.strategy;
        return skill ? { ...profile, ...Object.fromEntries(['candidateBudget', 'learningRate'].map(k => [k, skill[k]])) } : profile;
    }
    function aiRandom(p: any): number {
        let x = p.aiRng || ctx.core.chaosSeed(String(ctx.state.match.seed) + ':ai:' + p.index);
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        p.aiRng = x >>> 0;
        return p.aiRng / 4294967296;
    }
    function targetSnapshot(p: any): EntitySnapshot | null {
        if (!p?.entityId || p.eliminated)
            return null;
        const state = ctx.core.entity(p)?.snapshot();
        return state && state.alive !== false && Number.isFinite(state.x) && Number.isFinite(state.y) ? state : null;
    }
    function targetReference(p: any, at: Vec2, terrain = false): {
        x: number;
        y: number;
        entityId: any;
        bodyId: null;
    } {
        return { x: at.x, y: at.y, entityId: terrain ? null : p.entityId, bodyId: null };
    }
    function selectTarget(p: any, id: string): boolean {
        const target = ctx.state.match.roster.find((r: any) => r.entityId === id && r !== p && !r.eliminated);
        const at = targetSnapshot(target);
        if (!at)
            return false;
        p.targetId = id;
        ctx.core.entity(p).blackboard.set('custom.indigoTarget', targetReference(target, at));
        ctx.session.persist();
        ctx.menus.publish();
        return true;
    }
    function cpuWeaponUnavailable(item: any): string | null {
        if (!item?.enabled || item.kind !== 'weapon')
            return 'unavailable-item';
        if (item.id === 'escape-charge')
            return 'local-terrain-tactic';
        if (!ctx.payloads.canFire(item))
            return 'payload-capacity';
        if (specialWeapons.supported(item))
            return null;
        const s = item.projectile;
        if (!s || s.kind !== 'rigid-body')
            return 'native-forecast-non-rigid';
        if (s.homing || item.behavior?.mode === 'homing')
            return 'native-forecast-homing';
        if (s.excavation)
            return 'native-forecast-excavation';
        if (s.bouncing)
            return 'native-forecast-bouncing';
        if (s.spread || s.projectilesPerShot > 1)
            return 'native-forecast-multicast';
        if (!(s.speed > 0))
            return 'native-forecast-stationary-cast';
        return null;
    }
    function fireControl(p: any, targetId: string, weapon: string, create = false): any {
        const records = p.fireControls || [];
        let memory = records.find((m: any) => m.targetId === targetId && m.weapon === weapon);
        if (!memory && create) {
            memory = { targetId, weapon, samples: 0, hits: 0, offsetX: 0, gain: 1, best: null, last: null };
            p.fireControls = [...records, memory].slice(-64);
        }
        return memory;
    }
    function comparableShot(sample: any, origin: Vec2, target: Vec2, exact = false): boolean {
        if (!sample?.origin || !sample.target)
            return false;
        const dx = target.x - origin.x, oldDx = sample.target.x - sample.origin.x;
        return Math.sign(dx) === Math.sign(oldDx)
            && Math.abs((target.y - origin.y) - (sample.target.y - sample.origin.y)) <= (exact ? 2 : 40)
            && Math.abs(dx - oldDx) <= (exact ? 2 : Math.max(64, Math.abs(oldDx) * .2))
            && Math.hypot(origin.x - sample.origin.x, origin.y - sample.origin.y) <= (exact ? 2 : 160)
            && Math.hypot(target.x - sample.target.x, target.y - sample.target.y) <= (exact ? 2 : 160)
            && Math.abs((sample.wind ?? 0) - (talus.world.wind || 0)) <= (exact ? .01 : 5);
    }
    function measuredSample(observation: any): any {
        return { origin: observation.origin, target: observation.targetAtLaunch, wind: observation.wind,
            angle: observation.angle, power: observation.power, offsetX: observation.solution?.offsetX || 0,
            error: observation.learning === 'measured-direct-hit' ? 0 : Math.hypot(observation.dx, observation.dy), direct: observation.direct,
            turn: observation.turn, guidance: observation.solution?.guidance || null };
    }
    function provenShot(p: any, targetId: string, weapon: string, origin: Vec2, target: Vec2, exact = false): any {
        const memory = fireControl(p, targetId, weapon);
        const retained = (p.impacts || []).filter((v: any) => v.targetId === targetId && v.weapon === weapon && v.hit && v.direct
            && ['measured-direct-hit', 'range-feedback'].includes(v.learning)).map(measuredSample);
        return [memory?.best, ...retained].filter(sample => {
            if (!comparableShot(sample, origin, target, exact))
                return false;
            const guidance = sample.guidance;
            return !guidance || ctx.economy.itemById(guidance)?.enabled && ctx.economy.owned(p, guidance) > 0
                && ctx.attachments.compatible(ctx.economy.itemById(weapon), guidance);
        }).sort((a, b) => Number(b.direct) - Number(a.direct) || a.error - b.error)[0] || null;
    }
    function observeCpuShot(p: any, observation: any): void {
        p.impacts = [...(p.impacts || []), observation].slice(-64);
        const memory = fireControl(p, observation.targetId, observation.weapon, true);
        const shot = observation.solution;
        const moved = Math.hypot(observation.target.x - observation.targetAtLaunch.x, observation.target.y - observation.targetAtLaunch.y);
        const special = shot?.kind === 'special';
        const measured = (special || shot?.guidance) && observation.hit && observation.direct && moved <= 12;
        const useful = (shot?.kind === 'tank' || observation.hit && ['field', 'uncertain-tank'].includes(shot?.kind))
            && !shot?.guidance
            && observation.reason === 'detonated' && !observation.split
            && moved <= 12 && (observation.hit || observation.collision === 'terrain'
            && Math.abs(observation.dy) <= 40 && Math.abs(observation.dx) <= Math.max(128, Math.abs(observation.target.x - observation.origin.x) * .3));
        observation.learning = measured ? 'measured-direct-hit' : useful ? 'range-feedback' : 'diagnostic-only';
        if (measured) {
            memory.samples++;
            memory.hits++;
            const sample = { ...measuredSample(observation), offsetX: 0 };
            if (!comparableShot(memory.best, sample.origin, sample.target, true) || !memory.best.direct
                || (memory.best.guidance || null) !== sample.guidance)
                memory.best = sample;
            memory.last = sample;
            memory.offsetX = 0;
        }
        else if (useful) {
            memory.samples++;
            if (observation.hit)
                memory.hits++;
            const sample = measuredSample(observation);
            const best = memory.best, comparable = comparableShot(best, sample.origin, sample.target, true)
                && (best.guidance || null) === sample.guidance;
            if (observation.hit && (!comparable || observation.direct && !best.direct
                || observation.direct === best.direct && sample.error < best.error))
                memory.best = sample;
            const regressed = comparable && (!observation.hit || best.direct && !observation.direct
                || observation.direct === best.direct && sample.error > best.error + 2);
            if (regressed) {
                memory.gain = Math.max(.125, memory.gain / 2);
                memory.offsetX = best.offsetX;
            }
            else {
                const rate = (doctrine(p).learningRate ?? .65) * memory.gain;
                const correction = observation.direct ? 0 : ctx.core.clamp(observation.dx * rate, observation.hit ? -12 : -96, observation.hit ? 12 : 96);
                memory.offsetX = ctx.core.clamp(sample.offsetX - correction, -160, 160);
            }
            memory.last = sample;
        }
        const tank = ctx.core.entity(p);
        if (tank?.can('blackboard.set')) {
            tank.blackboard.set('custom.aiImpacts', p.impacts);
            tank.blackboard.set('custom.fireControls', p.fireControls);
        }
    }
    function writeSpecialAim(p: any, target: any, item: any, origin: Vec2, at: Vec2,
        estimate: NonNullable<ReturnType<typeof specialWeapons.candidate>>, turn: number, kind = 'special'): void {
        const tank = ctx.core.entity(p);
        p.targetId = target.entityId;
        p.plannedTurn = turn;
        p.tactic = estimate.reason;
        p.fireSolution = { turn, weapon: item.id, targetId: p.targetId, origin: { ...origin }, target: { ...at },
            point: estimate.point, offsetX: 0, wind: talus.world.wind || 0, hullAngle: tank.snapshot()?.angle,
            angle: estimate.angle, power: estimate.power, kind,
            ...(Object.hasOwn(estimate, 'guidance') ? { guidance: estimate.guidance } : {}) };
        tank.blackboard.set('custom.indigoTarget', targetReference(target, at));
        tank.blackboard.set('custom.aimPlan', null);
        tank.blackboard.set('custom.aimRefusal', 'prediction-unavailable');
        tank.blackboard.set('custom.aimAngle', estimate.angle);
        tank.blackboard.set('custom.aimPower', estimate.power);
        tank.blackboard.set('custom.decisionTurn', turn);
    }
    function refreshSpecialShot(p: any): boolean {
        const tank = ctx.core.entity(p), item = ctx.economy.itemById(p.weaponId);
        const target = ctx.state.match.roster.find((r: any) => r.entityId === p.targetId), at = targetSnapshot(target);
        const origin = tank?.position;
        if (!tank?.isLive || !origin || !at || !specialWeapons.supported(item))
            return false;
        const angle = Math.atan2(at.y - origin.y, at.x - origin.x), muzzle = item.projectile.spawnOffset || 0;
        const from = { x: origin.x + Math.cos(angle) * muzzle, y: origin.y + Math.sin(angle) * muzzle };
        const estimate = specialWeapons.candidate(item, origin, at, { arena: ctx.state.arena,
            obstruction: talus.world.raycast(from, at), targetId: target.entityId,
            best: provenShot(p, target.entityId, item.id, origin, at, true) });
        if (!estimate)
            return false;
        writeSpecialAim(p, target, item, origin, at, estimate, ctx.state.match.turnNumber);
        tank.blackboard.set('custom.angle', -estimate.angle * 180 / Math.PI);
        tank.blackboard.set('custom.power', estimate.power * 100);
        return true;
    }
    async function planCpuShot(p: any, turn: number): Promise<boolean> {
        const tank = ctx.core.entity(p), token = ctx.state.utilityGeneration, d = doctrine(p);
        if (!ctx.attachments.clear(p))
            return false;
        p.fireSolution = null;
        const valid = () => ctx.core.active() && ctx.core.current() === p && !p.eliminated && ctx.state.match.turnNumber === turn && token === ctx.state.utilityGeneration;
        const origin = tank.position!, trials: any[] = [], blocked: {
            target: any;
            at: BallisticObstruction;
        }[] = [];
        const snapshots = new Map<string, EntitySnapshot>();
        const targets = ctx.state.match.roster.filter((r: any) => {
            const at = r !== p ? targetSnapshot(r) : null;
            if (at)
                snapshots.set(r.entityId, at);
            return !!at;
        });
        const snapshot = (r: any) => snapshots.get(r.entityId)!;
        const distance = (r: any) => Math.hypot(snapshot(r).x - origin.x, snapshot(r).y - origin.y);
        const cluster = (r: any) => targets.filter((v: any) => v !== r && Math.hypot(snapshot(v).x - snapshot(r).x, snapshot(v).y - snapshot(r).y) < 200).length;
        const targetPriority = (r: any) => distance(r) + (snapshot(r).health ?? 100) * 2
            - cluster(r) * (p.personaId === 'domino' ? 180 : 30)
            - ((p.fireControls || []).some((m: any) => m.targetId === r.entityId && ctx.economy.owned(p, m.weapon) > 0
                && provenShot(p, r.entityId, m.weapon, origin, snapshot(r))) ? 400 : 0);
        targets.sort((a: any, b: any) => targetPriority(a) - targetPriority(b));
        if (!targets.length)
            return false;
        if ((tank.health ?? 100) <= 70)
            ctx.equipment.useBattery(p);
        ctx.equipment.syncLoadout(p);
        let budget = d.candidateBudget;
        const ownedWeapons = ctx.state.market.items.filter((i: any) => i.enabled && i.kind === 'weapon' && ctx.economy.owned(p, i.id) > 0);
        const skipped = ownedWeapons.map((item: any) => ({ item: item.id, reason: cpuWeaponUnavailable(item) })).filter((v: any) => v.reason);
        const weapons = ownedWeapons.filter((item: any) => !cpuWeaponUnavailable(item));
        const ranked = (target: any) => weapons.map((item: any) => {
            const pref = d.weaponPreferences.indexOf(item.id), radius = item.projectile?.aoeRadius || 0;
            const collateral = Math.max(0, radius + 50 - distance(target)) * (1 - d.risk) * 3;
            const previous = (p.impacts || []).filter((m: any) => m.weapon === item.id && m.targetId === target.entityId
                && m.turn >= turn - ctx.state.match.roster.length * 2 && Math.hypot(m.origin.x - origin.x, m.origin.y - origin.y) < 48).at(-1);
            const ineffective = previous && p.damage - (previous.damageBefore || 0) < 12 ? 30 : 0;
            const closeRapid = item.id === 'machine-gun' && distance(target) < 400 ? 80 : 0;
            const benefit = (item.projectile?.damage || item.behavior?.childDamage || 0) * .25 + cluster(target) * radius * .15;
            const paid = item.id !== 'standard' ? 80 : 0;
            const proven = provenShot(p, target.entityId, item.id, origin, snapshot(target)) ? 220 : 0;
            return { item, score: (pref >= 0 ? 140 - pref * 25 : -80) + paid + benefit + closeRapid + proven - collateral - ineffective };
        }).sort((a: any, b: any) => b.score - a.score);
        const candidateTargets = targets.slice(0, 2);
        const corridors = candidateTargets.map((target: any) => {
            const at = snapshot(target), from = { x: origin.x + Math.sign(at.x - origin.x) * 40, y: origin.y - 12 };
            return { target, obstruction: talus.world.raycast(from, at) };
        });
        const reserve = corridors.some((c: any) => c.obstruction && c.obstruction.entity?.id !== c.target.entityId)
            ? Math.max(2, Math.floor(budget / 4)) : 0;
        let attackBudget = budget - reserve;
        const dragProbes: {
            target: any;
            item: any;
            point: Vec2;
            owner: EntitySnapshot;
            targetPose: EntitySnapshot;
            plan: BallisticPlan;
            candidate: BallisticPlan['candidates'][number];
            score: number;
        }[] = [];
        let dragProbeInvalidated = false;
        const accept = (target: any, item: any, point: Vec2, plan: BallisticPlan, tactic: string, terrain: boolean, memory: number) => {
            p.weaponId = item.id;
            ctx.economy.wallet(p).selected = item.id;
            ctx.economy.wallet(p).revision++;
            ctx.economy.saveBank();
            p.targetId = target.entityId;
            p.plannedTurn = turn;
            p.tactic = tactic;
            p.fireSolution = { turn, weapon: item.id, targetId: target.entityId, origin: { ...origin }, target: snapshot(target),
                point: { ...point }, offsetX: point.x - snapshot(target).x, wind: talus.world.wind || 0,
                hullAngle: tank.snapshot()?.angle,
                angle: plan.solution!.angle, power: plan.solution!.power, predicted: plan.solution!.end,
                kind: terrain ? 'terrain' : ctx.payloads.handles(item) ? 'payload' : item.behavior?.mode === 'apex' ? 'apex' : 'tank' };
            tank.blackboard.set('custom.indigoTarget', targetReference(target, point, terrain));
            tank.blackboard.set('custom.aimPlan', JSON.parse(JSON.stringify(plan)));
            tank.blackboard.set('custom.aimRefusal', null);
            tank.blackboard.set('custom.aimAngle', plan.solution!.angle);
            tank.blackboard.set('custom.aimPower', plan.solution!.power);
            tank.blackboard.set('custom.decisionTurn', turn);
            tank.blackboard.set('custom.aiDecision', { turn, persona: p.personaId, skill: ctx.state.match.cpuSkill === 'persona' ? personaFor(p)?.skill : ctx.state.match.cpuSkill || personaFor(p)?.skill,
                tactic, target: p.targetId, item: item.id, budgetRemaining: budget, trials, skipped, risk: d.risk, memory });
            ctx.session.persist();
            ctx.menus.publish();
            return true;
        };
        const survey = async (target: any, item: any, request: BallisticPlanRequest, goal: string) => {
            tank.weapon.equip(item.template);
            const ownerPose = tank.snapshot(), targetPose = targetSnapshot(target), equipped = tank.weapon.state?.equipped;
            const plan = await tank.weapon.plan(request);
            while (valid() && talus.sim.paused)
                await talus.sleepTicks(1);
            if (!valid() || !targetSnapshot(target))
                return null;
            budget -= Math.max(1, plan.work.candidates);
            trials.push({ weapon: item.id, target: target.name, goal, reason: plan.reason, work: plan.work, warnings: plan.warnings, obstruction: plan.obstruction });
            if (plan.status !== 'clear' && plan.obstruction?.kind === 'terrain')
                blocked.push({ target, at: plan.obstruction });
            if (plan.status !== 'clear' && !['material-drag-not-supported', 'obstructed', 'unreachable', 'deflection-fields'].includes(plan.reason))
                dragProbeInvalidated = true;
            if (goal === 'tank' && plan.status === 'refused' && plan.solution === null && plan.reason === 'material-drag-not-supported'
                && ownerPose?.residency === 'live' && targetPose && equipped === item.template) {
                const candidates = (Array.isArray(plan.candidates) ? plan.candidates : []).filter(candidate => {
                    if (!candidate || typeof candidate !== 'object')
                        return false;
                    const at = candidate.obstruction;
                    return candidate.reason === 'material-drag-not-supported' && at?.kind === 'unknown'
                        && at.reason === 'material-drag-not-supported' && [candidate.angle, candidate.power, at.x, at.y, at.time].every(Number.isFinite)
                        && Math.abs(candidate.angle) <= Math.PI * 2 && candidate.power >= 0 && candidate.power <= 1 && at.time >= 0 && at.time <= 30;
                }).sort((a, b) => Math.hypot(a.obstruction!.x - request.target.x, a.obstruction!.y - request.target.y)
                    - Math.hypot(b.obstruction!.x - request.target.x, b.obstruction!.y - request.target.y));
                const candidate = candidates[0];
                if (candidate)
                    dragProbes.push({ target, item, point: { ...request.target }, owner: ownerPose, targetPose, plan, candidate,
                        score: Math.hypot(candidate.obstruction!.x - request.target.x, candidate.obstruction!.y - request.target.y)
                            / Math.max(1, Math.hypot(ownerPose.x - request.target.x, ownerPose.y - request.target.y)) });
            }
            return plan;
        };
        surveyTargets: for (let targetIndex = 0; targetIndex < candidateTargets.length; targetIndex++) {
            const target = candidateTargets[targetIndex];
            const options = ranked(target).map((v: any) => v.item);
            const maximum = attackBudget >= 36 ? 3 : 2;
            const selected = options.slice(0, maximum);
            if (!selected.some((i: any) => i.id === 'standard')) {
                if (selected.length >= maximum)
                    selected.pop();
                selected.push(ctx.economy.itemById('standard'));
            }
            for (let optionIndex = 0; optionIndex < selected.length; optionIndex++) {
                const item = selected[optionIndex];
                if (!valid())
                    return false;
                if (attackBudget < 1)
                    break surveyTargets;
                const spec = item.projectile, at = targetSnapshot(target), carrier = item.behavior?.mode === 'apex';
                if (!at)
                    continue surveyTargets;
                const measured = provenShot(p, target.entityId, item.id, origin, at, true);
                if (specialWeapons.supported(item) || measured?.guidance) {
                    const estimate = specialWeapons.supported(item) ? specialWeapons.candidate(item, origin, at, { arena: ctx.state.arena,
                        obstruction: corridors[targetIndex].obstruction, targetId: target.entityId,
                        best: measured }) : { angle: measured.angle, power: measured.power, point: { x: at.x, y: at.y },
                            repeated: true, guidance: measured.guidance, reason: 'Repeat measured guided hit; native fields remain uncertain' };
                    budget--;
                    attackBudget--;
                    const battery = item.behavior?.mode?.startsWith('battery') && ctx.economy.owned(p, 'battery') < 1;
                    if (!estimate || battery) {
                        skipped.push({ item: item.id, reason: battery ? 'battery-required' : 'special-shot-unavailable' });
                        continue;
                    }
                    const accepted = tank.weapon.equip(item.template);
                    trials.push({ weapon: item.id, target: target.name, goal: 'special',
                        reason: accepted ? 'uncertain-cutting-route' : 'weapon-equip-refused',
                        work: { candidates: 0 }, warnings: ['No ballistic forecast for this native cutting shot'] });
                    if (!accepted)
                        continue;
                    p.weaponId = item.id;
                    ctx.economy.wallet(p).selected = item.id;
                    ctx.economy.wallet(p).revision++;
                    ctx.economy.saveBank();
                    writeSpecialAim(p, target, item, origin, at, estimate, turn, specialWeapons.supported(item) ? 'special' : 'uncertain-tank');
                    tank.blackboard.set('custom.aiDecision', { turn, status: 'uncertain', reason: estimate.reason,
                        tactic: p.tactic, target: p.targetId, item: item.id, budgetRemaining: budget, trials, skipped });
                    ctx.session.persist();
                    ctx.menus.publish();
                    return true;
                }
                let point = { x: at.x, y: at.y }, support = false;
                if ((['mole', 'faultline'].includes(p.personaId) || spec.damage === 0) && (spec.carveRadius > 60 || item.behavior?.operation === 'fracture')) {
                    const x = at.x + (origin.x < at.x ? -24 : 24), y = talus.world.groundY(x, at.y + 8, 36);
                    if (y !== null) {
                        point = { x, y: y - 2 };
                        support = true;
                    }
                }
                if (!support && !carrier && spec.damage === 0 && (spec.carveRadius > 0 || item.behavior?.operation === 'fracture'))
                    continue;
                const memory = fireControl(p, target.entityId, item.id);
                const last = !memory?.last?.guidance && comparableShot(memory?.last, origin, at) ? memory.last : null;
                const best = measured;
                if (!support && !carrier && last)
                    point.x += memory.offsetX;
                const obstruction = corridors[targetIndex].obstruction;
                const high = carrier || at.y < origin.y - 48 || !!(obstruction && obstruction.entity?.id !== target.entityId);
                const remaining = selected.length - optionIndex + (candidateTargets.length - targetIndex - 1) * selected.length;
                const allowance = Math.max(1, Math.floor(attackBudget / Math.min(remaining, 2)));
                const request: BallisticPlanRequest = { target: point, ...(support ? {} : { targetEntityId: target.entityId }),
                    goal: carrier ? 'apex' : 'impact', preferHighArc: high, minElevation: high ? 60 : 5, maxElevation: 89,
                    angleStep: ctx.core.clamp((high ? 29 : 84) / Math.max(1, allowance - 1), .25, 30), maxCandidates: allowance,
                    maxSteps: 500000, maxCells: 1000000, terrain: 'materialize', tolerance: support ? 18 : 8 };
                if (spec.speedAtMinPower === spec.speed) {
                    const right = point.x >= origin.x, line = Math.atan2(point.y - origin.y, Math.abs(point.x - origin.x));
                    request.minElevation = 0;
                    request.maxElevation = Math.max(1, Math.min(8, (allowance - 1) * .25));
                    request.angleStep = .25;
                    request.preferHighArc = false;
                    request.angleOffset = ctx.core.clamp(right ? line : -line, -.8, .8);
                }
                let plan: BallisticPlan | null = null;
                const prior = best || last;
                if (!support && !carrier && prior && allowance >= 2) {
                    plan = await survey(target, item, { ...request, fixedAngle: prior.angle, angleOffset: 0, maxCandidates: 1 }, 'tank');
                    if (!plan)
                        return false;
                    attackBudget -= Math.max(1, plan.work.candidates);
                    request.maxCandidates = allowance - 1;
                }
                if (plan?.status !== 'clear' || !plan.solution) {
                    plan = await survey(target, item, request, support ? 'support' : carrier ? 'apex' : 'tank');
                    if (!plan)
                        return false;
                    attackBudget -= Math.max(1, plan.work.candidates);
                }
                if (!plan)
                    return false;
                if (plan.status !== 'clear' || !plan.solution)
                    continue;
                return accept(target, item, point, plan, support ? 'Remove observed support' : carrier ? 'Clear carrier to apex'
                    : cluster(target) && p.personaId === 'domino' ? 'Cluster / chain opportunity' : high ? 'High arc over obstruction'
                        : best ? 'Refining a proven firing solution' : last ? 'Observed-miss correction' : 'Surveyed firing corridor', support, memory?.samples || 0);
            }
        }
        const demolition = ranked(targets[0]).map((v: any) => v.item).filter((item: any) => item.projectile.carveRadius >= 24 || item.behavior?.operation === 'fracture');
        for (const obstruction of [...blocked])
            for (const item of demolition) {
                if (!valid())
                    return false;
                if (budget < 1)
                    break;
                const point = { x: obstruction.at.x, y: obstruction.at.y }, separation = Math.hypot(point.x - origin.x, point.y - origin.y);
                const danger = item.projectile.damage > 0 ? (item.projectile.aoeRadius || 0) * (1 - d.risk * .45) + 40 : 36;
                if (separation < danger || point.y >= ctx.state.arena.terrain.solidBottomTileRow * ctx.state.arena.tiles.chunksPerTile * 64)
                    continue;
                const allowance = Math.min(budget, Math.max(2, Math.floor(d.candidateBudget / 4)));
                const plan = await survey(obstruction.target, item, { target: point, goal: 'impact', preferHighArc: true,
                    minElevation: 5, maxElevation: 89, angleStep: ctx.core.clamp(Math.ceil(84 / allowance), 2, 30), maxCandidates: allowance,
                    maxSteps: 500000, maxCells: 1000000, terrain: 'materialize', tolerance: 18 }, 'demolition');
                if (!plan)
                    return false;
                if (plan.status === 'clear' && plan.solution)
                    return accept(obstruction.target, item, point, plan, 'Open an observed firing lane', true, 0);
            }
        if (valid()) {
            ctx.equipment.syncLoadout(p);
            if (!dragProbeInvalidated)
                for (const probe of dragProbes.sort((a, b) => a.score - b.score)) {
                    const now = tank.snapshot(), target = targetSnapshot(probe.target), before = probe.owner;
                    if (!valid() || !tank.isLive || !now || !target || now.liveId !== before.liveId
                        || Math.hypot(now.x - before.x, now.y - before.y) > 1
                        || Math.abs(Math.atan2(Math.sin(now.angle - before.angle), Math.cos(now.angle - before.angle))) > .01
                        || Math.hypot(now.vx - before.vx, now.vy - before.vy) > 1
                        || Math.hypot(target.x - probe.targetPose.x, target.y - probe.targetPose.y) > 4
                        || ctx.economy.owned(p, probe.item.id) <= 0)
                        continue;
                    if (!tank.weapon.equip(probe.item.template) || tank.weapon.state?.equipped !== probe.item.template)
                        continue;
                    p.weaponId = probe.item.id;
                    ctx.economy.wallet(p).selected = probe.item.id;
                    ctx.economy.wallet(p).revision++;
                    ctx.economy.saveBank();
                    p.targetId = probe.target.entityId;
                    p.plannedTurn = turn;
                    p.tactic = 'Exploratory native arc · liquid drag uncertain';
                    p.fireSolution = { turn, weapon: probe.item.id, targetId: p.targetId, origin: { ...origin }, target,
                        point: probe.point, offsetX: probe.point.x - target.x, angle: probe.candidate.angle, power: probe.candidate.power,
                        kind: 'uncertain-tank', wind: talus.world.wind || 0 };
                    tank.blackboard.set('custom.indigoTarget', targetReference(probe.target, probe.point));
                    tank.blackboard.set('custom.aimAngle', probe.candidate.angle);
                    tank.blackboard.set('custom.aimPower', probe.candidate.power);
                    tank.blackboard.set('custom.decisionTurn', turn);
                    tank.blackboard.set('custom.aimPlan', JSON.parse(JSON.stringify(probe.plan)));
                    tank.blackboard.set('custom.aimRefusal', 'material-drag-not-supported');
                    tank.blackboard.set('custom.aiDecision', { turn, status: 'uncertain', reason: 'material-drag-not-supported',
                        tactic: p.tactic, target: p.targetId, item: probe.item.id, candidate: JSON.parse(JSON.stringify(probe.candidate)),
                        budgetRemaining: budget, trials, skipped });
                    ctx.session.persist();
                    ctx.menus.publish();
                    return true;
                }
            if (trials.some(t => t.reason === 'deflection-fields')) {
                const target = targets.find((r: any) => targetSnapshot(r)), at = targetSnapshot(target), trial = p.fieldProbeCount || 0;
                if (!at)
                    return false;
                p.fieldProbeCount = trial + 1;
                p.targetId = target.entityId;
                p.weaponId = 'standard';
                p.plannedTurn = turn;
                ctx.economy.wallet(p).selected = 'standard';
                ctx.economy.wallet(p).revision++;
                ctx.economy.saveBank();
                tank.weapon.equip(ctx.economy.itemById('standard').template);
                const powers = [.25, .4, .55, .7, .85], elevation = trial % 2 ? 72 : 83;
                const best = provenShot(p, target.entityId, 'standard', origin, at, true);
                const angle = best?.angle ?? -(at.x < origin.x ? 180 - elevation : elevation) * Math.PI / 180;
                const power = best?.power ?? powers[trial % powers.length];
                tank.blackboard.set('custom.indigoTarget', targetReference(target, at));
                tank.blackboard.set('custom.aimAngle', angle);
                tank.blackboard.set('custom.aimPower', power);
                tank.blackboard.set('custom.decisionTurn', turn);
                tank.blackboard.set('custom.aimPlan', null);
                tank.blackboard.set('custom.aimRefusal', 'deflection-fields');
                p.fireSolution = { turn, weapon: 'standard', targetId: target.entityId, origin: { ...origin }, target: at,
                    point: at, offsetX: 0, angle, power, kind: 'field', wind: talus.world.wind || 0,
                    ...(best ? { guidance: best.guidance || null } : {}) };
                p.tactic = best ? 'Repeat observed hit through magnetic field · uncertain' : 'Exploratory high arc through magnetic field';
                ctx.session.persist();
                ctx.menus.publish();
                return true;
            }
            tank.blackboard.set('custom.aiDecision', { turn, status: 'refused', trials, skipped, budgetRemaining: budget });
        }
        return false;
    }
    return { personaFor, doctrine, aiRandom, targetSnapshot, targetReference, selectTarget, cpuWeaponUnavailable, fireControl, comparableShot, provenShot, observeCpuShot, refreshSpecialShot, planCpuShot };
}
export = create;
