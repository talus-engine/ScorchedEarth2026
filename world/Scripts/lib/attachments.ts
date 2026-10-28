/** Purchased guidance and fuses staged through the native finite cast ledger. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    let planning = false;
    const specs: Record<string, CastAccessorySpec> = {
        'horz-guidance': { id: 'scorched-earth:horz-guidance', ops: [{ field: 'axisGuidance', op: 'set', value: {
            axis: 'horizontal', direction: 'target', turnRate: 12, captureWidth: 4, delay: 0, lineGain: 30, maxCorrection: .25
        } }] },
        'vert-guidance': { id: 'scorched-earth:vert-guidance', ops: [{ field: 'axisGuidance', op: 'set', value: {
            axis: 'vertical', direction: 'positive', turnRate: 12, captureWidth: 4, delay: 0, lineGain: 30, maxCorrection: .25
        } }] },
        'heat-guidance': { id: 'scorched-earth:heat-guidance', ops: [{ field: 'homing', op: 'set', value: 2.5 }] },
        'contact-trigger': { id: 'scorched-earth:contact-trigger', ops: [
            { field: 'detonate.onBody', op: 'set', value: true },
            { field: 'detonate.onTerrain', op: 'set', value: true }
        ] }
    };
    const nativeIds = Object.values(specs).map(spec => spec.id);
    function sameJson(a: any, b: any): boolean {
        if (a === b)
            return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b))
            return false;
        return Object.keys(a).length === Object.keys(b).length
            && Object.keys(a).every(key => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
    }
    function compatible(item: any, id: string): boolean {
        const shot = item?.projectile;
        if (!item?.enabled || !shot || !['rigid-body', 'particle'].includes(shot.kind) || shot.speed <= 0
            || item.noCombatRewards || ['burst', 'terrain', 'battery-blast'].includes(item.behavior?.mode))
            return false;
        if (id === 'contact-trigger')
            return shot.kind === 'rigid-body' && !shot.excavation;
        if (shot.homing || shot.axisGuidance)
            return false;
        if (id === 'ballistic-guidance')
            return shot.kind === 'rigid-body' && !shot.bouncing && !shot.excavation && (shot.projectilesPerShot || 1) === 1;
        return Object.hasOwn(specs, id);
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
        if (!clear(p))
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
        p.guidanceArmed = null;
        // A contact fuse is useful for delayed ground shells. Leave learned ballistic solutions alone.
        if (item?.projectile?.detonate?.onTerrain === false && compatible(item, 'contact-trigger')
            && ctx.economy.owned(p, 'contact-trigger') > 0)
            p.contactArmed = 'contact-trigger';
        if (p.fireSolution && Object.hasOwn(p.fireSolution, 'guidance')) {
            const id = p.fireSolution.guidance, accessory = id && ctx.economy.itemById(id);
            if (accessory?.enabled && accessory.attachment === 'guidance'
                && compatible(item, id) && ctx.economy.owned(p, id) > 0)
                p.guidanceArmed = id;
            return;
        }
        if (['uncertain-tank', 'special'].includes(p.fireSolution?.kind) && ctx.economy.itemById('heat-guidance')?.enabled
            && compatible(item, 'heat-guidance') && ctx.economy.owned(p, 'heat-guidance') > 0) {
            const tank = ctx.core.entity(p), target = ctx.aiming.targetSnapshot(ctx.state.match.roster.find((r: any) => r.entityId === p.targetId));
            if (!target || ctx.aiming.provenShot(p, p.targetId, p.weaponId, tank.position!, target, true))
                return;
            p.guidanceArmed = 'heat-guidance';
        }
    }
    function refuse(message: string): false {
        ctx.state.match.message = message;
        ctx.menus.publish();
        return false;
    }
    function clear(p: any): boolean {
        const weapon = ctx.core.entity(p)?.weapon, stock = weapon?.accessories;
        if (!stock)
            return true;
        if (stock.reservations.length)
            return refuse('The previous cast is still queued. Its attachment charge is reserved.');
        if (stock.armed.some(id => !nativeIds.includes(id)))
            return refuse('This cannon has an unrecognized native accessory selected.');
        return !stock.armed.length || weapon!.armAccessories([]);
    }
    function stage(p: any, attack: any): boolean {
        const weapon = ctx.core.entity(p)?.weapon, item = ctx.economy.itemById(attack.item);
        if (!weapon || !clear(p))
            return false;
        const ids: string[] = [];
        for (const key of ['guidanceArmed', 'contactArmed']) {
            const id = p[key];
            if (!id)
                continue;
            const accessory = ctx.economy.itemById(id);
            if (!accessory?.enabled || !accessory.attachment || !compatible(item, id) || ctx.economy.owned(p, id) < 1)
                return refuse('The selected attachment is unavailable for this cannon. Disarm it or choose another weapon.');
            if (key === 'guidanceArmed' && !attack.targetAtLaunch)
                return refuse('Choose a living target for guidance. The charge is retained.');
            ids.push(id);
        }
        const native = ids.filter(id => Object.hasOwn(specs, id));
        for (const id of native) {
            const spec = specs[id], entry = weapon.accessories?.entries.find(e => e.spec.id === spec.id);
            if (entry && (entry.charges > 1 || !sameJson(entry.spec.ops, spec.ops)))
                return refuse('The native attachment stock does not match this cannon configuration.');
            // One purchased charge backs one native reservation. A refused cast retains it for retry.
            if ((!entry || entry.charges === 0) && !weapon.grantAccessory(spec, 1))
                return refuse('The cannon could not reserve its attachment. The charge is retained.');
        }
        if (native.length && !weapon.armAccessories(native.map(id => specs[id].id)))
            return refuse('The cannon could not arm its attachment. The charge is retained.');
        const armed = weapon.accessories?.armed || [];
        if (JSON.stringify(armed) !== JSON.stringify(native.map(id => specs[id].id)))
            return refuse('The native attachment selection did not match the requested cast.');
        attack.accessoryIds = ids;
        attack.accessoriesPaid = false;
        return true;
    }
    function attach(p: any, attack: any): void {
        if (attack.accessoriesPaid)
            return;
        const ids: string[] = attack.accessoryIds || [];
        if (ids.some(id => ctx.economy.owned(p, id) < 1))
            throw new Error('Native cast launched without its purchased attachment');
        const wallet = ctx.economy.wallet(p);
        for (const id of ids) {
            wallet.stock[id]--;
            const key = ctx.economy.itemById(id).attachment === 'contact' ? 'contactArmed' : 'guidanceArmed';
            attack[key] = id;
            if (p[key] === id)
                p[key] = null;
        }
        if (ids.length)
            wallet.revision++;
        // projectile.launch is native acceptance. Rigid callbacks can precede the ledger's decrement.
        // The attack receipt prevents root multiplicity or owner death from charging a second time.
        attack.accessoriesPaid = true;
        p.guidanceSolution = null;
    }
    function bind() {
        for (const id of ['ballistic-guidance', ...Object.keys(specs)])
            talus.on('menu.hud.arm-' + id, () => arm(ctx.core.current(), id));
    }
    return { compatible, arm, prepare, ready, armCpu, clear, stage, attach, bind };
}
export = create;
