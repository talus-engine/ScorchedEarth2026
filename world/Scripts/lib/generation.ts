/** Pinned preset selection, resumable work and supported deployment. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function configureGeneration(mode: string): void {
        if (mode !== 'brush') {
            if (mode !== 'wfc') {
                ctx.state.arena.surfaceBand = { top: 256, height: 800 };
                ctx.state.arena.biome = { id: mode, name: mode.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '), areaId: null };
            }
            return;
        }
        const offset = ctx.state.arena.generation.brushOriginX;
        ctx.state.arena.bounds.x += offset;
        ctx.state.arena.combat.x += offset;
        ctx.state.arena.biome = { id: 'brush-reach', name: 'Brush Reach', areaId: null };
        ctx.state.arena.surfaceBand = { top: 384, height: 512 };
    }
    function generationChoices(ids: string[], count: number, label: string, weights?: Record<string, number>): string[] {
        if (!ids.length)
            throw new Error('Empty project preset family: ' + label);
        const out: string[] = [];
        for (let cycle = 0; out.length < count; cycle++) {
            const bag = [...ids].sort();
            let rng = ctx.core.chaosSeed(ctx.state.match.seed + ':' + label + ':' + cycle);
            if (weights) {
                const ranked = bag.map(id => {
                    const weight = Object.hasOwn(weights, id) ? weights[id] : 1;
                    if (!Number.isFinite(weight) || weight <= 0)
                        throw new Error('Preset weight must be positive: ' + label + '/' + id);
                    rng ^= rng << 13;
                    rng ^= rng >>> 17;
                    rng ^= rng << 5;
                    return { id, rank: -Math.log(((rng >>> 0) + .5) / 4294967296) / weight };
                }).sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
                bag.splice(0, bag.length, ...ranked.map(r => r.id));
            }
            else {
                for (let i = bag.length - 1; i > 0; i--) {
                    rng ^= rng << 13;
                    rng ^= rng >>> 17;
                    rng ^= rng << 5;
                    const j = (rng >>> 0) % (i + 1);
                    [bag[i], bag[j]] = [bag[j], bag[i]];
                }
            }
            if (out.length && bag.length > 1 && bag[0] === out[out.length - 1])
                [bag[0], bag[1]] = [bag[1], bag[0]];
            out.push(...bag.slice(0, count - out.length));
        }
        return out;
    }
    async function prepareProcedural(): Promise<void> {
        const config = ctx.state.generationRecipes.catalog;
        const catalog = (await talus.world.resources.catalogs()).find(c => c.id === config.id);
        if (!catalog || catalog.hash !== (ctx.state.match.procedural?.hash || config.hash))
            throw new Error('The saved procedural catalog is missing or changed; restore its pinned resources');
        if (ctx.state.match.procedural)
            return;
        const checks = await talus.world.resources.validate(catalog.id);
        const failures = checks.filter(c => !c.ok || c.runtime?.supported === false);
        if (failures.length)
            throw new Error('Project preset preflight: ' + failures.map(c => c.id + ': ' + (c.error || c.runtime?.reason)).join('; '));
        const ids = (kind: ResourceKind) => catalog.manifest.entries.filter(e => e.kind === kind).map(e => e.id);
        let story: any = null;
        const storyWeights: Record<string, Record<string, number>> = {};
        if (config.storyFile) {
            const document: any = JSON.parse(await talus.files.readText(config.storyFile) || 'null');
            if (!document || !Array.isArray(document.themes) || !document.themes.length)
                throw new Error('Invalid landscape story document: ' + config.storyFile);
            const baseWeight = Number(document.selection?.baseWeight), affinityBonus = Number(document.selection?.affinityBonus);
            if (!Number.isFinite(baseWeight) || baseWeight <= 0 || !Number.isFinite(affinityBonus) || affinityBonus < 0)
                throw new Error('Landscape stories require positive baseline and nonnegative affinity weights');
            const themeIds = document.themes.map((t: any) => t.id);
            if (themeIds.some((id: any) => typeof id !== 'string' || !id) || new Set(themeIds).size !== themeIds.length)
                throw new Error('Landscape story IDs must be unique nonempty strings');
            const label = 'landscape-story';
            const themeId = generationChoices(themeIds, 1, label)[0];
            const theme = document.themes.find((t: any) => t.id === themeId);
            const sites = Number(document.placement?.sitesPerMap), central = Number(document.placement?.centralSites);
            if (!Number.isInteger(sites) || sites < 1 || sites > 16 || !Number.isInteger(central) || central < 0 || central > sites)
                throw new Error('Landscape story placement must use 1..16 bounded sites');
            if (!Array.isArray(theme.motifs) || !theme.motifs.length
                || new Set(theme.motifs.map((m: any) => m.id)).size !== theme.motifs.length
                || theme.motifs.some((m: any) => typeof m.id !== 'string' || !m.id
                    || !['counterweight', 'spillway', 'fuel-cell'].includes(m.kind) || !m.parameters))
                throw new Error('Invalid native motif definitions for landscape story ' + themeId);
            const affinities: Record<string, string[]> = {};
            const documents = [
                ['noise', 'Game/Presets/noise.json', 'presets'], ['semantic', 'Game/Presets/semantic.json', 'recipes'],
                ['growth', 'Game/Presets/living.json', 'presets'], ['vector', 'Game/Presets/vectors.json', 'shapes'],
                ['neural', 'Game/Presets/neural.json', 'models'],
            ] as const;
            for (const [kind, path, key] of documents) {
                const snapshot: any = JSON.parse(await talus.files.readText(path) || 'null');
                if (!Array.isArray(snapshot?.[key]))
                    throw new Error('Missing story preset metadata: ' + path);
                const records = new Map<string, any>(snapshot[key].map((r: any) => [r.id, r]));
                const words = theme.affinities?.[kind] ?? [];
                if (!Array.isArray(words) || words.some((w: any) => typeof w !== 'string'))
                    throw new Error('Invalid story affinities: ' + themeId + '/' + kind);
                const keywords = [...new Set<string>(words.map((w: string) => w.trim().toLowerCase()).filter(Boolean))];
                if (kind !== 'neural')
                    affinities[kind] = keywords;
                const weights: Record<string, number> = {};
                for (const id of ids(kind)) {
                    const record = records.get(id);
                    if (!record)
                        throw new Error('Story metadata lacks pinned resource: ' + kind + '/' + id);
                    const text = [record.id, record.name, record.description, record.group, ...(record.tags || [])].join(' ').toLowerCase();
                    weights[id] = baseWeight + affinityBonus * keywords.filter(word => text.includes(word)).length;
                }
                if (keywords.length)
                    storyWeights[kind] = weights;
            }
            const motifIds = generationChoices(theme.motifs.map((m: any) => m.id), sites, 'story-motifs:' + themeId);
            story = { id: themeId, name: theme.name, description: theme.description,
                sourceFile: config.storyFile, seed: ctx.core.chaosSeed(ctx.state.match.seed + ':' + label + ':0'),
                selection: { baseWeight, affinityBonus }, affinities, placement: { sitesPerMap: sites, centralSites: central },
                motifs: motifIds.map((id, siteIndex) => {
                    const motif = theme.motifs.find((m: any) => m.id === id);
                    return { id, name: motif.name, kind: motif.kind, parameters: JSON.parse(JSON.stringify(motif.parameters)),
                        requires: [...(motif.requires || [])], siteIndex, central: siteIndex < central,
                        seed: ctx.core.chaosSeed(ctx.state.match.seed + ':story-motif:' + themeId + ':' + siteIndex) };
                }) };
        }
        const choices: Record<string, string[]> = {};
        for (const kind of ['noise', 'semantic', 'neural', 'growth', 'vector'] as const)
            choices[kind] = generationChoices(ids(kind), kind === 'neural' ? 17 : kind === 'vector' ? config.structures : 50, kind, storyWeights[kind]);
        const modelAnchors: Record<string, string[]> = {};
        for (const id of ids('neural')) {
            const model: any = await talus.world.resources.read(catalog.id, 'neural', id);
            const anchors = model.architecture.anchors.map((a: any) => a.id).filter((id: string) => ids('semantic').includes(id));
            modelAnchors[id] = generationChoices(anchors, 17, 'neural-anchor:' + id, storyWeights.semantic);
        }
        choices.neuralRecipe = choices.neural.map((id, n) => modelAnchors[id][n]);
        const growthPolicies: Record<string, any> = {};
        for (const id of ids('growth')) {
            const preset: any = await talus.world.resources.read(catalog.id, 'growth', id);
            growthPolicies[id] = { stroke: preset.stroke, startTubes: preset.sheet.startTubes,
                tubesPerStep: preset.sheet.tubesPerStep, lengthMax: preset.sheet.lengthMax, timed: preset.sheet.timeClip,
                endTime: preset.sheet.endTime, flowing: preset.sheet.flowSpeed > 0 };
        }
        if (!ids('vector').includes('builtin:flower'))
            throw new Error('The project flower mask is missing');
        const structures = ids('noise').filter(id => /(wood|plank|crate|concrete|brick|metal|steel|stone|rock|marble|tarmac|corrugat)/i.test(id));
        choices.structureTexture = generationChoices(structures, config.structures, 'structure-texture', storyWeights.noise);
        ctx.state.match.procedural = { catalog: catalog.id, hash: catalog.hash, choices, growthPolicies, sites: [], completed: {}, ...(story ? { story } : {}) };
        ctx.session.persist();
    }
    async function prepareProceduralSites(): Promise<void> {
        const plan = ctx.state.match.procedural;
        if (plan.sites.length)
            return;
        const sites: {
            x: number;
            ground: number;
            size: number;
        }[] = [];
        for (let n = 0; n < 50; n++) {
            const hash = ctx.core.chaosSeed(ctx.state.match.seed + ':site:' + n);
            const x = Math.floor(ctx.state.arena.bounds.x + 128 + n * 256 + (hash % 49) - 24);
            const ground = await talus.world.findSurface(x, ctx.state.arena.surfaceBand.top, ctx.state.arena.surfaceBand.height);
            if (ground === null)
                throw new Error('No terrain for procedural site ' + n);
            sites.push({ x, ground, size: 64 + hash % 65 });
        }
        plan.sites = sites;
        ctx.session.persist();
    }
    function proceduralBudget(shape: Rect): {
        cells: number;
        particles: number;
        pixels: number;
        work: number;
    } {
        const cells = shape.w * shape.h, particles = Math.min(262144, cells * 3), pixels = cells * 2;
        return { cells, particles, pixels, work: particles + pixels };
    }
    function bodyPlacement(shape: Rect, offsets: Vec2[]): {
        placement: {
            offsets: Vec2[];
            maxChecks: number;
        };
        budget: {
            cells: number;
            particles: number;
            work: number;
        };
    } {
        const xs = [0, ...offsets.map(p => p.x)], ys = [0, ...offsets.map(p => p.y)];
        const width = shape.w + Math.max(...xs) - Math.min(...xs);
        const height = shape.h + Math.max(...ys) - Math.min(...ys);
        if (!offsets.length || offsets.length > 8 || width > 512 || height > 512)
            throw new Error('Landscape body placement exceeds the native search envelope');
        const members = shape.w * shape.h;
        return { placement: { offsets, maxChecks: members * offsets.length },
            budget: { cells: width * height, particles: members, work: members } };
    }
    function requireProceduralReceipt(family: string, n: number, spec: TerrainWorkSpec, receipt: TerrainWorkReceipt, detail: any = {}): void {
        let reason = receipt.status === 'completed' ? null : receipt.reason || receipt.status;
        if (!reason && spec.vector?.output.kind === 'body') {
            const placement = receipt.placement;
            if (!placement?.selected || !(placement.cells > 0))
                reason = 'incomplete-native-body-placement-receipt';
            else if (spec.placement?.preview ? !placement.preview || receipt.accepted !== 0
                : placement.preview || !(receipt.accepted > 0) || !receipt.bodies?.length)
                reason = 'native-body-placement-made-no-progress';
        }
        if (!reason)
            return;
        ctx.state.match.procedural.lastFailure = { family, n, ...detail, reason, receipt };
        ctx.session.persist();
        throw new Error(family + ' ' + n + ': ' + reason);
    }
    async function commitProcedural(family: string, n: number, spec: TerrainWorkSpec, detail: any = {}): Promise<void> {
        const plan = ctx.state.match.procedural;
        if ((plan.completed[family] || 0) > n)
            return;
        ctx.state.match.message = family + ' · ' + (n + 1);
        ctx.menus.publish();
        const receipt = await talus.world.terrainWork(spec);
        requireProceduralReceipt(family, n, spec, receipt, detail);
        plan.completed[family] = n + 1;
        if (plan.lastFailure?.family === family && plan.lastFailure.n === n)
            delete plan.lastFailure;
        ctx.session.persist();
    }
    async function deploymentGround(p: any): Promise<{
        x: number;
        y: number;
    }> {
        const half = ctx.state.arena.combat.tankHalfWidth, spacing = (ctx.state.arena.combat.w - ctx.state.arena.combat.spawnInset * 2) / (ctx.state.match.roster.length - 1);
        const range = Math.max(0, Math.min(120, Math.floor(spacing / 2 - half - 4)));
        const columns = [0];
        for (let d = 4; d <= range; d += 4)
            columns.push(d, -d);
        for (let d = Math.floor(range / 4) * 4 + 4; d <= ctx.state.arena.combat.w; d += 4)
            columns.push(d, -d);
        const groundCell = (x: number, y: number) => {
            const c = talus.world.cell(x, y);
            return c && !c.body && !c.entity && (c.state === 'solid' || c.state === 'powder')
                && !/(WOOD|LEAF|ROOT|STEM|BRANCH)/.test(c.element?.name || '');
        };
        let arrived = false;
        const point = { x: ctx.state.arena.combat.x + ctx.state.arena.combat.w / 2, y: ctx.state.arena.surfaceBand.top + ctx.state.arena.surfaceBand.height / 2 };
        for (let n = 0; n < 1800; n++) {
            if (ctx.camera.cameraArrived(ctx.camera.cameraPoint(point, 'deploy:' + p.index))) {
                arrived = true;
                break;
            }
            await talus.sleepTicks(1);
        }
        if (!arrived)
            throw new Error('Deployment terrain did not become camera-ready: ' + p.name);
        await talus.sleepTicks(90);
        for (const dx of columns) {
            const x = Math.round(p.spawnX + dx);
            if (x - half < ctx.state.match.bounds.x || x + half > ctx.state.match.bounds.x + ctx.state.match.bounds.w)
                continue;
            if (x - half < ctx.state.arena.combat.x || x + half > ctx.state.arena.combat.x + ctx.state.arena.combat.w)
                continue;
            if (ctx.state.match.roster.some((other: any) => other !== p && other.entityId
                && Math.abs((ctx.core.entity(other)?.position?.x ?? other.spawnX) - x) < half * 2 + 12))
                continue;
            for (let y = Math.floor(ctx.state.arena.surfaceBand.top); y <= 1024; y += 2) {
                if (!groundCell(x, y))
                    continue;
                if (![x - 14, x, x + 14].every(sx => {
                    for (let sy = y; sy <= y + 16; sy += 2)
                        if ([0, 2, 4, 6, 8].every(depth => groundCell(sx, sy + depth)))
                            return true;
                    return false;
                }))
                    continue;
                let clear = true;
                for (let sx = x - half; sx <= x + half && clear; sx += 2)
                    for (let sy = y - 66; sy < y - 2; sy += 2) {
                        const cell = talus.world.cell(sx, sy);
                        if (cell && cell.state !== 'empty' && cell.state !== 'gas') {
                            clear = false;
                            break;
                        }
                    }
                if (!clear)
                    continue;
                return { x, y };
            }
            await talus.sleepTicks(1);
        }
        throw new Error('No supported open deployment position for ' + p.name + '; seed ' + ctx.state.match.seed);
    }
    return { configureGeneration, generationChoices, prepareProcedural, prepareProceduralSites, proceduralBudget, bodyPlacement, requireProceduralReceipt, commitProcedural, deploymentGround };
}
export = create;
