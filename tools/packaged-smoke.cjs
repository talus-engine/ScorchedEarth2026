/** Exercise real menus, CPU combat and sustained native simulation throughput. */
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { ROOT, readJSON, run } = require('./lib/files.cjs');
const { launch, until } = require('./lib/packaged-player.cjs');
const { assessPlayback } = require('./lib/playback-evidence.cjs');

async function main() {
    const { values } = parseArgs({ options: {
        app: { type: 'string' }, engine: { type: 'string', default: process.env.TALUS_ENGINE_ROOT },
        output: { type: 'string', default: path.join(ROOT, '.build/packaged-smoke') },
        recipe: { type: 'string', default: 'wfc' }, seed: { type: 'string', default: '1729' }, help: { type: 'boolean' },
        'startup-timeout': { type: 'string', default: '300' },
        'play-seconds': { type: 'string', default: '90' },
    } });
    if (values.help) return console.log('Usage: node tools/packaged-smoke.cjs [--app path.app] [--engine checkout] [--output directory] [--recipe wfc] [--seed 1729] [--startup-timeout seconds] [--play-seconds seconds>=30]');
    const startupSeconds = Number(values['startup-timeout']);
    if (!Number.isFinite(startupSeconds) || startupSeconds <= 0) throw Error('Startup timeout must be a positive number of seconds.');
    const playSeconds = Number(values['play-seconds']);
    if (!Number.isFinite(playSeconds) || playSeconds < 30) throw Error('Gameplay observation must last at least 30 seconds.');
    if (process.platform !== 'darwin') throw Error('This acceptance check runs the macOS packaged player.');
    if (!values.engine) throw Error('Set TALUS_ENGINE_ROOT or --engine to a Talus checkout with Playwright installed.');
    const settings = readJSON(path.join(ROOT, 'world/Game/publishing.json'));
    const app = path.resolve(values.app || path.join(ROOT, 'dist/packages', `${settings.appId}-${settings.version}-mac-${settings.arch}`, settings.title + '.app'));
    const { execFileSync } = require('node:child_process');
    const name = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
    const { chromium } = require(require.resolve('playwright', { paths: [path.resolve(values.engine)] }));
    fs.mkdirSync(values.output, { recursive: true });
    const output = fs.mkdtempSync(path.join(path.resolve(values.output), 'run-'));
    console.log('Evidence:', output);
    const report = { passed: false, app, criterion: 'native CPU shot and next turn, with sustained simulation targeting 60 ticks/s', recipe: values.recipe, seed: values.seed, startupSeconds, playSeconds, stages: [], playback: null };
    let player, browser, page;
    const gamePages = () => browser?.contexts().flatMap(c => c.pages()).filter(p => !p.isClosed() && p.url().startsWith('app://game/')) || [];
    const currentPage = () => gamePages().at(-1);
    const logs = [];
    const telemetry = [], states = [];
    const stage = text => { report.stages.push({ at: new Date().toISOString(), text }); console.log(text); };
    try {
        player = await launch(path.join(app, 'Contents/MacOS', name), output);
        await until(async () => {
            try { return (await (await fetch(`http://127.0.0.1:${player.cdpPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).some(t => t.type === 'page' && t.url.startsWith('app://game/')); }
            catch { return false; }
        }, 60000);
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${player.cdpPort}`);
        // Initial import can replace its bootstrap page. Select the live title page.
        page = await until(async () => {
            for (const candidate of gamePages().reverse())
                if (await candidate.getByRole('button', { name: 'New game', exact: true }).isVisible().catch(() => false)) return candidate;
            return null;
        }, 120000);
        const cdp = await page.context().newCDPSession(page);
        cdp.on('Log.entryAdded', ({ entry }) => { logs.push(entry); if (logs.length > 1000) logs.shift(); });
        await cdp.send('Log.enable');
        await page.getByRole('button', { name: 'New game', exact: true }).click({ timeout: 120000 });
        stage('Opened setup from the title screen');
        await page.locator('select[name="humans"]').selectOption('0');
        await page.locator('select[name="computers"]').selectOption('2');
        await page.getByLabel('World seed', { exact: true }).fill(values.seed);
        await page.getByText('Advanced battlefield settings', { exact: true }).click();
        await page.getByLabel('Landscape recipe', { exact: true }).selectOption(values.recipe);
        await page.locator('select[name="seriesLength"]').selectOption('1');
        await page.screenshot({ path: path.join(output, 'setup.png') });
        await page.getByRole('button', { name: 'Start match', exact: true }).click();
        stage(`Started two CPUs on ${values.recipe}, seed ${values.seed}`);
        const end = Date.now() + startupSeconds * 1000;
        let progressAt = Date.now();
        while (Date.now() < end) {
            page = currentPage();
            if (!page) { await delay(500); continue; }
            let state;
            try {
                state = await page.evaluate(() => {
                    const hud = document.querySelector('.indigo-hud');
                    const read = key => hud?.querySelector(`[data-talus-bind="${key}"]`)?.textContent?.trim() || '';
                    return { url: location.href, hud: !!hud, turn: Number(read('turnNumber')), hull: read('current.health'), control: read('current.control'),
                        status: hud?.querySelector('.hud-status[data-talus-bind="status"]')?.textContent?.trim() || '',
                        loading: read('simulationNotice'),
                        roster: hud?.querySelectorAll('.hud-roster-pilot').length || 0, body: document.body.innerText.slice(-6000) };
                });
            } catch { await delay(500); continue; }
            report.lastState = state;
            const matchError = /^Error:|Match stopped/i.test(state.status);
            if (matchError || /Create world failed|Engine failed|GPU device lost/i.test(state.body)) throw Error(matchError ? state.status : state.body);
            if (state.hud && state.turn >= 1 && Number(state.hull) > 0 && state.roster === 2 && /computer/i.test(state.control)
                && state.status === 'Computer is choosing its shot') {
                stage('Both tanks deployed, camera arrived and the CPU is choosing its shot');
                await page.screenshot({ path: path.join(output, 'first-turn.png') });
                await page.evaluate(() => {
                    window.__indigoPlaybackSamples = [];
                    window.addEventListener('talus:raf-frame-stats', e => {
                        window.__indigoPlaybackSamples.push({ telemetry: e.detail.performanceTelemetry });
                        if (window.__indigoPlaybackSamples.length > 240) window.__indigoPlaybackSamples.shift();
                    });
                });
                // Allow the first and last native telemetry samples to span the requested duration.
                const playingUntil = Date.now() + (playSeconds + 1) * 1000;
                let sawShot = false, sawNextTurn = false, dropStarted = null;
                while (Date.now() < playingUntil) {
                    const observed = await page.evaluate(() => {
                        const hud = document.querySelector('.indigo-hud');
                        const read = key => hud?.querySelector(`[data-talus-bind="${key}"]`)?.textContent?.trim() || '';
                        return { turn: Number(read('turnNumber')), status: hud?.querySelector('.hud-status[data-talus-bind="status"]')?.textContent?.trim() || '',
                            loading: read('simulationNotice'), samples: window.__indigoPlaybackSamples.splice(0) };
                    });
                    telemetry.push(...observed.samples);
                    states.push({ wall: Date.now(), turn: observed.turn, status: observed.status, loading: observed.loading });
                    if (/^Error:|Match stopped/i.test(observed.status)) throw Error(observed.status);
                    sawShot ||= /Attack in flight|rocket in flight|impact settle/i.test(observed.status);
                    sawNextTurn ||= sawShot && observed.turn > state.turn;
                    if (/SUPPLY DROP/.test(observed.status)) dropStarted ??= Date.now();
                    else dropStarted = null;
                    if (dropStarted !== null && Date.now() - dropStarted > 15000) throw Error('Supply-drop presentation exceeded 15 real seconds');
                    await delay(250);
                }
                report.playback = { ...assessPlayback(telemetry), sawShot, sawNextTurn };
                if (!report.playback.passed) throw Error(report.playback.problems.join('; '));
                if (!sawShot || !sawNextTurn) throw Error('CPU combat did not complete a shot and advance to the next turn');
                report.passed = true;
                stage(`Gameplay accepted: ${report.playback.meanHz.toFixed(1)} sim ticks/s, shot completed and next turn reached`);
                await page.screenshot({ path: path.join(output, 'gameplay.png') });
                return;
            }
            if (Date.now() - progressAt > 15000) { stage(state.hud ? `Waiting for turn 1: ${state.status || state.loading}` : 'Waiting for the game world'); progressAt = Date.now(); }
            await delay(500);
        }
        throw Error(`The packaged game never reached a playable CPU turn within ${startupSeconds} seconds`);
    } catch (error) {
        report.error = error.message;
        page = currentPage() || page;
        if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 }).catch(() => {});
        throw error;
    } finally {
        if (telemetry.length && !report.playback) report.playback = assessPlayback(telemetry);
        fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
        fs.writeFileSync(path.join(output, 'playback.json'), JSON.stringify({ telemetry, states }, null, 2) + '\n');
        fs.writeFileSync(path.join(output, 'console.json'), JSON.stringify(logs, null, 2) + '\n');
        if (page && !page.isClosed()) await page.evaluate(() => window.talusHost.quit()).catch(() => {});
        await browser?.close().catch(() => {});
        await player?.close();
    }
}
if (require.main === module) run(main);
