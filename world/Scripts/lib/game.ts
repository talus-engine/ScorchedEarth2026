/** Compose the game services before registering native events. */
import type { Runtime, State } from 'context';
import core = require('core');
import residency = require('residency');
import simulation = require('simulation');
import presentation = require('presentation');
import session = require('session');
import economy = require('economy');
import equipment = require('equipment');
import aiming = require('aiming');
import cpu = require('cpu');
import camera = require('camera');
import turns = require('turns');
import supplies = require('supplies');
import combat = require('combat');
import attachments = require('attachments');
import chaos = require('chaos');
import creatures = require('creatures');
import ordnance = require('ordnance');
import tricksters = require('tricksters');
import payloads = require('payloads');
import generation = require('generation');
import menus = require('menus');
import lifecycle = require('lifecycle');
function create() {
    const state: State = {
            arena: undefined,
            match: undefined,
            chaosCatalog: undefined,
            quipCatalog: undefined,
            quipDeck: undefined,
            market: undefined,
            bank: undefined,
            shopOpen: false,
            shopIndex: 0,
            shopCategory: 'All',
            terrainCatalog: { version: 1, recipes: [] },
            personaCatalog: undefined,
            playerCatalog: undefined!,
            soundCatalog: undefined,
            childDepth: 0,
            booting: false,
            booted: false,
            ticks: 0,
            launchingChaos: false,
            supplyCatalog: null,
            supplySequence: false,
            pendingTankReady: new Set<string>(),
            emissionRegions: new Map<string, {
                anchor: SimulationAnchor | null;
                spec: string;
                lastClock: number;
                waited: number;
                retryAt: number;
                reason: string;
                ready: boolean;
            }>(),
            exitDrain: null,
            exitView: '',
            arcadeCard: null,
            arcadeSerial: 0,
            cashFrameTime: 0,
            cashPopups: new Map<string, number>(),
            walletPopup: null,
            damageTextStyle: {
                fontSize: 36, ms: 1500, outline: { color: '#080810', width: 3 },
                shadow: { color: '#080810', x: 3, y: 3 }, velocity: { x: 0, y: -180 },
                spread: { x: 55, y: 22 }, gravity: 190, rotationSpread: .18, angularVelocity: .16,
                squash: { x: .75, y: 1.6, seconds: .22 }, fadeStart: .68,
            },
            shot: null,
            utilityGeneration: 0,
            digging: false,
            nextDigAt: 0,
            colors: ['#bcb1ff', '#ffbd82', '#8ae0ca', '#f7a5c4', '#a4d2ff', '#ebd78a'],
            deathPoseHolds: new Map<string, {
                liveId: number | null;
                until: number;
            }>(),
            cameraIntent: null,
        };
    const ctx = { state } as Runtime;
    ctx.core = core(ctx);
    ctx.residency = residency(ctx);
    ctx.simulation = simulation(ctx);
    ctx.presentation = presentation(ctx);
    ctx.session = session(ctx);
    ctx.economy = economy(ctx);
    ctx.equipment = equipment(ctx);
    ctx.aiming = aiming(ctx);
    ctx.cpu = cpu(ctx);
    ctx.camera = camera(ctx);
    ctx.turns = turns(ctx);
    ctx.supplies = supplies(ctx);
    ctx.combat = combat(ctx);
    ctx.attachments = attachments(ctx);
    ctx.chaos = chaos(ctx);
    ctx.creatures = creatures(ctx);
    ctx.ordnance = ordnance(ctx);
    ctx.tricksters = tricksters(ctx);
    ctx.payloads = payloads(ctx);
    ctx.generation = generation(ctx);
    ctx.menus = menus(ctx);
    ctx.lifecycle = lifecycle(ctx);
    function start() {
        ctx.camera.bind();
        ctx.simulation.bind();
        ctx.residency.bind();
        ctx.presentation.bind();
        ctx.session.bind();
        ctx.cpu.bind();
        ctx.turns.bind();
        ctx.combat.bind();
        ctx.attachments.bind();
        ctx.payloads.bind();
        ctx.menus.bind();
        ctx.lifecycle.bind();
    }
    return { context: ctx, start };
}
export = create;
