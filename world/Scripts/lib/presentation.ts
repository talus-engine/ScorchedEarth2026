/** Arcade cards, persona dialogue and timed shot/death presentation. */
import type { Runtime, SpeechKind } from 'context';
function create(ctx: Runtime) {
    function showArcadeCard(eyebrow: string, title: string, sub: string, seconds = 1, color = '#ffd447', score = ''): Promise<boolean> {
        if (ctx.state.arcadeCard)
            throw new Error('An arcade transition is already active');
        ctx.menus.input(false);
        return new Promise(resolve => {
            const view = { id: ++ctx.state.arcadeSerial, eyebrow, title, sub, color, score, long: seconds > 1, radar: seconds === 1 && ctx.state.arcadeSerial % 2 === 0, receipt: eyebrow.includes('COMPLETE') };
            ctx.state.arcadeCard = { view, seconds, elapsed: 0, visible: false, resolve };
            ctx.session.persist();
        });
    }
    function cancelArcade(): void {
        const card = ctx.state.arcadeCard;
        ctx.state.arcadeCard = null;
        talus.ui.set('arcadeCards', []);
        if (card)
            card.resolve(false);
    }
    async function turnScoreCard(): Promise<void> {
        if (!ctx.state.match.turnNumber || ctx.state.match.lastCardTurn === ctx.state.match.turnNumber)
            return;
        const p = ctx.core.current();
        if (await showArcadeCard('TURN ' + ctx.state.match.turnNumber + ' COMPLETE', p.name, 'Every crater counts.', 1, p.color, p.kills + ' kills (+' + (p.kills - (p.turnStartKills || 0)) + ') · Turn cash +$' + (p.cashEarned - (p.turnStartCash || 0)).toFixed(2))) {
            ctx.state.match.lastCardTurn = ctx.state.match.turnNumber;
            ctx.session.persist();
        }
    }
    function dialogueDeck(): any {
        if (!ctx.state.quipDeck)
            ctx.state.quipDeck = talus.installed.get('indigo.dialogue') || {
                rng: ctx.core.chaosSeed(talus.world.id + ':dialogue'), bags: { shooting: [], death: [] }, last: {}
            };
        return ctx.state.quipDeck;
    }
    function nextPersonaShout(p: any, type: string): ShoutLine | null {
        const persona = ctx.state.personaCatalog?.personas.find((v: any) => v.id === p.personaId);
        if (!persona)
            return null;
        const pool = talus.factions.pool({ factionId: persona.factionId, type, fallback: 'default' });
        if (pool.status !== 'ready' || !pool.lines.length)
            return null;
        const deck = dialogueDeck();
        deck.personas ||= {};
        const key = persona.id + ':' + type, ids = pool.lines.map(line => line.id);
        const state = deck.personas[key] ||= { rng: ctx.core.chaosSeed(talus.world.id + ':voice:' + key), bag: [], last: null };
        state.bag = state.bag.filter((id: string) => ids.includes(id));
        if (!state.bag.length) {
            state.bag = [...ids];
            for (let i = state.bag.length - 1; i > 0; i--) {
                let x = state.rng | 0;
                x ^= x << 13;
                x ^= x >>> 17;
                x ^= x << 5;
                state.rng = x >>> 0;
                const j = Math.floor((x >>> 0) / 4294967296 * (i + 1));
                [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
            }
            if (state.bag.length > 1 && state.bag[state.bag.length - 1] === state.last)
                [state.bag[0], state.bag[state.bag.length - 1]] = [state.bag[state.bag.length - 1], state.bag[0]];
        }
        state.last = state.bag.pop();
        talus.installed.set('indigo.dialogue', deck);
        return pool.lines.find(line => line.id === state.last)!;
    }
    function nextQuip(kind: SpeechKind): any {
        dialogueDeck();
        const pool = ctx.state.quipCatalog[kind], bag: number[] = ctx.state.quipDeck.bags[kind];
        if (!bag.length) {
            for (let i = 0; i < pool.length; i++)
                bag.push(i);
            for (let i = bag.length - 1; i > 0; i--) {
                let x = ctx.state.quipDeck.rng | 0;
                x ^= x << 13;
                x ^= x >>> 17;
                x ^= x << 5;
                ctx.state.quipDeck.rng = x >>> 0;
                const j = Math.floor((x >>> 0) / 4294967296 * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            if (pool[bag[bag.length - 1]].id === ctx.state.quipDeck.last[kind])
                [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
        }
        const line = pool[bag.pop()!];
        ctx.state.quipDeck.last[kind] = line.id;
        talus.installed.set('indigo.dialogue', ctx.state.quipDeck);
        return line;
    }
    function nameplate(p: any): void {
        const tank = ctx.core.entity(p);
        if (tank?.isLive)
            talus.ui.nameplate(tank, { text: p.name, color: p.color, bar: 'health', offsetY: 80, showWhenDead: true });
    }
    function speech(p: any, text: string | null): void {
        if (p.personaId)
            talus.factions.holdSpeech(p.entityId, text !== null);
        const tank = ctx.core.entity(p), cue = ctx.state.match.presentation.active;
        const at = tank?.position || (cue?.owner === p.entityId ? { x: cue.x, y: cue.y } : p.lastKnownPosition);
        talus.ui.worldText('speech:' + p.entityId, text === null ? null : {
            entity: tank?.position ? tank : null, ...(at ? { at } : {}), text, offset: { x: 0, y: -110 }, size: 36,
            maxWidth: 720, lineHeight: 1.2, color: '#ffffff', outline: '#151120',
            background: '#151120d9', unavailable: 'retain',
        });
    }
    function say(p: any, kind: SpeechKind): any {
        const line = p.personaId ? nextPersonaShout(p, kind === 'shooting' ? 'taunt' : 'death') : nextQuip(kind);
        if (!line)
            return '';
        const tank = ctx.core.entity(p);
        if (tank?.can('blackboard.set'))
            tank.blackboard.set('custom.lastQuip', { id: line.id, text: line.text, kind, turn: ctx.state.match.turnNumber });
        speech(p, line.text);
        return line.text;
    }
    function holdDeathPose(cue: any): void {
        if (cue.kind !== 'death' || cue.stage === 'effect' || cue.resumeStage === 'effect')
            return;
        const tank = talus.entities.get(cue.owner);
        if (!tank?.isLive && !tank?.isFrozen)
            return;
        const previous = ctx.state.deathPoseHolds.get(cue.owner);
        if (previous?.liveId === tank.liveId && previous.until > talus.sim.clock + 10)
            return;
        const held = tank.controller.holdPose(120);
        if (!held.accepted)
            throw new Error('Native death pose refused for ' + cue.owner + ': ' + held.reason);
        ctx.state.deathPoseHolds.set(cue.owner, { liveId: tank.liveId, until: talus.sim.clock + held.seconds });
        const at = tank.position;
        if (at) {
            cue.x = at.x;
            cue.y = at.y;
        }
    }
    function queuePresentation(p: any, kind: SpeechKind, at?: {
        x: number | null;
        y: number | null;
    }): void {
        const position = at?.x != null && at.y != null ? at : ctx.core.entity(p)?.position || p.lastKnownPosition;
        if (!position)
            throw new Error('No position for ' + p.name + ' last words');
        if (kind === 'death') {
            ctx.state.match.presentation.queue = ctx.state.match.presentation.queue.filter((v: any) => v.owner !== p.entityId);
            if (ctx.state.match.presentation.active?.owner === p.entityId) {
                speech(p, null);
                ctx.state.match.presentation.active = null;
            }
            if (p === ctx.core.current() && ['telegraph', 'firing'].includes(ctx.state.match.phase) && !ctx.state.match.attack?.rootId) {
                ctx.state.match.phase = 'turn';
                ctx.state.match.attack = null;
                ctx.state.match.pendingTurn = true;
            }
        }
        p.lastKnownPosition = { x: Number(position.x), y: Number(position.y) };
        const cue = { owner: p.entityId, kind, ...p.lastKnownPosition, stage: 'centering', started: null, elapsed: 0 };
        ctx.state.match.presentation.queue.push(cue);
        holdDeathPose(cue);
        ctx.menus.input(false);
        ctx.session.persist();
    }
    function tickPresentation(): boolean {
        if (talus.sim.paused)
            return ctx.core.presenting();
        for (const queued of ctx.state.match.presentation.queue)
            holdDeathPose(queued);
        let cue = ctx.state.match.presentation.active;
        if (!cue) {
            cue = ctx.state.match.presentation.queue.shift();
            if (!cue)
                return false;
            const p = ctx.state.match.roster.find((r: any) => r.entityId === cue.owner);
            if (cue.kind === 'shooting' && p.eliminated)
                return true;
            cue.stage = 'centering';
            cue.centerStarted = talus.sim.clock;
            cue.elapsed = 0;
            ctx.state.match.presentation.active = cue;
            ctx.state.match.message = 'Following ' + p.name;
        }
        const p = ctx.state.match.roster.find((r: any) => r.entityId === cue.owner), tank = ctx.core.entity(p);
        holdDeathPose(cue);
        const at = tank?.position;
        if (at && cue.stage !== 'effect' && cue.resumeStage !== 'effect') {
            cue.x = at.x;
            cue.y = at.y;
        }
        const state = cue.kind === 'shooting' || cue.stage === 'centering' && at && cue.resumeStage !== 'effect'
            ? ctx.camera.cameraTank(p) : ctx.camera.cameraPoint(cue, 'death:' + cue.owner);
        if (cue.stage === 'centering') {
            const bodyReady = cue.kind === 'shooting' ? tank?.isLive : !at || tank?.isLive || tank?.isFrozen;
            if (!ctx.camera.cameraArrived(state) || !bodyReady) {
                if (talus.sim.clock - cue.centerStarted > 30)
                    throw new Error('Presentation camera did not arrive: ' + p.name + ' / ' + state.reason);
                if (ctx.state.ticks % 6 === 0)
                    ctx.session.persist();
                return true;
            }
            if (cue.resumeStage === 'effect') {
                cue.stage = 'effect';
                cue.started = talus.sim.clock - (cue.elapsed || 0);
            }
            else {
                cue.stage = 'speech';
                cue.started = talus.sim.clock;
                cue.elapsed = 0;
                if (cue.text === undefined)
                    cue.text = say(p, cue.kind);
                else
                    speech(p, cue.text);
                ctx.state.match.message = p.name + (cue.kind === 'death' ? ' has a few last words…' : ' takes aim…');
            }
            delete cue.resumeStage;
            ctx.session.persist();
            ctx.menus.publish();
            return true;
        }
        cue.elapsed = talus.sim.clock - cue.started;
        if (cue.stage === 'effect') {
            if (cue.elapsed < (ctx.state.chaosCatalog.deathWatchSeconds ?? 2.5)) {
                if (ctx.state.ticks % 6 === 0)
                    ctx.session.persist();
                return true;
            }
            ctx.state.match.presentation.active = null;
            ctx.session.persist();
            resumeAfterPresentation();
            return true;
        }
        if (cue.elapsed < 3) {
            if (ctx.state.ticks % 6 === 0)
                ctx.session.persist();
            return true;
        }
        speech(p, null);
        if (cue.kind === 'death') {
            if (tank?.isLive || tank?.isFrozen) {
                const released = tank.controller.holdPose(0);
                if (!released.accepted)
                    throw new Error('Native death pose release refused for ' + p.name);
            }
            ctx.state.deathPoseHolds.delete(p.entityId);
            ctx.chaos.queueChaos(p, at || cue);
            cue.stage = 'effect';
            cue.started = talus.sim.clock;
            cue.elapsed = 0;
        }
        else {
            ctx.state.match.presentation.active = null;
            if (!p.eliminated)
                ctx.combat.performAttack(p);
        }
        ctx.session.persist();
        resumeAfterPresentation();
        return true;
    }
    function resumeAfterPresentation(): void {
        if (!ctx.core.presenting() && ctx.state.match.phase === 'turn' && ctx.state.match.pendingTurn === null) {
            ctx.state.match.phase = 'refocusing';
            ctx.state.match.message = 'Returning to ' + ctx.core.current().name;
            ctx.menus.input(false);
            ctx.session.persist();
            ctx.menus.publish();
            ctx.session.run(resumeCurrentTurn);
        }
    }
    async function resumeCurrentTurn(): Promise<void> {
        const p = ctx.core.current(), turn = ctx.state.match.turnNumber;
        const ready = await ctx.camera.focus();
        if (ctx.state.match.phase !== 'refocusing' || ctx.core.current() !== p || ctx.state.match.turnNumber !== turn)
            return;
        ctx.state.match.phase = 'turn';
        ctx.state.match.message = p.control === 'human' ? 'Position, aim and fire' : 'Computer is choosing its shot';
        ctx.session.persist();
        ctx.menus.publish();
        if (!ready || p.eliminated) {
            ctx.session.run(() => ctx.turns.beginTurn(true));
            return;
        }
        ctx.menus.input(p.control === 'human');
        if (p.control === 'cpu')
            ctx.session.run(() => ctx.cpu.prepareCpuTurn(p, turn));
    }
    async function restoreFocusAfterBoot(): Promise<void> {
        if (ctx.state.match.phase === 'refocusing') {
            await resumeCurrentTurn();
            return;
        }
        const phase = ctx.state.match.phase;
        const pendingDrop = ctx.state.match.supplies?.crates.find((c: any) => c.id === ctx.state.match.supplies.active);
        if (phase === 'focusing' && pendingDrop && ctx.state.supplyCatalog)
            await ctx.supplies.watchSupply(pendingDrop);
        const ready = await ctx.camera.focus();
        if (ctx.state.match.phase !== phase)
            return;
        if (phase === 'ready') {
            if (!ready) {
                const survivor = ctx.state.match.roster.findIndex((p: any) => !p.eliminated);
                if (survivor >= 0 && survivor !== ctx.state.match.focusIndex) {
                    ctx.state.match.focusIndex = survivor;
                    ctx.session.persist();
                    await restoreFocusAfterBoot();
                    return;
                }
            }
            ctx.economy.openShop();
            return;
        }
        if (!ready) {
            ctx.state.match.phase = 'turn';
            ctx.session.run(() => ctx.turns.beginTurn(true));
            return;
        }
        if (phase === 'focusing')
            ctx.turns.startTurn();
    }
    function playCue(sound: 'turn' | 'fire' | 'death' | 'victory' | 'buy'): void {
        if (ctx.state.soundCatalog?.[sound])
            talus.audio.play({ sfxId: ctx.state.soundCatalog[sound], volume: sound === 'fire' ? .4 : .25,
                throttleKey: 'terra-' + sound, maxPerSecond: 4 });
    }
    function bind() {
        talus.on('tick.frame', e => {
            const dt = Math.max(0, Number(e.dt) || 0);
            if (ctx.state.walletPopup) {
                ctx.state.walletPopup.remaining -= dt;
                if (ctx.state.walletPopup.remaining <= 0 || ctx.state.walletPopup.owner !== ctx.state.match?.roster[ctx.state.match.focusIndex]?.entityId) {
                    ctx.state.walletPopup = null;
                    talus.ui.set('walletPopups', []);
                }
            }
            ctx.state.cashFrameTime += dt;
            if (ctx.state.cashFrameTime >= .25) {
                ctx.state.cashFrameTime = 0;
                const owner = ctx.state.match?.roster[ctx.state.match.focusIndex]?.entityId, amount = ctx.state.cashPopups.get(owner);
                if (amount) {
                    ctx.state.walletPopup = { owner, amount: amount + (ctx.state.walletPopup?.amount || 0), remaining: 1.5 };
                    talus.ui.set('walletPopups', [{ text: '+$' + ctx.state.walletPopup.amount.toFixed(2) }]);
                }
                ctx.state.cashPopups.clear();
            }
            const card = ctx.state.arcadeCard;
            if (!card)
                return;
            if (!ctx.state.match || ctx.state.match.phase === 'fault') {
                cancelArcade();
                return;
            }
            if (ctx.core.presenting() || talus.sim.paused || ctx.state.shopOpen) {
                if (card.visible) {
                    talus.ui.set('arcadeCards', []);
                    card.visible = false;
                }
                card.elapsed = 0;
                return;
            }
            if (!card.visible) {
                talus.ui.set('arcadeCards', [card.view]);
                card.visible = true;
                return;
            }
            card.elapsed += dt;
            if (card.elapsed < card.seconds)
                return;
            ctx.state.arcadeCard = null;
            talus.ui.set('arcadeCards', []);
            ctx.session.persist();
            card.resolve(true);
        });
        talus.on('tick.frame', e => ctx.session.tickExitPreparation(Number(e.dt) || 0));
    }
    return { showArcadeCard, cancelArcade, turnScoreCard, dialogueDeck, nextPersonaShout, nextQuip, nameplate, speech, say, holdDeathPose, queuePresentation, tickPresentation, resumeAfterPresentation, resumeCurrentTurn, restoreFocusAfterBoot, playCue, bind };
}
export = create;
