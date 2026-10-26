/** Configuration loading and match initialization. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    async function boot(): Promise<void> {
        if (ctx.state.booting || ctx.state.booted)
            return;
        ctx.state.booting = true;
        try {
            ctx.state.arena = JSON.parse((await talus.files.readText('Game/arena.json'))!);
            ctx.state.chaosCatalog = JSON.parse((await talus.files.readText('Game/chaos.json'))!);
            ctx.state.quipCatalog = JSON.parse((await talus.files.readText('Game/quips.json'))!);
            ctx.state.market = JSON.parse((await talus.files.readText('Game/shop.json'))!);
            ctx.state.generationRecipes = JSON.parse((await talus.files.readText('Game/generation.json'))!);
            ctx.state.personaCatalog = JSON.parse((await talus.files.readText('Game/personas.json'))!);
            ctx.state.soundCatalog = JSON.parse(await talus.files.readText('Game/audio.json') || '{}');
            ctx.state.supplyCatalog = JSON.parse((await talus.files.readText('Game/supply-drops.json'))!);
            talus.ui.damageTextStyle(ctx.state.damageTextStyle);
            ctx.state.market.categories.forEach((name: string, index: number) => talus.on('menu.custom.category-' + index, () => { ctx.state.shopCategory = name; ctx.economy.publishShop(); }));
            for (const item of ctx.state.market.items) {
                talus.on('menu.custom.buy-' + item.id, e => {
                    if (!ctx.state.shopOpen || !ctx.state.match)
                        return;
                    const p = ctx.state.match.roster[ctx.state.shopIndex];
                    if (String(e.values?.account) !== ctx.economy.playerKey(p))
                        return;
                    if (ctx.economy.purchase(p, item.id, Number(e.values?.revision))) {
                        ctx.economy.publishShop();
                        ctx.menus.publish();
                    }
                });
                if (item.kind === 'weapon')
                    talus.on('menu.hud.equip-' + item.id, () => {
                        if (!ctx.state.shopOpen && (ctx.core.human() || ctx.state.match?.phase === 'ready'))
                            ctx.equipment.chooseWeapon(ctx.core.current(), item.id);
                    });
            }
            if (ctx.state.quipCatalog.shooting.length !== 500 || ctx.state.quipCatalog.death.length !== 500)
                throw new Error('The dialogue catalog requires 500 shooting lines and 500 last words');
            talus.ui.set('speech', []);
            if (!ctx.state.chaosCatalog.effects.some((fx: any) => fx.enabled))
                throw new Error('The death-effect catalog has no enabled effects');
            talus.camera.setZoom(0.25);
            talus.camera.follow('off');
            talus.camera.frame(null);
            ctx.state.cameraIntent = null;
            talus.ui.set('frameNotice', '');
            for (const p of talus.players.list()) {
                p.inputEnabled = false;
                p.release();
            }
            ctx.state.match = talus.state.getJson('indigo.match');
            if (!ctx.state.match) {
                const params: any = talus.game.params;
                if (params?.deploy !== 'yes') {
                    ctx.menus.showSetup();
                    ctx.state.booted = true;
                    return;
                }
                ctx.generation.configureGeneration(talus.world.generation.status().recipeId || (params.generation === 'brush' ? 'brush' : 'wfc'));
                try {
                    ctx.state.match = ctx.menus.validate(params);
                }
                catch (err) {
                    talus.ui.set('error', String(err));
                    ctx.menus.showSetup();
                    ctx.state.booted = true;
                    return;
                }
                ctx.session.persist();
                const saved: any = talus.installed.get('indigo') || {};
                talus.installed.set('indigo', { ...saved, humans: ctx.state.match.humans, computers: ctx.state.match.computers,
                    turnSeconds: ctx.state.match.turnSeconds, cpuSkill: ctx.state.match.cpuSkill, seriesLength: ctx.state.match.seriesLength, biomeCycle: ctx.state.match.biomeCycle ? 'cycle' : 'random', biomeRounds: ctx.state.match.biomeRounds, generation: ctx.state.match.generation, namesText: ctx.state.match.roster.map((p: any) => p.name).join('\n') });
            }
            ctx.session.persist();
            if (ctx.state.match.generation === 'brush' && ctx.state.arena.bounds.x === 0)
                ctx.generation.configureGeneration('brush');
            else if (ctx.state.match.generation !== 'brush')
                ctx.generation.configureGeneration(ctx.state.match.generation);
            if (ctx.state.match.attack)
                throw new Error('An attack was interrupted by loading. Native projectile/cast persistence is required; start a fresh match.');
            if (ctx.state.match.presentation.active) {
                const cue = ctx.state.match.presentation.active;
                cue.resumeStage = cue.resumeStage || (cue.stage === 'effect' ? 'effect' : 'speech');
                cue.stage = 'centering';
                cue.centerStarted = talus.sim.clock;
                if (cue.resumeStage !== 'effect')
                    cue.elapsed = 0;
            }
            ctx.economy.ensureWallets();
            for (const p of ctx.state.match.roster)
                p.autoAimTurn = null;
            for (const job of ctx.state.match.chaos.jobs)
                for (const id of job.projectileIds)
                    if (!talus.projectiles.get(id)?.exists)
                        throw new Error('A saved death shell is missing; engine projectile persistence is required.');
            talus.ui.closeMenu();
            talus.ui.hud('Menus/hud.html');
            if (ctx.state.match.phase === 'deploying') {
                const generation = talus.world.generation.status();
                if (generation.phase === 'failed')
                    throw new Error('Native terrain generation: ' + generation.reason);
                await ctx.generation.prepareProcedural();
                if (ctx.state.match.generation === 'brush')
                    await ctx.brushes.generateBrushArena();
                else if (ctx.state.generationRecipes.hybrid.recipes.includes(ctx.state.match.generation)) {
                    await ctx.landscape.generateStoryMacro();
                    await ctx.brushes.prepareClearance();
                    await ctx.brushes.generateBrushDetails();
                    await ctx.brushes.generateStructures();
                    await ctx.brushes.generateLivingArena();
                    await ctx.brushes.clearCombatSpace();
                    await ctx.landscape.generateStoryMechanisms();
                }
                else if (ctx.state.match.generation === 'bramble-badlands') {
                    await ctx.landscape.generateStoryMacro();
                    await ctx.brushes.prepareClearance();
                    await ctx.brushes.generateLivingArena();
                    await ctx.brushes.clearCombatSpace();
                    await ctx.landscape.generateStoryMechanisms();
                }
                for (const p of ctx.state.match.roster) {
                    if (p.entityId && p.placementReady)
                        continue;
                    ctx.state.match.message = 'Deploying ' + (p.index + 1) + ' / ' + ctx.state.match.roster.length;
                    ctx.menus.publish();
                    const placement = p.entityId ? { x: p.spawnX, y: p.surfaceY } : await ctx.generation.deploymentGround(p);
                    const ground = placement.y;
                    const tank = p.entityId ? ctx.core.entity(p) : await talus.entities.spawn(p.templateId || ctx.state.arena.tankTemplate, placement.x, ground - 48);
                    if (!tank)
                        throw new Error('Tank spawn refused: ' + p.name);
                    p.entityId = tank.id;
                    p.spawnX = placement.x;
                    p.surfaceY = ground;
                    ctx.session.persist();
                    const spawnAngle = p.index < ctx.state.match.roster.length / 2 ? 0 : 180;
                    tank.blackboard.set('name', p.name);
                    tank.blackboard.set('custom.indigoPlayer', p.index);
                    tank.blackboard.set('custom.control', p.control);
                    tank.blackboard.set('custom.angle', spawnAngle);
                    tank.blackboard.set('custom.power', 70);
                    if (!await tank.whenLive({ timeoutTicks: 600 }))
                        throw new Error('Tank did not become live');
                    await ctx.equipment.preparePlacement(p);
                    ctx.equipment.syncLoadout(p);
                    tank.weapon.aim(-spawnAngle * Math.PI / 180, .7);
                    ctx.presentation.nameplate(p);
                }
                ctx.state.match.phase = 'ready';
                ctx.state.match.message = 'Tanks ready — begin when your crew is ready';
                ctx.session.persist();
            }
            if (ctx.state.match.phase === 'flight') {
                ctx.state.shot = talus.projectiles.get(ctx.state.match.shotId);
                if (!ctx.state.shot?.exists)
                    throw new Error('The saved shot is missing. Projectile persistence needs engine investigation.');
            }
            else if (ctx.state.match.phase === 'firing')
                throw new Error('Save interrupted a queued shot; engine cast persistence needs investigation.');
            else if (ctx.state.match.phase === 'finished') {
                const scores: any = talus.installed.get('indigo.scores');
                talus.ui.set('scores', Object.values(scores?.players || {}));
            }
            for (const p of ctx.state.match.roster)
                if (!p.eliminated && (p !== ctx.core.current() || ['ready', 'finished'].includes(ctx.state.match.phase)))
                    ctx.equipment.passivePosture(p);
            const resumePositioning = ctx.state.match.phase === 'positioning';
            if (resumePositioning)
                ctx.state.match.phase = 'turn';
            if (ctx.state.match.phase === 'turn' && !resumePositioning)
                ctx.state.match.phase = 'refocusing';
            ctx.state.booted = true;
            ctx.state.booting = false;
            for (const p of ctx.state.match.roster)
                ctx.presentation.nameplate(p);
            for (const p of ctx.state.match.roster) {
                const persona = ctx.state.personaCatalog.personas.find((v: any) => v.id === p.personaId);
                if (persona && ctx.core.entity(p).can('blackboard.set')) {
                    ctx.core.entity(p).blackboard.set('factionId', persona.factionId);
                    ctx.core.entity(p).blackboard.set('custom.persona', persona);
                }
            }
            if (!talus.encounters.get('scorched-terra')) {
                const members = ctx.state.match.roster.filter((p: any) => p.entityId && ctx.core.entity(p).can('blackboard.set'));
                if (members.length) {
                    const encounter = talus.encounters.set('scorched-terra', {
                        mode: 'free-for-all', selfDamage: true, members: members.map((p: any) => ({ entity: p.entityId })),
                    });
                    if (!encounter.accepted)
                        throw new Error('Combat encounter: ' + encounter.reason);
                }
            }
            if (ctx.state.match.presentation.active) {
                const cue = ctx.state.match.presentation.active, p = ctx.state.match.roster.find((r: any) => r.entityId === cue.owner);
                ctx.presentation.speech(p, null);
            }
            ctx.menus.input(false);
            if (ctx.state.match.phase === 'settling')
                ctx.session.run(ctx.turns.settle);
            if (resumePositioning)
                ctx.session.run(ctx.combat.fire);
            else if (['ready', 'focusing', 'refocusing'].includes(ctx.state.match.phase))
                ctx.session.run(ctx.presentation.restoreFocusAfterBoot);
            ctx.menus.publish();
            talus.state.set('indigo.error', '');
            if (ctx.state.match.phase === 'finished') {
                ctx.state.match.resultsShown = true;
                if (!ctx.turns.automaticSeries() || ctx.state.match.nextRoundRequest)
                    ctx.economy.openShop();
            }
        }
        finally {
            ctx.state.booting = false;
        }
    }
    function bind() {
        talus.on('world.game-started', () => ctx.session.run(boot));
        talus.on('world.game-loaded', () => ctx.session.run(boot));
        talus.after(1, () => ctx.session.run(boot));
        talus.on('tick.sim.post', () => {
            if (!ctx.state.booted || ctx.state.booting || !ctx.state.match || !ctx.state.bank || ctx.state.match.phase === 'fault')
                return;
            try {
                ctx.residency.refreshRestoredTanks();
                for (const p of ctx.state.match.roster)
                    if (!p.eliminated && p.entityId && ctx.core.entity(p)?.isLive) {
                        ctx.equipment.syncUtilities(p);
                        if (ctx.state.match.turnNumber > 0)
                            ctx.equipment.autoDefend(p);
                    }
            }
            catch (error) {
                ctx.session.fail(error);
            }
        });
        talus.on('tick.sim.pre', e => {
            if (ctx.state.booted && !ctx.state.booting && ctx.state.match && ctx.state.arena && ctx.state.match.phase !== 'fault' && !ctx.core.presenting()) {
                try {
                    const point = ctx.state.match.phase === 'flight' ? ctx.state.shot?.snapshot() : ctx.state.match.phase === 'settling' ? ctx.state.match.impact : null;
                    if (point)
                        ctx.camera.cameraPoint(point, ctx.state.match.phase === 'flight' ? 'projectile' : 'impact');
                    else if (['ready', 'turn'].includes(ctx.state.match.phase) && !ctx.core.current().eliminated)
                        ctx.camera.cameraTank(ctx.core.current());
                }
                catch (error) {
                    ctx.session.fail(error);
                    return;
                }
            }
            if (!ctx.state.booted || ctx.state.booting || !ctx.state.match || ctx.state.match.phase === 'fault')
                return;
            if (ctx.state.match.phase === 'finished') {
                ctx.session.run(ctx.turns.advanceCpuRound);
                return;
            }
            if (ctx.state.match.phase !== 'finished') {
                try {
                    ctx.presentation.tickPresentation();
                    ctx.combat.tickAttack();
                    ctx.chaos.tickChaos(e.dt);
                }
                catch (error) {
                    ctx.session.fail(error);
                    return;
                }
            }
            ctx.state.ticks++;
            if (ctx.state.ticks % 6 === 0) {
                ctx.residency.checkRoster();
                try {
                    ctx.supplies.tickSupplies();
                }
                catch (error) {
                    ctx.session.fail(error);
                    return;
                }
                if (ctx.economy.itemById('parachute').enabled && !['ready', 'deploying', 'finished', 'fault'].includes(ctx.state.match.phase)) {
                    for (const p of ctx.state.match.roster) {
                        const e = ctx.core.entity(p);
                        if (p.control === 'cpu' && !p.eliminated && e?.isLive && e.alive && !e.controller.fallBrake?.deployed
                            && (e.velocity?.y ?? 0) > ctx.economy.itemById('parachute').cpuDeploySpeed)
                            ctx.equipment.useParachute(p);
                    }
                }
                if (ctx.core.active() && ctx.state.match.roster.filter((p: any) => !p.eliminated).length <= 1)
                    ctx.turns.finish();
                if (!ctx.core.active())
                    ctx.menus.publish();
            }
            if (ctx.state.match.pendingTurn !== null && !ctx.core.presenting() && !ctx.state.match.attack) {
                const next = ctx.state.match.pendingTurn;
                ctx.state.match.pendingTurn = null;
                ctx.session.run(() => ctx.turns.beginTurn(next));
                return;
            }
            if (ctx.state.match.phase === 'aftermath') {
                ctx.turns.finish();
                return;
            }
            if (ctx.state.match.phase === 'flight') {
                if (++ctx.state.match.waitTicks > 3600)
                    ctx.session.fail('Projectile did not resolve within 60 seconds');
                return;
            }
            if (ctx.state.match.phase === 'firing') {
                if (++ctx.state.match.waitTicks > 180)
                    ctx.session.fail('Cannon trigger produced no projectile');
                return;
            }
            if (!ctx.core.active())
                return;
            if (ctx.core.current().eliminated) {
                ctx.session.run(() => ctx.turns.beginTurn(true));
                return;
            }
            const tank = ctx.core.entity(ctx.core.current()), s = tank.snapshot();
            ctx.state.match.remaining = Math.max(0, ctx.state.match.remaining - e.dt);
            if (ctx.core.human() && tank.isLive && s) {
                const a = talus.players.get(0)?.readInput()?.actions || {};
                if (ctx.economy.itemById('jetpack').enabled && tank.controller.state?.enabled)
                    tank.controller.levitate(!!a.tank_levitate && ctx.economy.owned(ctx.core.current(), 'jetpack') > 0);
                const diggingDirection = Number(!!a.tank_dig_right) - Number(!!a.tank_dig_left);
                if (diggingDirection)
                    ctx.session.run(() => ctx.equipment.dig(ctx.core.current(), diggingDirection));
                const requested = (Number(!!a.tank_move_right) - Number(!!a.tank_move_left)) * ctx.state.arena.moveSpeed;
                ctx.equipment.driveTank(ctx.core.current(), requested);
                const da = Number(!!a.tank_angle_up) - Number(!!a.tank_angle_down), dp = Number(!!a.tank_power_up) - Number(!!a.tank_power_down);
                if (da || dp)
                    ctx.combat.adjust(da * 30 * e.dt, dp * 30 * e.dt);
            }
            if (s && ctx.core.human()) {
                const distance = Math.abs(s.x - Number(ctx.core.current().lastMoveX ?? s.x));
                if (Math.abs(s.vx) > 1)
                    ctx.core.current().moveDistance += distance;
                ctx.core.current().lastMoveX = s.x;
                const units = Math.floor(ctx.core.current().moveDistance / 16);
                if (units) {
                    ctx.core.current().moveDistance -= units * 16;
                    ctx.economy.reward(ctx.core.current(), 'move', units);
                }
            }
            if (ctx.state.match.remaining <= 0) {
                if (ctx.core.current().control === 'cpu') {
                    if ((ctx.core.current().consecutivePasses || 0) >= (ctx.state.market.cpu.maxConsecutivePasses ?? 2) && ctx.cpu.prepareCpuEscape(ctx.core.current(), ctx.state.match.turnNumber))
                        ctx.session.run(ctx.combat.fire);
                    else
                        ctx.cpu.cpuNoAction(ctx.core.current(), 'Turn budget exhausted');
                }
                else {
                    ctx.economy.reward(ctx.core.current(), 'timeout');
                    ctx.session.run(() => ctx.turns.beginTurn(true));
                }
                return;
            }
            if (ctx.state.ticks % 6 === 0) {
                ctx.session.persist();
                ctx.menus.publish();
            }
        });
    }
    return { boot, bind };
}
export = create;
