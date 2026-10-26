/** Landscape silhouettes and physical story mechanisms. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function storyMacroPlan(): any {
        const plan = ctx.state.match.procedural, story = plan?.story;
        if (!story)
            return null;
        if (plan.macro) {
            if (plan.macro.storyId !== story.id)
                throw new Error('Unsupported saved story geometry');
            return plan.macro;
        }
        if (plan.sites.length || Object.values(plan.completed).some(n => Number(n) > 0))
            throw new Error('Landscape geometry must be built before decoration');
        const styles: Record<string, {
            material: string;
            loose: string;
            levels: number[];
            forms: string[];
        }> = {
            'last-pumping-station': { material: 'CONCRETE', loose: 'GRAVEL', levels: [768, 768, 608, 608, 816, 832, 688, 704], forms: ['reservoir', 'ruin', 'trench'] },
            'nine-floors-below': { material: 'BASALT', loose: 'ASH', levels: [464, 464, 568, 568, 680, 696, 816, 832], forms: ['cave', 'bench', 'crevasse'] },
            'drowned-cathedral': { material: 'LIMESTONE', loose: 'SAND', levels: [528, 584, 784, 816, 656, 512, 608, 800], forms: ['vault', 'cave', 'basin'] },
            'black-gold-graveyard': { material: 'CONCRETE', loose: 'GRAVEL', levels: [704, 704, 816, 800, 608, 608, 768, 832], forms: ['reservoir', 'trench', 'ruin'] },
            'city-that-fell-sideways': { material: 'CONCRETE', loose: 'DIRT', levels: [480, 496, 768, 624, 640, 832, 560, 736], forms: ['ruin', 'ruin', 'bench'] },
            'furnace-garden': { material: 'STONE', loose: 'DIRT', levels: [688, 592, 512, 608, 736, 816, 752, 656], forms: ['vault', 'basin', 'ruin'] },
            'glacier-boiler-room': { material: 'ICE', loose: 'SNOW', levels: [768, 576, 432, 624, 816, 704, 480, 592], forms: ['crevasse', 'cave', 'basin'] },
            'hanging-quarry': { material: 'GRANITE', loose: 'GRAVEL', levels: [448, 448, 576, 576, 704, 704, 832, 832], forms: ['bench', 'cave', 'bench'] },
            'storm-collector': { material: 'STONE', loose: 'GRAVEL', levels: [448, 512, 576, 608, 704, 752, 816, 736], forms: ['reservoir', 'basin', 'trench'] },
            'world-beneath-landfill': { material: 'STONE', loose: 'DIRT', levels: [656, 704, 608, 736, 688, 768, 624, 720], forms: ['cave', 'ruin', 'cave'] },
        };
        const style = styles[story.id];
        if (!style)
            throw new Error('Missing macro geometry for landscape story ' + story.id);
        const left = ctx.state.arena.bounds.x, right = left + ctx.state.arena.bounds.w, start = ctx.state.arena.combat.x, end = start + ctx.state.arena.combat.w;
        const seed = story.seed, phase = (seed % 628) / 100;
        const xs = [left, right, start - 128, start, start + 256, start + 512, start + 768, end, end + 128];
        for (let x = left, n = 0; x < right; n++) {
            x = Math.min(right, x + 192 + ctx.core.chaosSeed(seed + ':macro-width:' + n) % 161);
            xs.push(x);
        }
        const nodes = [...new Set<number>(xs.filter(x => x >= left && x <= right))].sort((a, b) => a - b).map((x, n) => {
            const hash = ctx.core.chaosSeed(seed + ':macro-height:' + x);
            const broad = style.levels[(Math.floor(n / 2) + seed % style.levels.length) % style.levels.length];
            const outer = broad + hash % 33 - 16;
            const central = 744 + Math.sin((x - start) / 190 + phase) * 26 + Math.cos((x - start) / 310 + phase) * 14;
            const distance = x < start - 64 ? start - 64 - x : x > end + 64 ? x - end - 64 : 0;
            const blend = ctx.core.clamp(distance / 256, 0, 1);
            return { x, y: Math.round(ctx.core.clamp(central * (1 - blend) + outer * blend, 416, 864)) };
        });
        const surfaceAt = (x: number) => {
            const i = Math.max(0, nodes.findIndex((p, n) => n < nodes.length - 1 && p.x <= x && nodes[n + 1].x >= x));
            const a = nodes[i], b = nodes[i + 1];
            return Math.round(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
        };
        const centers = [.075, .22, .36, null, null, .66, .81, .935].map((fraction, n) => {
            const hash = ctx.core.chaosSeed(seed + ':macro-form:' + n), shoulder = fraction === null;
            const x = shoulder ? (n === 3 ? start - 180 : end + 180) + hash % 17 - 8
                : left + Math.floor(ctx.state.arena.bounds.w * fraction!) + hash % 129 - 64;
            return { x, ground: surfaceAt(x), kind: style.forms[n % style.forms.length], seed: hash,
                width: shoulder ? 192 + hash % 25 : 256 + hash % 129, depth: 80 + (hash >>> 8) % 113 };
        });
        plan.macro = { storyId: story.id, seed, material: style.material, loose: style.loose, nodes, forms: centers };
        ctx.session.persist();
        return plan.macro;
    }
    function storyMacroJobs(): {
        shape: TerrainShape;
        element: string;
        mixed: boolean;
        form: string;
    }[] {
        const macro = storyMacroPlan();
        if (!macro)
            return [];
        const jobs: Array<{
            shape: TerrainShape;
            element: string;
            mixed: boolean;
            form: string;
        }> = [];
        const add = (shape: TerrainShape, element: string, form: string, mixed = false) => jobs.push({ shape, element, mixed, form });
        const polygon = (points: Vec2[], element: string, form: string, mixed = false) => add({ kind: 'polygon', points }, element, form, mixed);
        for (let x = ctx.state.arena.bounds.x; x < ctx.state.arena.bounds.x + ctx.state.arena.bounds.w; x += 512) {
            const w = Math.min(512, ctx.state.arena.bounds.x + ctx.state.arena.bounds.w - x);
            add({ x, y: 896, w, h: 128 }, macro.material, 'substrate', true);
            add({ x, y: 0, w, h: 384 }, 'EMPTY', 'upper-sky');
        }
        for (let i = 0; i < macro.nodes.length - 1; i++) {
            const a = macro.nodes[i], b = macro.nodes[i + 1];
            polygon([a, b, { x: b.x, y: 896 }, { x: a.x, y: 896 }], macro.material, 'profile-fill', true);
            polygon([{ x: a.x, y: 384 }, { x: b.x, y: 384 }, b, a], 'EMPTY', 'profile-air');
        }
        for (const f of macro.forms) {
            const x = f.x, ground = f.ground, half = Math.floor(f.width / 2), material = macro.material;
            const floor = Math.min(976, ground + f.depth), roof = Math.min(floor - 40, ground + 40);
            if (f.kind === 'cave') {
                polygon([{ x: x - half, y: roof + 20 }, { x: x - half + 40, y: roof }, { x: x + half - 32, y: roof + 12 },
                    { x: x + half, y: floor - 20 }, { x: x + half - 48, y: floor }, { x: x - half + 24, y: floor - 8 }], 'EMPTY', 'buried-void');
            }
            else if (f.kind === 'crevasse') {
                add({ kind: 'polyline', points: [{ x: x - 24, y: ground - 20 }, { x: x + 18, y: ground + 52 },
                        { x: x - 8, y: Math.min(952, ground + f.depth + 52) }], width: 22 + f.seed % 21 }, 'EMPTY', 'ice-rock-fissure');
            }
            else if (f.kind === 'basin' || f.kind === 'trench') {
                const depth = Math.min(f.depth, 944 - ground);
                polygon([{ x: x - half, y: ground - 24 }, { x: x + half, y: ground - 16 },
                    { x: x + half - 44, y: ground + depth }, { x: x - half + 36, y: ground + depth - 12 }], 'EMPTY', f.kind);
            }
            else if (f.kind === 'bench') {
                polygon([{ x: x - half, y: ground - 28 }, { x: x + half, y: ground - 8 },
                    { x: x + half, y: ground + 64 }, { x: x - half, y: ground + 64 }], 'EMPTY', 'quarry-bench');
            }
            else {
                const height = Math.min(112 + f.seed % 97, Math.max(32, ground - 400)), top = ground - height;
                const lean = f.kind === 'ruin' ? (f.seed & 1 ? 24 : -24) : 0;
                polygon([{ x: x - half, y: ground + 24 }, { x: x + half, y: ground + 24 },
                    { x: x + half + lean, y: top }, { x: x - half + lean, y: top }], material, f.kind + '-shell');
                if (f.kind === 'reservoir') {
                    polygon([{ x: x - half + 20, y: top - 2 }, { x: x + half - 20, y: top - 2 },
                        { x: x + half - 28, y: ground - 16 }, { x: x - half + 28, y: ground - 16 }], 'EMPTY', 'reservoir-bowl');
                }
                else if (f.kind === 'vault') {
                    const spring = top + Math.min(60, Math.floor(height * .55)), crown = top + Math.min(24, Math.floor(height * .2));
                    polygon([{ x: x - half + 24, y: ground + 8 }, { x: x - half + 24, y: spring },
                        { x: x - 32, y: crown }, { x: x + 40, y: crown },
                        { x: x + half - 24, y: spring }, { x: x + half - 24, y: ground + 8 }], 'EMPTY', 'masonry-vault');
                }
                else {
                    const sill = top + Math.max(6, Math.floor(height / 3));
                    polygon([{ x: x - half + 24 + lean, y: sill }, { x: x + half - 28 + lean, y: sill + Math.min(8, Math.floor(height / 8)) },
                        { x: x + half - 32, y: ground - Math.min(20, Math.floor(height / 4)) },
                        { x: x - half + 28, y: ground - Math.min(12, Math.floor(height / 5)) }], 'EMPTY', 'ruin-opening');
                }
            }
        }
        return jobs;
    }
    async function generateStoryMacro(): Promise<void> {
        if (!ctx.state.match.procedural?.story)
            return;
        const plan = ctx.state.match.procedural, jobs = storyMacroJobs(), macro = plan.macro;
        const signature = ctx.core.chaosSeed(JSON.stringify(jobs));
        if (macro.signature !== undefined && macro.signature !== signature)
            throw new Error('Saved macro geometry no longer matches the saved generation configuration');
        if (macro.signature === undefined) {
            macro.signature = signature;
            macro.jobs = jobs.length;
            ctx.session.persist();
        }
        const materials = talus.elements.list().filter(e => e.id > 0).map(e => ({ element: e.id, hardness: 1 }));
        for (let n = plan.completed.macro || 0; n < jobs.length; n++) {
            const job = jobs[n], shape = job.shape;
            const points = 'points' in shape ? shape.points : null;
            const pad = 'width' in shape ? Math.ceil(shape.width / 2) + 1 : points ? 1 : 0;
            const box = points ? { w: Math.ceil(Math.max(...points.map(p => p.x))) - Math.floor(Math.min(...points.map(p => p.x))) + pad * 2,
                h: Math.ceil(Math.max(...points.map(p => p.y))) - Math.floor(Math.min(...points.map(p => p.y))) + pad * 2 } : shape as Rect;
            if (box.w > 512 || box.h > 512)
                throw new Error('Story macro exceeds a native job region: ' + job.form);
            const cells = box.w * box.h;
            const recipe = ctx.combat.materialRecipe(job.element);
            if (job.mixed)
                recipe.micro.noise = { algorithm: 'simplex', frequency: .023, octaves: 3, persistence: .5, lacunarity: 2,
                    bands: [{ element: macro.material, endPos: .72 }, { element: macro.loose, endPos: .9 }, { element: macro.loose === 'SNOW' ? 'SNOW' : 'SAND', endPos: 1 }] } as any;
            await ctx.generation.commitProcedural('macro', n, { kind: 'recipe', catalog: plan.catalog, shape,
                bounds: { ...ctx.state.arena.bounds, h: 1024 }, targetLayer: 'world', layerPolicy: 'active-only',
                replacement: job.element === 'EMPTY' ? 'matching' : 'eligible', materials,
                recipe: recipe as TerrainRecipe, geometry: { origin: { x: ctx.state.arena.bounds.x + ctx.state.arena.bounds.w / 2, y: 640 }, radius: ctx.state.arena.bounds.w / 2 },
                seed: macro.seed, budget: { cells, particles: cells, work: cells } }, { story: macro.storyId, form: job.form });
        }
    }
    function storyAssemblyJobs(motif: any, origin: Vec2): {
        label: string;
        spec: TerrainWorkSpec;
    }[] {
        const plan = ctx.state.match.procedural, p = motif.parameters, d = p.dimensions, jobs: {
            label: string;
            spec: TerrainWorkSpec;
        }[] = [];
        const put = (label: string, geometry: TerrainVectorSpec['geometry'], material: string, body = false) => {
            let box: Rect;
            if (geometry.kind === 'line') {
                const xs = geometry.points.map(v => v.x), ys = geometry.points.map(v => v.y), margin = Math.ceil(geometry.width / 2) + 2;
                const x = Math.floor(Math.min(...xs) - margin), y = Math.floor(Math.min(...ys) - margin);
                box = { x, y, w: Math.ceil(Math.max(...xs) + margin) - x + 1, h: Math.ceil(Math.max(...ys) + margin) - y + 1 };
            }
            else {
                const a = geometry.rotationDeg * Math.PI / 180;
                const w = Math.ceil(Math.abs(Math.cos(a) * geometry.width) + Math.abs(Math.sin(a) * geometry.height)) + 4;
                const h = Math.ceil(Math.abs(Math.sin(a) * geometry.width) + Math.abs(Math.cos(a) * geometry.height)) + 4;
                box = { x: Math.floor(geometry.center.x - w / 2), y: Math.floor(geometry.center.y - h / 2), w: w + 1, h: h + 1 };
            }
            const texture = plan.choices.structureTexture.find((id: string) => ctx.brushes.structureMaterial(id) === material);
            jobs.push({ label, spec: { kind: 'vector', catalog: plan.catalog, shape: box,
                    bounds: { ...ctx.state.arena.bounds, h: 1024 }, replacement: 'empty', targetLayer: 'world', layerPolicy: 'active-only',
                    seed: ctx.core.chaosSeed(motif.seed + ':' + label), ...(body ? ctx.generation.bodyPlacement(box, [{ x: 0, y: 0 }]) : { budget: ctx.generation.proceduralBudget(box) }), vector: { geometry,
                        fill: texture && body ? { kind: 'noise', id: texture, element: material } : { kind: 'element', element: material },
                        output: body ? { kind: 'body', name: motif.name + ' · ' + label, maxBodies: 4, friction: .65, restitution: .02 } : { kind: 'particles' } } } });
        };
        const line = (label: string, x1: number, y1: number, x2: number, y2: number, width: number, material: string) => put(label, { kind: 'line', points: [{ x: origin.x + x1, y: origin.y + y1 }, { x: origin.x + x2, y: origin.y + y2 }], width }, material);
        const support = (label: string, x: number, top: number, width: number, material: string) => {
            const bottom = motif.supportDepths?.[String(x)];
            if (!Number.isFinite(bottom))
                throw new Error('Missing surveyed support for ' + motif.name + '/' + x);
            line(label, x, top, x, bottom, width, material);
        };
        const box = (label: string, x: number, y: number, width: number, height: number, material: string, body = false, rotation = 0, id = 'builtin:square') => put(label, { kind: 'vector', id, center: { x: origin.x + x, y: origin.y + y }, width, height, rotationDeg: rotation }, material, body);
        if (motif.kind === 'counterweight') {
            const length = d.deckLength, thickness = d.deckThickness, slope = p.slopeDeg * Math.PI / 180;
            const capRadius = Math.max(0, Math.ceil(d.supportWidth / 2) - 1), clearance = 4;
            for (const x of [-length * .32, length * .32]) {
                const top = -76 + x * Math.tan(slope) + (thickness / 2 + capRadius + clearance) / Math.cos(slope);
                support('trestle-' + x, x, top, d.supportWidth, p.supportMaterial);
            }
            box('inclined deck', 0, -76, length, thickness, p.deckMaterial, true, p.slopeDeg);
            const loadX = -length * .28, loadY = -76 + loadX * Math.tan(slope) - thickness / 2 - d.loadDiameter / 2 - 3;
            box('rolling weight', loadX, loadY, d.loadDiameter, d.loadDiameter, p.loadMaterial, true, 0, 'builtin:circle');
            box('breakable chock', loadX + d.loadDiameter / 2 + 6, loadY + 10, 8, 18, p.supportMaterial);
            line('catch ramp', length * .35, -32, length * .72, -8, 8, p.deckMaterial);
            box('impact gate', length * .65, -24, 6, 24, 'GLASS');
            if (p.looseMaterial)
                box('loose load', -length * .2, -112, 32, 12, p.looseMaterial);
            if (p.secondaryLiquidMaterial)
                box('thermal pocket', length * .3, -6, 18, 4, p.secondaryLiquidMaterial);
            if (p.ignitionMaterial)
                box('ignition pocket', length * .65 + 12, -10, 2, 2, p.ignitionMaterial);
        }
        else {
            line('reservoir floor', -96, -100, -40, -100, 8, p.deckMaterial);
            line('reservoir plug', -40, -100, -24, -100, 8, p.supportMaterial);
            line('reservoir left wall', -96, -140, -96, -100, 8, p.deckMaterial);
            line('reservoir right wall', -24, -140, -24, -100, 8, p.deckMaterial);
            support('left pier', -88, -96, d.supportWidth, p.supportMaterial);
            support('right pier', -50, -96, d.supportWidth, p.supportMaterial);
            line('spill conduit', -42, -62, 48, -30, 10, p.deckMaterial);
            line('lower basin floor', 30, -2, 112, -2, 8, p.deckMaterial);
            line('lower basin left', 30, -30, 30, -2, 8, p.deckMaterial);
            line('lower basin right', 112, -34, 112, -2, 8, p.deckMaterial);
            support('basin left pier', 30, 0, d.supportWidth, p.deckMaterial);
            support('basin right pier', 112, 0, d.supportWidth, p.deckMaterial);
            if (p.ignitionMaterial) {
                line('fire separator', 90, -30, 90, -6, 8, p.supportMaterial);
                box('ignition', 102, -8, 1, 1, 'TERRA_FIRE_SOURCE');
            }
            if (p.secondaryLiquidMaterial)
                box('lower thermal pocket', 68, -8, 28, 4, p.secondaryLiquidMaterial);
            box('reservoir charge', -64, -118, 40, 20, p.liquidMaterial || 'WATER');
            if (p.sourceElement)
                box('native source', -64, -136, 1, 1, p.liquidMaterial === 'CRUDE_OIL' ? 'TERRA_OIL_SOURCE' : p.liquidMaterial === 'LAVA' ? 'TERRA_LAVA_SOURCE' : 'TERRA_WATER_SOURCE');
            if (p.drainElement)
                box('native drain', 84, -8, 1, 1, 'TERRA_LIQUID_DRAIN');
        }
        return jobs;
    }
    async function generateStoryMechanisms(): Promise<void> {
        const plan = ctx.state.match.procedural;
        if (!plan?.story)
            return;
        for (const motif of plan.story.motifs) {
            const family = 'mechanism-' + motif.siteIndex;
            if (!motif.origin) {
                const x = Math.floor(motif.central ? ctx.state.arena.combat.x + ctx.state.arena.combat.w * .54
                    : ctx.state.arena.bounds.x + ctx.state.arena.bounds.w * ([.13, .31, .71, .89][(motif.siteIndex - 1) % 4]));
                const surfaces: number[] = [];
                for (let dx = -120; dx <= 120; dx += 12) {
                    const y = await talus.world.findSurface(x + dx, 256, 768);
                    if (y !== null)
                        surfaces.push(y);
                }
                if (!surfaces.length)
                    throw new Error('No support for ' + motif.name);
                motif.origin = { x, y: Math.floor(Math.min(...surfaces) - 16) };
                ctx.session.persist();
            }
            if (!motif.supportDepths) {
                const xs = motif.kind === 'counterweight' ? [-motif.parameters.dimensions.deckLength * .32, motif.parameters.dimensions.deckLength * .32] : [-88, -50, 30, 112];
                motif.supportDepths = {};
                for (const x of xs) {
                    const y = await talus.world.findSurface(Math.round(motif.origin.x + x), 256, 768);
                    if (y === null)
                        throw new Error('Missing terrain under ' + motif.name);
                    motif.supportDepths[String(x)] = y - motif.origin.y + 4;
                }
                ctx.session.persist();
            }
            const jobs = storyAssemblyJobs(motif, motif.origin);
            for (const job of jobs) {
                const material = job.spec.vector!.fill!;
                if (material.kind === 'element' && !talus.elements.get(material.element))
                    throw new Error('Landscape device/material is not authored: ' + material.element);
            }
            const completed = plan.completed[family] || 0;
            for (let n = completed; n < jobs.length; n++) {
                const job = jobs[n];
                if (job.spec.vector?.output.kind !== 'body')
                    continue;
                const spec: TerrainWorkSpec = { ...job.spec, placement: { ...job.spec.placement!, preview: true } };
                const detail = { story: plan.story.id, motif: motif.id, part: job.label, origin: motif.origin, preview: true };
                const receipt = await talus.world.terrainWork(spec);
                ctx.generation.requireProceduralReceipt(family, n, spec, receipt, detail);
            }
            for (let n = completed; n < jobs.length; n++)
                await ctx.generation.commitProcedural(family, n, jobs[n].spec, { story: plan.story.id, motif: motif.id, part: jobs[n].label, origin: motif.origin });
        }
    }
    return { storyMacroPlan, storyMacroJobs, generateStoryMacro, storyAssemblyJobs, generateStoryMechanisms };
}
export = create;
