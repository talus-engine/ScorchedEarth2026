/** Native terrain selection and supported tank deployment. */
import type { Runtime } from 'context';
function create(ctx: Runtime) {
    function configureGeneration(mode: string): void {
        if (mode === 'wfc')
            return;
        ctx.state.arena.surfaceBand = { top: 256, height: 800 };
        ctx.state.arena.biome = { id: mode, name: mode.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '), areaId: null };
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
    return { configureGeneration, deploymentGround };
}
export = create;
