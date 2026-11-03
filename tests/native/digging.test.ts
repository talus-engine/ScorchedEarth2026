// Real Rapier movement and native cutting kernels; terrain publication latency is controlled.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const arenaRef = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/core/TalusEngineCore', async original => ({ ...await original<any>(), engineStoreArena: () => arenaRef.current }));
import { RapierBridge } from '@/simulation/RapierBridge';
import { makeDefaultRigidBody } from '@/simulation/RigidBody';
import { ProjectileExcavation } from '@/simulation/ProjectileExcavation';
import { evaluateTerrainExcavation } from '@/simulation/TerrainExcavation';
import { planTerrainWork, terrainWorkRect, type TerrainWorkSpec, type TerrainWorkReceipt } from '@/simulation/TerrainWork';
const shop = JSON.parse(fs.readFileSync('world/Game/shop.json', 'utf8'));
let bridge: RapierBridge, serial = 12000;
const measurements: unknown[] = [];
afterAll(() => {
    fs.mkdirSync('.build/weapon-audit', { recursive: true });
    fs.writeFileSync('.build/weapon-audit/cadence.json', JSON.stringify({
        scope: 'Real Rapier and native terrain kernels; simulated three-frame publication delay, not a GPU benchmark.',
        measurements,
    }, null, 2) + '\n');
});
beforeAll(async () => {
    const { storeArenaFromInstance } = await import('@/core/TalusEngineCore');
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.resolve(process.env.TALUS_ENGINE_ROOT!, 'src/assets/wasm/talus_core.wasm')));
    arenaRef.current = storeArenaFromInstance(instance); bridge = new RapierBridge(); await bridge.init(); bridge.setGravity(0, 0);
});
async function flight(projectile: any, cutAhead: number) {
    const spec = structuredClone(projectile.excavation); spec.cutAhead = cutAhead;
    const body = makeDefaultRigidBody({ id: serial++, positionX: 512, positionY: 300, gravityScale: 0, linearDamping: 1,
        members: Array.from({ length: 4 }, (_, n) => ({ particleIndex: n, localOffsetX: n % 2 - .5, localOffsetY: Math.floor(n / 2) - .5, elementType: 23, birthColor: 0xffffffff })),
        mass: 4, invMass: .25, inertia: 4, invInertia: .25 });
    expect(bridge.installBody(body)).toBe(true); bridge.getRapierBody(body.id)!.setLinvel(projectile.speed, 0);
    const bodies = new Map([[body.id, body]]), matter = new Map<string, number>();
    let frame = 0, jobs = 0, initialHeldFrames = 0, flightHeldFrames = 0, movedFrames = 0, preparingWhileMoving = 0;
    let next: { at: number; work: TerrainWorkSpec; resolve: (r: TerrainWorkReceipt) => void } | null = null;
    const pose = () => ({ x: body.positionX, y: body.positionY, vx: body.velocityX, vy: body.velocityY });
    const cutter = new ProjectileExcavation(spec, Math.SQRT2, 'cutting-benchmark', {
        outputIsPassable: id => id === 5,
        cancel() {},
        run: (_owner, work) => { jobs++; return new Promise(resolve => { next = { at: frame + 3, work, resolve }; }); },
    }, { ...pose(), vx: projectile.speed, vy: 0 });
    const target = Math.min(180, spec.distance * .6);
    try {
        cutter.update({ ...pose(), vx: projectile.speed }, 1 / 60, true, true);
        for (frame = 1; frame <= 1500 && body.positionX < 512 + target && !cutter.state().outcome; frame++) {
            if (next && frame >= next.at) {
                const job = next; next = null;
                const rect = terrainWorkRect(job.work), writes = evaluateTerrainExcavation(job.work.shape, rect, job.work.excavation!, 0x808080);
                const plan = planTerrainWork(jobs, job.work, writes, (x, y) => {
                    const element = matter.get(x + ',' + y) ?? 10;
                    return { element, slot: y * 10000 + x, protected: false, recyclable: true, passable: element === 5 };
                }, 100000);
                for (const p of plan.writes) matter.set(p.x + ',' + p.y, p.element);
                job.resolve(plan.receipt); await Promise.resolve();
            }
            const held = !cutter.ready();
            if (held) {
                if (movedFrames) flightHeldFrames++;
                else initialHeldFrames++;
            } else {
                if (cutter.state().pending) preparingWhileMoving++;
                const previousX = body.positionX;
                movedFrames++; bridge.runFrame(bodies);
                expect(body.positionX - previousX).toBeCloseTo(projectile.speed / 60, 3);
                // Actual Rapier movement must remain inside published terrain cuts.
                for (let y = Math.floor(body.positionY - .5); y <= Math.ceil(body.positionY + .5); y++)
                    for (let x = Math.floor(body.positionX - .5); x <= Math.ceil(body.positionX + .5); x++)
                        expect(matter.get(x + ',' + y)).toBe(5);
            }
            cutter.update(pose(), 1 / 60, held, true);
        }
        return { jobs, initialHeldFrames, flightHeldFrames, movedFrames, preparingWhileMoving,
            frames: frame - 1, distance: body.positionX - 512, state: cutter.state() };
    }
    finally { cutter.dispose(); bridge.uninstallBody(body.id); }
}
describe('cutting corridor cadence', () => {
    for (const id of ['baby-digger', 'digger-shell', 'heavy-digger', 'baby-sandhog', 'sandhog', 'heavy-sandhog']) {
        it(id + ' keeps moving while future cuts prepare', async () => {
            const item = shop.items.find((item: any) => item.id === id);
            const specs = [item.projectile, ...(item.projectile.triggerChild || [])];
            for (const [index, spec] of specs.entries()) {
                const fine = await flight(spec, 0), batched = await flight(spec, spec.excavation.cutAhead);
                for (const run of [fine, batched]) {
                    expect(run.state.outcome).toBeNull();
                    expect(run.jobs).toBeGreaterThan(1);
                    expect(run.preparingWhileMoving).toBeGreaterThan(0);
                    expect(run.flightHeldFrames).toBe(0);
                    expect(run.state.holds).toBe(0);
                    expect(run.state.latency).toBeGreaterThan(0);
                }
                expect(batched.distance).toBeCloseTo(fine.distance, 2);
                expect(batched.movedFrames).toBe(fine.movedFrames);
                measurements.push({ weapon: id, payload: index > 0, fine, batched });
            }
        });
    }
    it('clearance cannot eat the protected foundation even with a larger batch', () => {
        const x = shop.items.find((i: any) => i.id === 'heavy-digger').projectile.excavation;
        const job: TerrainWorkSpec = { kind: 'excavate', shape: { kind: 'polyline', points: [{ x: 512, y: 1000 }, { x: 512, y: 1064 }], width: x.radius * 2 },
            bounds: x.bounds, exclusions: x.exclusions, materials: x.materials, replacement: 'matching', requireEligible: true,
            excavation: { output: x.output, clearance: x.clearance, edge: x.noise }, budget: { cells: 10000, particles: 10000, work: x.work } };
        const rect = terrainWorkRect(job), writes = evaluateTerrainExcavation(job.shape, rect, job.excavation!, 0x808080);
        const plan = planTerrainWork(1, job, writes, () => ({ element: 9, slot: 1, protected: false, recyclable: true }), 10000);
        expect(plan.receipt.status).toBe('refused'); expect(plan.writes).toEqual([]);
    });
});
