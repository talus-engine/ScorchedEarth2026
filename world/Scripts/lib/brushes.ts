/** Noise, semantic, neural, living and vector terrain passes. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    async function generateCatalogDetails(): Promise<void> {
        await ctx.generation.prepareProceduralSites();
        const plan = ctx.state.match.procedural, bounds = { ...ctx.state.arena.bounds, h: 1024 };
        const materialNames = new Set<string>(['DIRT', 'SAND', 'STONE',
            ...(plan.macro ? [plan.macro.material, plan.macro.loose] : [])]);
        const materials = [...materialNames].map(name => {
            const element = typeof name === 'string' && name ? talus.elements.get(name) : null;
            if (!element || !Number.isInteger(element.id) || element.id <= 0)
                throw new Error('Unknown detail material: ' + name);
            return { element: element.id, hardness: 1 };
        });
        for (const family of ['noise', 'semantic', 'neural']) {
            const count = family === 'neural' ? 17 : 50;
            for (let n = plan.completed[family] || 0; n < count; n++) {
                const site = plan.sites[family === 'neural' ? n * 3 : n], hash = ctx.core.chaosSeed(ctx.state.match.seed + ':' + family + ':' + n);
                const size = family === 'noise' ? 192 : site.size;
                const shape = { x: site.x - Math.floor(size / 2), y: Math.floor(site.ground - size / 3), w: size, h: size };
                const preset = family === 'neural' ? { kind: 'semantic' as const, id: plan.choices.neuralRecipe[n] }
                    : { kind: family as 'noise' | 'semantic', id: plan.choices[family][n] };
                const spec: TerrainWorkSpec = { kind: 'recipe', catalog: plan.catalog, preset, shape, bounds,
                    targetLayer: 'world', layerPolicy: 'authored', replacement: 'eligible', materials,
                    budget: ctx.generation.proceduralBudget(shape), seed: hash };
                if (family === 'noise')
                    spec.stroke = {
                        shape: { kind: 'vector', id: plan.choices.vector[n % plan.choices.vector.length] },
                        path: [{ x: site.x - 24, y: site.ground }, { x: site.x + 24, y: site.ground - 8 + hash % 17 }],
                        size: 32 + hash % 21, spacingPx: 12, rotationDeg: hash % 360,
                        spinDeg: (hash & 1 ? 1 : -1) * (8 + (hash >>> 8) % 33),
                        sizeLfo: { amplitudePx: 6 + (hash >>> 16) % 11, frequencyHz: .5 + (hash % 16) / 10 },
                        budget: { stamps: 16, sampleCells: 1000000 },
                    };
                if (family === 'neural')
                    spec.neural = { modelId: plan.choices.neural[n], steps: ctx.state.generationRecipes.neural.steps, tintStrength: ctx.state.generationRecipes.neural.tintStrength };
                await ctx.generation.commitProcedural(family, n, spec, { preset: preset.id, model: spec.neural?.modelId, x: site.x, size });
            }
        }
        ctx.state.match.details = 50;
        ctx.session.persist();
    }
    function structureMaterial(id: string): string {
        if (/(wood|plank|crate)/i.test(id))
            return 'WOOD';
        if (/(concrete|brick)/i.test(id))
            return 'CONCRETE';
        if (/(metal|steel|corrugat)/i.test(id))
            return 'IRON';
        return 'STONE';
    }
    async function generateStructures(): Promise<void> {
        const plan = ctx.state.match.procedural;
        if (!plan)
            return;
        const count = plan.choices.vector.length;
        for (let n = plan.completed.structures || 0; n < count; n++) {
            const site = plan.sites[Math.floor(n * 50 / count)], hash = ctx.core.chaosSeed(ctx.state.match.seed + ':structure:' + n);
            const texture = plan.choices.structureTexture[n], material = structureMaterial(texture);
            const width = 48 + hash % 97, height = material === 'WOOD' ? 10 + (hash >>> 8) % 15 : 28 + (hash >>> 8) % 45;
            const rotation = (hash >>> 16) % 91 - 45;
            const radius = Math.ceil(Math.hypot(width, height) / 2);
            const surfaces: number[] = [];
            for (let dx = -radius; dx <= radius; dx += 8) {
                const y = await talus.world.findSurface(site.x + dx, ctx.state.arena.surfaceBand.top, ctx.state.arena.surfaceBand.height);
                if (y !== null)
                    surfaces.push(y);
            }
            if (!surfaces.length)
                throw new Error('Structure has no ground at site ' + n);
            const center = { x: site.x, y: Math.floor(Math.min(...surfaces) - radius - 24) };
            const shape = { x: center.x - 128, y: center.y - 128, w: 256, h: 256 };
            const geometry: TerrainVectorSpec['geometry'] = n % 3 === 0
                ? { kind: 'line', points: [{ x: center.x - width / 2, y: center.y - height / 2 },
                        { x: center.x + width / 2, y: center.y + height / 2 }], width: material === 'WOOD' ? height : 12 + hash % 17 }
                : { kind: 'vector', id: n % 3 === 1 ? 'builtin:square' : plan.choices.vector[n], center, width, height, rotationDeg: rotation };
            const side = hash & 1 ? 1 : -1;
            const placement = ctx.generation.bodyPlacement(shape, [{ x: 0, y: 0 }, { x: 0, y: -32 },
                { x: side * 48, y: -32 }, { x: -side * 48, y: -32 }, { x: 0, y: -64 },
                { x: side * 96, y: -64 }, { x: -side * 96, y: -64 }, { x: 0, y: -112 }]);
            await ctx.generation.commitProcedural('structures', n, { kind: 'vector', catalog: plan.catalog, shape, ...placement,
                bounds: { ...ctx.state.arena.bounds, h: 1024 }, replacement: 'empty', layerPolicy: 'active-only', targetLayer: 'world',
                seed: hash, vector: { geometry, fill: { kind: 'noise', id: texture, element: material },
                    output: { kind: 'body', name: material + ' landscape prop', maxBodies: 32, friction: .7, restitution: .03 } } }, { texture, material, geometry });
        }
    }
    async function generateCatalogLife(): Promise<void> {
        const plan = ctx.state.match.procedural, living = ctx.state.generationRecipes.living;
        for (let n = plan.completed.growth || 0; n < 50; n++) {
            const site = plan.sites[n], id = plan.choices.growth[n], hash = ctx.core.chaosSeed(ctx.state.match.seed + ':growth:' + n);
            const shape = { x: site.x - 256, y: Math.floor(site.ground - 480), w: 512, h: 512 };
            const policy = plan.growthPolicies[id], requestedSize = 64 + hash % 65;
            const densityScales = policy.stroke.sizeMode === 'scatter'
                || policy.stroke.sizeMode === 'attribute' && policy.stroke.sizeAttribute === 'tubesPerStep';
            const maxRadius = densityScales ? (64 - policy.startTubes) * policy.stroke.sizeReference / Math.max(policy.tubesPerStep, 1 / policy.stroke.sizeReference) : 128;
            const nominalLength = policy.stroke.sizeMode === 'scale';
            if (nominalLength && (!Number.isFinite(policy.lengthMax) || policy.lengthMax < 0))
                throw new Error('Invalid saved growth length: ' + id);
            const radius = Math.min(requestedSize / 2, Math.floor(maxRadius), nominalLength ? requestedSize * policy.stroke.sizeReference / Math.max(1, policy.lengthMax) : Infinity);
            const density = densityScales ? Math.max(policy.tubesPerStep, 1 / policy.stroke.sizeReference) * radius / policy.stroke.sizeReference : policy.tubesPerStep;
            const points = Math.min(16, Math.max(1, Math.ceil((1 - policy.startTubes) / Math.max(.01, density))));
            const path = Array.from({ length: points }, (_, i) => ({ x: site.x - (points - 1) + i * 2, y: site.ground - 1 }));
            await ctx.generation.commitProcedural('growth', n, { kind: 'growth', catalog: plan.catalog, shape,
                bounds: { ...ctx.state.arena.bounds, h: 1024 }, replacement: 'empty', targetLayer: 'world', layerPolicy: 'authored',
                seed: hash, budget: ctx.generation.proceduralBudget(shape), growth: { presetId: id,
                    origin: { x: site.x, y: site.ground }, path,
                    radius, steps: living.steps, jobs: 64, fragments: living.fragments,
                    ...(policy.timed ? { liveSeconds: Math.min(60, policy.endTime + 1 / 60) } : policy.flowing ? { liveSeconds: 2 } : {}) } }, { preset: id, requestedSize, size: radius * 2, radius, sizePolicy: nominalLength ? 'nominal-length' : 'toolbar-diameter',
                ...(nominalLength ? { nominalLengthTarget: requestedSize, nominalLengthMax: policy.lengthMax * Math.max(1, radius) / policy.stroke.sizeReference } : {}), x: site.x });
        }
        ctx.state.match.livingSites = 50;
        ctx.session.persist();
    }
    async function clearWithFlowers(): Promise<void> {
        const plan = ctx.state.match.procedural, c = ctx.state.generationRecipes.clearance;
        const materials = talus.elements.list().filter(e => e.id > 0).map(e => ({ element: e.id, hardness: 1 }));
        for (let n = plan.completed.clearance || 0; n < ctx.state.match.clearancePath.length; n++) {
            const p = ctx.state.match.clearancePath[n], hash = ctx.core.chaosSeed(ctx.state.match.seed + ':flower:' + n);
            const radius = c.radius[0] + hash % (c.radius[1] - c.radius[0] + 1), amplitude = 8 + (hash >>> 8) % 17;
            const reach = radius + amplitude, y = Math.floor(p.y - c.groundBuffer - reach);
            const shape = { x: p.x - reach - 24, y: y - reach, w: 2 * reach + 48, h: 2 * reach };
            await ctx.generation.commitProcedural('clearance', n, { kind: 'recipe', catalog: plan.catalog, shape,
                bounds: { ...ctx.state.arena.bounds, h: 1024 }, targetLayer: 'world', layerPolicy: 'active-only', replacement: 'matching', materials,
                budget: ctx.generation.proceduralBudget(shape), seed: hash,
                mixture: { recipes: [c.empty, ctx.state.generationRecipes.details[0]],
                    weights: [{ anchorId: c.empty.id, w: c.emptyWeight }, { anchorId: ctx.state.generationRecipes.details[0].id, w: 1 - c.emptyWeight }], settings: ctx.state.generationRecipes.semantic },
                stroke: { shape: { kind: 'vector', id: 'builtin:flower' }, path: [{ x: p.x - 24, y }, { x: p.x + 24, y }],
                    size: radius, spacingPx: 16, rotationDeg: hash % 360, spinDeg: (hash & 1 ? 1 : -1) * (12 + hash % 31),
                    sizeLfo: { amplitudePx: amplitude, frequencyHz: .5 + (hash % 11) / 10 }, budget: { stamps: 8, sampleCells: 2000000 } } }, { shape, radius, amplitude });
        }
        ctx.state.match.cleared = ctx.state.match.clearancePath.length;
        ctx.session.persist();
    }
    async function generateBrushArena(): Promise<void> {
        const columns = ctx.state.arena.bounds.w / 512, jobs: any[] = [];
        const layers = ctx.state.match.procedural?.story ? [[1024, 256, ctx.state.generationRecipes.foundation]] as const
            : [[1024, 256, ctx.state.generationRecipes.foundation], [896, 128, ctx.state.generationRecipes.fill], [384, 512, ctx.state.generationRecipes.surface]] as const;
        for (const [y, h, recipe] of layers)
            for (let column = 0; column < columns; column++)
                jobs.push({ x: ctx.state.arena.bounds.x + column * 512, y, w: 512, h, recipe });
        for (let n = ctx.state.match.generated; n < jobs.length; n++) {
            const { recipe, ...shape } = jobs[n], cells = shape.w * shape.h;
            ctx.state.match.message = 'Painting Brush Reach · ' + (n + 1) + ' / ' + jobs.length;
            ctx.menus.publish();
            const receipt = await talus.world.terrainWork({ kind: 'recipe', shape, bounds: ctx.state.arena.bounds,
                replacement: 'empty', budget: { cells, particles: cells, work: cells }, recipe,
                seed: ctx.core.chaosSeed(ctx.state.match.seed + ':brush-reach') });
            if (receipt.status !== 'completed')
                throw new Error('Brush generation ' + n + ': ' + receipt.reason);
            ctx.state.match.generated = n + 1;
            ctx.session.persist();
        }
        await ctx.landscape.generateStoryMacro();
        await prepareClearance();
        await generateBrushDetails();
        await generateStructures();
        await generateLivingArena();
        await clearCombatSpace();
        await ctx.landscape.generateStoryMechanisms();
    }
    async function prepareClearance(): Promise<void> {
        if (ctx.state.match.clearancePath)
            return;
        const margin = ctx.state.generationRecipes.living.clearCombatMargin;
        const left = ctx.state.arena.combat.x - margin, right = ctx.state.arena.combat.x + ctx.state.arena.combat.w + margin;
        const path: Vec2[] = [];
        for (let x = left;; x = Math.min(right, x + ctx.state.generationRecipes.clearance.spacing)) {
            const ground = await talus.world.findSurface(x, ctx.state.arena.surfaceBand.top, ctx.state.arena.surfaceBand.height);
            if (ground === null)
                throw new Error('Clearance brush has no terrain surface at ' + x);
            path.push({ x, y: ground });
            if (x === right)
                break;
        }
        ctx.state.match.clearancePath = path;
        ctx.session.persist();
    }
    async function clearCombatSpace(): Promise<void> { await clearWithFlowers(); }
    async function generateBrushDetails(): Promise<void> { await generateCatalogDetails(); }
    async function generateLivingArena(): Promise<void> { await ctx.generation.prepareProceduralSites(); await generateCatalogLife(); }
    return { generateCatalogDetails, structureMaterial, generateStructures, generateCatalogLife, clearWithFlowers, generateBrushArena, prepareClearance, clearCombatSpace, generateBrushDetails, generateLivingArena };
}
export = create;
