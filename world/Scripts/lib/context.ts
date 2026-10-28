/** Explicit shared state and service boundaries. Native handles stay in memory. */
export type SupplyReading = {
    jet: number;
    shield: number;
    magnet: number;
    deflectorItem?: 'magnet' | 'super-mag';
    groundSpent: number;
};
export type SpeechKind = 'shooting' | 'death';
export interface State {
    arena: any;
    match: any;
    chaosCatalog: any;
    quipCatalog: any;
    quipDeck: any;
    market: any;
    bank: any;
    shopOpen: boolean;
    shopIndex: number;
    shopCategory: string;
    terrainCatalog: TerrainRecipeCatalog;
    personaCatalog: any;
    soundCatalog: any;
    childDepth: number;
    booting: boolean;
    booted: boolean;
    ticks: number;
    launchingChaos: boolean;
    supplyCatalog: any;
    supplySequence: boolean;
    pendingTankReady: Set<string>;
    emissionRegions: Map<string, {
        anchor: SimulationAnchor | null;
        spec: string;
        lastClock: number;
        waited: number;
        retryAt: number;
        reason: string;
        ready: boolean;
    }>;
    exitDrain: {
        phase: 'closing' | 'running' | 'ready' | 'failed';
        elapsed: number;
    } | null;
    exitView: string;
    arcadeCard: any;
    arcadeSerial: number;
    cashFrameTime: number;
    cashPopups: Map<string, number>;
    walletPopup: {
        owner: string;
        amount: number;
        remaining: number;
    } | null;
    damageTextStyle: TransientTextStyle;
    shot: Projectile | null;
    utilityGeneration: number;
    digging: boolean;
    nextDigAt: number;
    colors: string[];
    deathPoseHolds: Map<string, {
        liveId: number | null;
        until: number;
    }>;
    cameraIntent: {
        key: string;
        id: number;
        x?: number;
        y?: number;
    } | null;
}
export interface Runtime {
    state: State;
    core: ReturnType<typeof import('core')>;
    residency: ReturnType<typeof import('residency')>;
    presentation: ReturnType<typeof import('presentation')>;
    session: ReturnType<typeof import('session')>;
    economy: ReturnType<typeof import('economy')>;
    equipment: ReturnType<typeof import('equipment')>;
    aiming: ReturnType<typeof import('aiming')>;
    cpu: ReturnType<typeof import('cpu')>;
    camera: ReturnType<typeof import('camera')>;
    turns: ReturnType<typeof import('turns')>;
    supplies: ReturnType<typeof import('supplies')>;
    combat: ReturnType<typeof import('combat')>;
    attachments: ReturnType<typeof import('attachments')>;
    chaos: ReturnType<typeof import('chaos')>;
    creatures: ReturnType<typeof import('creatures')>;
    ordnance: ReturnType<typeof import('ordnance')>;
    tricksters: ReturnType<typeof import('tricksters')>;
    payloads: ReturnType<typeof import('payloads')>;
    generation: ReturnType<typeof import('generation')>;
    menus: ReturnType<typeof import('menus')>;
    lifecycle: ReturnType<typeof import('lifecycle')>;
}
