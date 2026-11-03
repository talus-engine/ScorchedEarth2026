import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ringRegionGeometry } from '@/world/RingRegion';
import { arenaWallsOutside, projectileWallCrossing, looseBodyWallCrossing } from '@/world/OutOfBoundsWatch';
import { engineBudgetProblems } from '@/config/EngineBudgets';
const root = path.resolve(import.meta.dirname, '../..');
const input = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/input.json'), 'utf8'));
const arena = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/arena.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(root, 'world/Game/arena-rules.json'), 'utf8'));
const geometry = { originPx: { x: arena.bounds.x, y: arena.bounds.y }, sizePx: { w: arena.bounds.w, h: arena.bounds.h }, wrapX: false, wrapY: false };
const home = { px: 0, py: 0 };

describe('authored battlefield against native ring and edge contracts', () => {
    it('admits the full map and sky with electricity placed over the deployment ground', () => {
        const ring = ringRegionGeometry(input.startRing, { electrical: input.startElectrical });
        expect(ring.rect).toEqual(input.startRing);
        expect(ring.electrical.y0).toBe(0);
        expect(ring.electrical.y1).toBe(19);
        expect(arenaWallsOutside(geometry, rules, input.startRing)).toEqual([]);
        expect(engineBudgetProblems(input.engineBudgets)).toEqual([]);
    });
    it('allows ordinary high arcs, but removes shots and wreckage before they reach the ring edge', () => {
        expect(projectileWallCrossing(geometry, rules, home, 6400, -6300)).toBeNull();
        for (const at of [{ x: -200, y: 650, edge: 'left' }, { x: 13000, y: 650, edge: 'right' },
            { x: 6400, y: -8300, edge: 'top' }, { x: 6400, y: 1500, edge: 'bottom' }]) {
            expect(projectileWallCrossing(geometry, rules, home, at.x, at.y)).toMatchObject({ edge: at.edge, policy: 'remove' });
            expect(looseBodyWallCrossing(geometry, rules, home, at.x, at.y)).toMatchObject({ edge: at.edge, policy: 'remove' });
        }
    });
    it('enforces horizontal walls while a shell is above the terrain rectangle', () => {
        for (const at of [{ x: -200, y: -1000, edge: 'left' }, { x: 13000, y: -1000, edge: 'right' }]) {
            expect(projectileWallCrossing(geometry, rules, home, at.x, at.y)).toMatchObject({ edge: at.edge, policy: 'remove' });
            expect(looseBodyWallCrossing(geometry, rules, home, at.x, at.y)).toMatchObject({ edge: at.edge, policy: 'remove' });
        }
    });
});
