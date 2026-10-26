/** CPU movement, escape tactics and turn decisions. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function cpuProgress(p: any): void {
        if (p.control !== 'cpu')
            return;
        p.consecutivePasses = 0;
        p.cpuStalled = null;
    }
    function cpuNoAction(p: any, reason: string): void {
        if (!ctx.core.active() || p !== ctx.core.current())
            return;
        const limit = ctx.state.market.cpu.maxConsecutivePasses ?? 2, count = p.consecutivePasses || 0;
        if (count < limit) {
            p.consecutivePasses = count + 1;
            p.tactic = 'Blocked corridor · pass ' + p.consecutivePasses + '/' + limit;
            ctx.economy.reward(p, 'pass');
            ctx.session.run(() => ctx.turns.beginTurn(true));
            return;
        }
        p.cpuStalled = { turn: ctx.state.match.turnNumber, reason, clock: talus.sim.clock };
        p.tactic = 'Blocked: no useful legal action; inspection needed';
        ctx.state.match.message = p.name + ' is blocked. No safe shot or eligible escape terrain. Resume retries; Game menu saves.';
        ctx.menus.input(false);
        ctx.session.persist();
        ctx.menus.publish();
        talus.sim.pause();
        talus.ui.openMenu('Menus/pause.html');
    }
    function retryStalledCpu(): void {
        if (!ctx.state.match || ctx.state.match.phase !== 'turn' || !ctx.core.current().cpuStalled)
            return;
        const p = ctx.core.current();
        p.cpuStalled = null;
        talus.sim.resume();
        ctx.session.run(() => ctx.cpu.prepareCpuTurn(p, ctx.state.match.turnNumber));
    }
    function prepareCpuEscape(p: any, turn: number): boolean {
        if (!ctx.core.active() || ctx.core.current() !== p || ctx.state.match.turnNumber !== turn)
            return false;
        const item = ctx.economy.itemById('escape-charge'), tank = ctx.core.entity(p), at = tank.position;
        if (!item?.enabled || !item.template || !at) {
            return false;
        }
        const b = item.behavior, floor = ctx.state.arena.terrain.solidBottomTileRow * ctx.state.arena.tiles.chunksPerTile * 64;
        const names = new Set(b.materials.map((m: any) => m.name)), others = ctx.state.match.roster.filter((r: any) => r !== p && ctx.aiming.targetSnapshot(r));
        const toward = others.length ? Math.sign(ctx.core.entity(others[0]).x! - at.x) || 1 : 1;
        const angles = toward > 0 ? [-.35, -.8, -1.2, -Math.PI / 2, -2, -2.5, -2.8] : [-2.8, -2.5, -2, -Math.PI / 2, -1.2, -.8, -.35];
        const candidates: any[] = [];
        for (const angle of angles) {
            const dx = Math.cos(angle), dy = Math.sin(angle), origin = { x: at.x + dx * item.projectile.spawnOffset, y: at.y + dy * item.projectile.spawnOffset };
            const cells: any[] = [];
            for (const fraction of [.25, .5, .85])
                for (const across of [-.65, 0, .65]) {
                    const advance = b.length * fraction, half = b.width * fraction / 2;
                    const x = Math.round(origin.x + dx * advance - dy * half * across), y = Math.round(origin.y + dy * advance + dx * half * across);
                    if (x < ctx.state.arena.bounds.x || x >= ctx.state.arena.bounds.x + ctx.state.arena.bounds.w || y < ctx.state.arena.bounds.y || y >= floor)
                        continue;
                    const cell = talus.world.cell(x, y);
                    if (cell?.element && !cell.body && !cell.entity && names.has(cell.element.name))
                        cells.push({ x, y, element: cell.element.name });
                }
            if (cells.length)
                candidates.push({ angle, cells });
        }
        const choice = candidates.sort((a, b) => b.cells.length - a.cells.length)[0];
        if (!choice) {
            return false;
        }
        if (!ctx.equipment.chooseWeapon(p, item.id)) {
            return false;
        }
        tank.blackboard.set('custom.angle', -choice.angle * 180 / Math.PI);
        tank.blackboard.set('custom.power', 100);
        tank.blackboard.set('custom.aimPlan', null);
        tank.blackboard.set('custom.aimRefusal', null);
        p.plannedTurn = turn;
        p.aimedTurn = turn;
        p.tactic = 'Free Riot Charge · clear nearby terrain';
        tank.blackboard.set('custom.aiDecision', { turn, item: item.id, template: item.template, tactic: p.tactic,
            coverage: 'observed-local-terrain-only', eligibleSamples: choice.cells, angle: choice.angle, consecutivePasses: p.consecutivePasses || 0 });
        ctx.session.persist();
        ctx.menus.publish();
        return true;
    }
    function explorationPath(p: any, direction: number): {
        x: number;
        y: number;
    } | null {
        const at = ctx.core.entity(p)?.snapshot(), half = ctx.state.arena.combat.tankHalfWidth;
        if (!at || !direction)
            return null;
        const x = at.x + direction * (half + 24);
        if (x < ctx.state.match.bounds.x + half || x > ctx.state.match.bounds.x + ctx.state.match.bounds.w - half)
            return null;
        const ground = talus.world.groundY(x, at.y - 18, 66);
        if (ground === null || ground < at.y - 16 || ground > at.y + 42)
            return null;
        if (talus.world.raycast({ x: at.x + direction * (half + 3), y: at.y - 10 }, { x, y: at.y - 10 }))
            return null;
        if (ctx.state.match.roster.some((r: any) => { const other = r !== p && ctx.aiming.targetSnapshot(r); return other && Math.hypot(other.x - x, other.y - at.y) < 58; }))
            return null;
        return { x, y: ground };
    }
    async function exploreCpu(p: any, turn: number, valid: () => boolean): Promise<void> {
        const style = ctx.aiming.doctrine(p).exploration;
        if (!style || p.exploredTurn === turn || !valid() || ctx.economy.owned(p, 'fuel-tank') <= 0 || ctx.state.match.remaining <= 4)
            return;
        p.exploredTurn = turn;
        if ((p.fireControls || []).some((m: any) => {
            const target = ctx.state.match.roster.find((r: any) => r.entityId === m.targetId), at = ctx.aiming.targetSnapshot(target);
            return at && ctx.economy.owned(p, m.weapon) > 0 && ctx.aiming.comparableShot(m.best, ctx.core.entity(p).position!, at, true);
        })) {
            return;
        }
        const roll = ctx.aiming.aiRandom(p);
        ctx.session.persist();
        if (roll >= style.chance)
            return;
        const e = ctx.core.entity(p), origin = e.position!, visits = p.exploredPositions || [];
        const crates = (ctx.state.match.supplies?.crates || []).filter((c: any) => c.state === 'available')
            .map((c: any) => talus.bodies.get(c.bodyId)?.snapshot()).filter((c: any) => c && Math.abs(c.x - origin.x) < 600);
        const candidates = [-1, 1].map(direction => {
            const at = explorationPath(p, direction);
            if (!at)
                return null;
            const novelty = visits.length ? Math.min(...visits.map((v: any) => Math.abs(v.x - at.x))) : 30;
            const supply = crates.length ? Math.min(...crates.map((c: any) => Math.abs(c.x - origin.x))) - Math.min(...crates.map((c: any) => Math.abs(c.x - at.x))) : 0;
            const score = Math.min(80, novelty) + (origin.y - at.y) * (style.preference === 'high-ground' ? 3 : 1)
                + supply * (style.preference === 'supplies' ? 3 : 1.5) + ctx.aiming.aiRandom(p) * 30;
            return { direction, at, score };
        }).filter(Boolean).sort((a: any, b: any) => b.score - a.score);
        const choice = candidates[0];
        if (!choice)
            return;
        const seconds = Math.min(style.seconds, ctx.state.match.remaining - 3);
        p.tactic = crates.length ? 'Investigating nearby supplies' : style.preference === 'high-ground' ? 'Scouting higher ground' : 'Exploring a fresh firing position';
        e.blackboard.set('custom.exploration', { turn, direction: choice.direction, from: { ...origin }, seconds, tactic: p.tactic });
        ctx.menus.publish();
        const until = talus.sim.clock + seconds;
        try {
            while (valid() && talus.sim.clock < until && ctx.state.match.remaining > 3 && ctx.economy.owned(p, 'fuel-tank') > 0) {
                if (!explorationPath(p, choice.direction))
                    break;
                ctx.equipment.driveTank(p, choice.direction * ctx.state.arena.moveSpeed);
                await talus.sleepTicks(3);
            }
        }
        finally {
            ctx.equipment.driveTank(p, 0);
        }
        const at = e.position;
        if (at) {
            p.exploredPositions = [...visits, { x: at.x, y: at.y }].slice(-8);
        }
        ctx.session.persist();
    }
    async function prepareCpuTurn(p: any, turn: number): Promise<void> {
        if (!ctx.core.active() || p.eliminated || ctx.core.current() !== p || ctx.state.match.turnNumber !== turn)
            return;
        const token = ctx.state.utilityGeneration, e = ctx.core.entity(p), beforePosition = { ...ctx.core.entity(p).position! }, beforeDig = ctx.economy.owned(p, 'digger');
        const valid = () => ctx.core.active() && !p.eliminated && ctx.core.current() === p && ctx.state.match.turnNumber === turn && token === ctx.state.utilityGeneration;
        if (p.preparedTurn !== turn) {
            p.preparedTurn = turn;
            ctx.equipment.syncUtilities(p);
            for (const id of ['shield', 'magnet'] as const)
                if (ctx.economy.owned(p, id) > 0 && !e.defenses.state?.[id === 'shield' ? 'shield' : 'deflector']?.active)
                    ctx.equipment.useDefense(p, id);
            const others = ctx.state.match.roster.filter((r: any) => r !== p && ctx.aiming.targetSnapshot(r));
            const target = others.sort((a: any, b: any) => Math.abs(ctx.core.entity(a).x! - e.x!) - Math.abs(ctx.core.entity(b).x! - e.x!))[0];
            const direction = target ? Math.sign(ctx.core.entity(target).x! - e.x!) : 1;
            const close = target && Math.abs(ctx.core.entity(target).x! - e.x!) < 100;
            const wall = talus.world.raycast({ x: e.x! + direction * 28, y: e.y! - 8 }, { x: e.x! + direction * 70, y: e.y! - 8 });
            const burrow = !!wall && (p.personaId === 'mole' || p.personaId === 'faultline') && ctx.economy.owned(p, 'digger') > 0;
            if (burrow) {
                const until = talus.sim.clock + ctx.state.market.cpu.digSeconds;
                while (valid() && talus.sim.clock < until && ctx.economy.owned(p, 'digger') > 0) {
                    await ctx.equipment.dig(p, direction);
                    if (!valid())
                        return;
                    ctx.equipment.driveTank(p, direction * ctx.state.arena.moveSpeed);
                    await talus.sleepTicks(1);
                }
            }
            else if ((close || wall) && ctx.economy.owned(p, 'fuel-tank') > 0) {
                const until = talus.sim.clock + ctx.state.market.cpu.driveSeconds;
                while (valid() && talus.sim.clock < until) {
                    ctx.equipment.driveTank(p, -direction * ctx.state.arena.moveSpeed);
                    await talus.sleepTicks(1);
                }
            }
            if (valid() && !wall && !close)
                await exploreCpu(p, turn, valid);
            if (valid() && wall && !burrow && ctx.economy.owned(p, 'jetpack') > 0 && ctx.economy.itemById('jetpack').enabled) {
                const held = e.controller.levitate(true);
                if (held.accepted) {
                    const until = talus.sim.clock + ctx.state.market.cpu.jetSeconds;
                    while (valid() && talus.sim.clock < until)
                        await talus.sleepTicks(1);
                    if (e.isLive)
                        e.controller.levitate(false);
                }
            }
        }
        if (!valid())
            return;
        ctx.equipment.driveTank(p, 0);
        const afterPosition = e.position!;
        if (Math.hypot(afterPosition.x - beforePosition.x, afterPosition.y - beforePosition.y) >= 4)
            cpuProgress(p);
        else if (ctx.economy.owned(p, 'digger') < beforeDig)
            cpuProgress(p);
        if ((p.consecutivePasses || 0) >= (ctx.state.market.cpu.maxConsecutivePasses ?? 2) && prepareCpuEscape(p, turn)) {
            await ctx.combat.fire();
            return;
        }
        const tilt = Math.abs(Math.atan2(Math.sin(e.snapshot()!.angle), Math.cos(e.snapshot()!.angle)));
        if (tilt >= ctx.state.arena.posture.cpuTiltRadians && ctx.equipment.flipUpright(p)) {
            for (let waited = 0; valid() && waited < ctx.state.arena.posture.cpuFlipWaitTicks; waited += 6) {
                if (!['moving', 'pending'].includes(e.controller.posture?.status || ''))
                    break;
                await talus.sleepTicks(6);
            }
        }
        if (!valid())
            return;
        const solved = await ctx.aiming.planCpuShot(p, turn);
        while (valid() && talus.sim.paused)
            await talus.sleepTicks(1);
        if (solved) {
            if (valid())
                e.runGraph(ctx.state.arena.cpuGraph, { turn });
        }
        else if (valid())
            cpuNoAction(p, 'No supported clear shot after bounded movement, escape and demolition alternatives');
    }
    function cpuPlan(e: any): void {
        if (!ctx.core.active() || (ctx.core.current().control !== 'cpu' && ctx.core.current().autoAimTurn !== ctx.state.match.turnNumber) || e.id !== ctx.core.current().entityId || e.turn !== ctx.state.match.turnNumber)
            return;
        const p = ctx.core.current(), tank = ctx.core.entity(p), origin = tank.position!;
        if (p.plannedTurn === ctx.state.match.turnNumber)
            return;
        p.plannedTurn = ctx.state.match.turnNumber;
        if (p.control === 'cpu' && (tank.health ?? 100) <= 70)
            ctx.equipment.useBattery(p);
        ctx.equipment.syncLoadout(p);
        const targets = ctx.state.match.roster.filter((r: any) => r !== p && ctx.aiming.targetSnapshot(r));
        const priority = (r: any) => { const s = ctx.aiming.targetSnapshot(r)!; return Math.abs(s.x - origin.x) + (s.health ?? 100) * 3; };
        targets.sort((a: any, b: any) => (p.control === 'human' && a.entityId === p.targetId ? -Infinity : priority(a)) - (p.control === 'human' && b.entityId === p.targetId ? -Infinity : priority(b)));
        if (!targets.length) {
            ctx.residency.checkRoster();
            ctx.turns.finish();
            return;
        }
        const target = ctx.aiming.targetSnapshot(targets[0])!;
        const carrier = ctx.economy.itemById(p.weaponId).behavior?.mode === 'apex';
        p.targetId = targets[0].entityId;
        p.tactic = carrier ? 'Surveyed carrier clearance to apex' : 'Surveyed ballistic corridor';
        tank.blackboard.set('custom.indigoTarget', ctx.aiming.targetReference(targets[0], target));
        tank.blackboard.set('custom.carrierToApex', carrier);
        ctx.session.persist();
        ctx.menus.publish();
    }
    function cpuAimed(e: any): void {
        if (!ctx.core.active() || (ctx.core.current().control !== 'cpu' && ctx.core.current().autoAimTurn !== ctx.state.match.turnNumber) || e.id !== ctx.core.current().entityId || e.turn !== ctx.state.match.turnNumber)
            return;
        const p = ctx.core.current(), tank = ctx.core.entity(p);
        if (p.aimedTurn === ctx.state.match.turnNumber)
            return;
        const angle = Number(tank.blackboard.get('custom.aimAngle')), power = Number(tank.blackboard.get('custom.aimPower'));
        if (!Number.isFinite(angle) || !Number.isFinite(power))
            throw new Error('Ballistic graph returned invalid aim');
        tank.blackboard.set('custom.angle', -angle * 180 / Math.PI);
        tank.blackboard.set('custom.power', ctx.core.clamp(power * 100, 0, 100));
        if (p.autoAimTurn === ctx.state.match.turnNumber) {
            p.autoAimTurn = null;
            ctx.economy.wallet(p).stock['lazy-boy'] = Math.max(0, ctx.economy.owned(p, 'lazy-boy') - 1);
            ctx.economy.wallet(p).revision++;
            ctx.economy.saveBank();
            ctx.economy.reward(p, 'utility');
            ctx.state.match.message = 'Lazy Boy set your angle and power. Fire when ready.';
        }
        p.aimedTurn = ctx.state.match.turnNumber;
        ctx.combat.aim();
        ctx.session.persist();
        ctx.menus.publish();
        ctx.economy.reward(p, 'aim');
        ctx.economy.reward(p, 'power');
    }
    function bind() {
        talus.on('menu.pause.resume', retryStalledCpu);
        talus.on('menu.custom.resume', retryStalledCpu);
        talus.on('indigo:cpu-plan', cpuPlan);
        talus.on('indigo:cpu-aimed', cpuAimed);
        talus.on('indigo:cpu-unreachable', e => {
            if (ctx.core.active() && e.id === ctx.core.current().entityId && e.turn === ctx.state.match.turnNumber && ctx.core.current().autoAimTurn === ctx.state.match.turnNumber) {
                ctx.core.current().autoAimTurn = null;
                ctx.state.match.message = 'Lazy Boy found no supported shot. Charge retained.';
                ctx.session.persist();
                ctx.menus.publish();
                if (ctx.core.current().control !== 'cpu')
                    return;
            }
            if (ctx.core.active() && ctx.core.current().control === 'cpu' && e.id === ctx.core.current().entityId && e.turn === ctx.state.match.turnNumber) {
                const p = ctx.core.current(), tank = ctx.core.entity(p);
                if (tank.blackboard.get('custom.aimRefusal') === 'deflection-fields') {
                    const target = tank.blackboard.get('custom.indigoTarget') as any;
                    tank.blackboard.set('custom.angle', target?.x < (tank.x ?? 0) ? 180 - ctx.state.market.cpu.fieldProbeAngle : ctx.state.market.cpu.fieldProbeAngle);
                    const powers = ctx.state.market.cpu.fieldProbePowers, trial = p.fieldProbeCount || 0;
                    const power = powers[trial % powers.length];
                    p.fieldProbeCount = trial + 1;
                    tank.blackboard.set('custom.power', power);
                    p.tactic = 'Exploratory shot through deflection field';
                    ctx.session.run(ctx.combat.fire);
                    return;
                }
                const reason = tank.blackboard.get('custom.aimRefusal') || 'Native aim graph refused the planned shot';
                cpuNoAction(p, String(reason));
            }
        });
        talus.on('indigo:cpu-fire', e => {
            if (ctx.core.active() && ctx.core.current().control === 'cpu' && e.id === ctx.core.current().entityId && e.turn === ctx.state.match.turnNumber)
                ctx.session.run(ctx.combat.fire);
        });
    }
    return { cpuProgress, cpuNoAction, retryStalledCpu, prepareCpuEscape, explorationPath, exploreCpu, prepareCpuTurn, cpuPlan, cpuAimed, bind };
}
export = create;
