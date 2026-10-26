/** Purchased, single-volley guidance and contact fuses using native shot controls. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    let planning = false;
    function compatible(item: any, id: string): boolean {
        return !!(item?.enabled && item.projectile?.kind === 'rigid-body' && item.projectile.speed > 0
            && !item.noCombatRewards && !item.projectile.homing && (item.projectile.projectilesPerShot || 1) === 1
            && !['burst', 'terrain', 'battery-blast'].includes(item.behavior?.mode)
            && (id !== 'ballistic-guidance' || !item.projectile.bouncing));
    }
    function arm(p: any, id: string): boolean {
        const item = ctx.economy.itemById(id);
        if (!ctx.core.human() || p !== ctx.core.current() || !item?.enabled || !item.attachment)
            return false;
        const key = item.attachment === 'contact' ? 'contactArmed' : 'guidanceArmed';
        if (p[key] === id) p[key] = null;
        else if (ctx.economy.owned(p, id) > 0 && compatible(ctx.economy.itemById(p.weaponId), id)) p[key] = id;
        else return false;
        ctx.session.persist();
        ctx.menus.publish();
        return true;
    }
    async function prepare(p: any): Promise<boolean> {
        if (planning)
            return false;
        p.guidanceSolution = null;
        const id = p.guidanceArmed, item = ctx.economy.itemById(p.weaponId);
        if (!id || !compatible(item, id) || ctx.economy.owned(p, id) < 1)
            return true;
        const target = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId));
        if (!target) {
            ctx.state.match.message = 'Choose a living target for guidance';
            ctx.menus.publish();
            return false;
        }
        if (id !== 'ballistic-guidance')
            return true;
        const e = ctx.core.entity(p), turn = ctx.state.match.turnNumber, token = ctx.state.utilityGeneration;
        const origin = { ...e.position! }, angle = -Number(e.blackboard.get('custom.angle')) * Math.PI / 180;
        const valid = () => ctx.core.active() && ctx.core.current() === p && ctx.state.match.turnNumber === turn
            && token === ctx.state.utilityGeneration && p.weaponId === item.id && p.guidanceArmed === id && e.isLive;
        planning = true;
        try {
            const plan = await e.weapon.plan({ target: { x: target.x, y: target.y }, targetEntityId: p.targetId,
                fixedAngle: angle, maxCandidates: 1, terrain: 'materialize', tolerance: 8, maxSteps: 500000, maxCells: 1000000 });
            while (valid() && talus.sim.paused)
                await talus.sleepTicks(1);
            if (!valid())
                return false;
            const now = e.position!, currentTarget = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId));
            if (plan.status !== 'clear' || !plan.solution || !currentTarget || Math.hypot(now.x - origin.x, now.y - origin.y) > 2
                || Math.hypot(currentTarget.x - target.x, currentTarget.y - target.y) > 2
                || Math.abs(angle + Number(e.blackboard.get('custom.angle')) * Math.PI / 180) > .001) {
                ctx.state.match.message = 'Ballistic guidance could not confirm this angle. Charge retained; adjust aim or disarm it.';
                ctx.menus.publish();
                return false;
            }
            e.blackboard.set('custom.power', plan.solution.power * 100);
            p.guidanceSolution = { origin, target, angle, hullAngle: e.snapshot()?.angle ?? 0 };
            ctx.combat.aim();
            return true;
        }
        finally { planning = false; }
    }
    function ready(p: any): boolean {
        if (p.guidanceArmed !== 'ballistic-guidance' || !p.guidanceSolution)
            return true;
        const e = ctx.core.entity(p), s = e.snapshot(), q = p.guidanceSolution;
        const target = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId));
        if (s && target && Math.hypot(s.x - q.origin.x, s.y - q.origin.y) <= 2
            && Math.hypot(target.x - q.target.x, target.y - q.target.y) <= 2
            && Math.abs(s.angle - q.hullAngle) <= .02
            && Math.abs(q.angle + Number(e.blackboard.get('custom.angle')) * Math.PI / 180) <= .001)
            return true;
        ctx.state.match.phase = 'turn';
        ctx.state.match.message = 'Firing position changed. Ballistic charge retained; aim again.';
        ctx.menus.input(p.control === 'human');
        ctx.session.persist();
        ctx.menus.publish();
        return false;
    }
    function armCpu(p: any): void {
        const item = ctx.economy.itemById(p.weaponId);
        // A contact fuse is useful for delayed ground shells. Leave learned ballistic solutions alone.
        if (item?.projectile?.detonate?.onTerrain === false && compatible(item, 'contact-trigger')
            && ctx.economy.owned(p, 'contact-trigger') > 0)
            p.contactArmed = 'contact-trigger';
    }
    function attach(p: any, attack: any): void {
        const item = ctx.economy.itemById(attack.item);
        for (const key of ['guidanceArmed', 'contactArmed']) {
            const id = p[key];
            if (!id || !ctx.economy.itemById(id)?.enabled || !ctx.economy.itemById(id)?.attachment
                || !compatible(item, id) || ctx.economy.owned(p, id) < 1)
                continue;
            if (key === 'guidanceArmed' && !attack.targetAtLaunch)
                continue;
            ctx.economy.wallet(p).stock[id]--;
            ctx.economy.wallet(p).revision++;
            attack[key] = id;
            p[key] = null;
        }
        p.guidanceSolution = null;
    }
    function tickGuidance(): void {
        const a = ctx.state.match?.attack;
        if (!a || !['horz-guidance', 'vert-guidance'].includes(a.guidanceArmed) || a.rootId == null || talus.sim.paused)
            return;
        const projectile = talus.projectiles.get(a.rootId), s = projectile?.snapshot();
        if (!s || s.held)
            return;
        const target = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((p: any) => p.entityId === a.targetId));
        if (!target)
            return;
        const horizontal = a.guidanceArmed === 'horz-guidance', axis = horizontal ? 'y' : 'x';
        const previous = a.guidancePosition || a.origin;
        const offset = s[axis] - target[axis], prior = previous[axis] - target[axis];
        const crossed = Math.abs(offset) <= 4 || Math.sign(offset) !== Math.sign(prior);
        a.guidancePosition = { x: s.x, y: s.y };
        if (!a.guidanceLock && crossed && (horizontal || s.y < target.y)) {
            a.guidanceLock = { speed: Math.max(40, Math.hypot(s.vx, s.vy)), target: { x: target.x, y: target.y } };
        }
        if (!a.guidanceLock)
            return;
        const lock = a.guidanceLock, speed = lock.speed;
        // Set velocity through the engine; real swept collision, gravity and flight residency still apply.
        if (horizontal) projectile!.setVelocity(Math.sign(lock.target.x - s.x) * speed, ctx.core.clamp((lock.target.y - s.y) * 30, -speed / 4, speed / 4));
        else projectile!.setVelocity(ctx.core.clamp((lock.target.x - s.x) * 30, -speed / 4, speed / 4), speed);
    }
    function contact(projectile: Projectile, id: number): void {
        const a = ctx.state.match?.attack;
        if (a?.contactArmed === 'contact-trigger' && a.rootId === id && projectile.exists)
            projectile.detonate();
    }
    function bind() {
        for (const id of ['ballistic-guidance', 'horz-guidance', 'vert-guidance', 'contact-trigger'])
            talus.on('menu.hud.arm-' + id, () => arm(ctx.core.current(), id));
    }
    return { compatible, arm, prepare, ready, armCpu, attach, tickGuidance, contact, bind };
}
export = create;
