import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ELEMENTS } from '@/simulation/ElementDatabase';
import { applyElementPatch, validateElement } from '@/simulation/elementValidation';
import { evaluateTerrainVector } from '@/simulation/TerrainVector';
import { validateTerrainWork, type TerrainWorkSpec } from '@/simulation/TerrainWork';
import { newLayerDef } from '@/world/layers/LayerStack';
import { defaultLayerStack } from '@/world/layers/LayerStackBuiltin';
import { BiomeRegistry } from '@/world/biomes/BiomeRegistry';
const root = path.resolve(import.meta.dirname, '../..');

describe('shot visual assets against native kernels', () => {
    it('the native biome loader selects repeatable retro skies from the round seed without changing terrain', async () => {
        const io = { listDir: async (dir: string) => fs.readdirSync(dir).map(name => ({ name, kind: 'file' as const })),
            readFile: async (file: string) => new Uint8Array(fs.readFileSync(file)) };
        const a = new BiomeRegistry(), b = new BiomeRegistry(), choices = new Set<string>();
        for (let seed = 0; seed < 40; seed++) {
            expect(await a.load(io, path.join(root, 'world'), seed)).toEqual([]);
            expect(await b.load(io, path.join(root, 'world'), seed)).toEqual([]);
            const selected = a.biomeForCopy(0, 0)!;
            expect(b.biomeIdForCopy(0, 0)).toBe(selected.id);
            expect(selected.lightingId).toBe('scorched-daylight');
            expect(a.substitutionForCopy(0, 0)).toBeNull(); expect(a.wfcPaletteForCopy(0, 0)).toBeNull();
            const record = JSON.parse(fs.readFileSync(path.join(root, 'assets/native/backgrounds', selected.backgroundId + '.json'), 'utf8'));
            expect(record.layers).toHaveLength(1); expect(record.layers[0].tiling).toBe('none');
            choices.add(selected.id);
        }
        expect(choices.size).toBeGreaterThan(8);
    });
    it('all authored gases pass the real element validator without expiry or an opacity fade', () => {
        for (const file of fs.readdirSync(path.join(root, 'assets/native/elements'))) {
            const spec = JSON.parse(fs.readFileSync(path.join(root, 'assets/native/elements', file), 'utf8'));
            const base = ELEMENTS.find(e => e.name === spec.basedOn)!;
            const element = applyElementPatch(base, spec.fields);
            expect(validateElement(element, { elements: ELEMENTS }), spec.name).toEqual([]);
            expect(element.opacityChannel).toBeUndefined();
            expect(element.fireLife).toBe(0);
            expect(element.frozenTtlDecay).toBe(1);
            expect(element.rules).toEqual([]);
        }
    });
    it('native raster vector writes only opaque colored pixels and no collision matter', async () => {
        const layers = defaultLayerStack();
        const raster = newLayerDef('raster', 'Shot paths', { id: 'shot-paths' }); layers.unshift(raster);
        const spec = { kind: 'vector', vector: { geometry: { kind: 'line', points: [{ x: 2, y: 2 }, { x: 9, y: 8 }], width: 1 },
            fill: { kind: 'element', element: 'IRON', color: 0x3c78ff }, output: { kind: 'raster', layer: { name: 'Shot paths' } } },
            shape: { x: 0, y: 0, w: 12, h: 11 }, bounds: { x: 0, y: 0, w: 12, h: 11 }, replacement: 'empty', seed: 1,
            budget: { cells: 132, particles: 0, pixels: 132, work: 132 }, holdSeconds: 0 } as TerrainWorkSpec;
        const rect = validateTerrainWork(spec);
        const active = layers.find(l => l.particle?.world)!;
        const result = await evaluateTerrainVector(null as any, null, ELEMENTS, layers, active.id, spec, rect, new AbortController().signal);
        expect(result.writes).toEqual([]); expect(result.raster!.length).toBeGreaterThan(7);
        expect(result.raster!.every(p => p.layerId === raster.id && p.color === 0xff3c78ff)).toBe(true);
    });
});
