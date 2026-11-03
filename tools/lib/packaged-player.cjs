/** Launch an unchanged packaged player with fresh storage before its entry point runs. */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

async function until(fn, timeout = 30000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(200); }
    throw Error('Timed out waiting for the packaged player');
}

async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

async function launch(executable, output) {
    const inspectorPort = await freePort(), cdpPort = await freePort();
    const profile = fs.mkdtempSync(path.join(output, 'profile-'));
    const log = fs.openSync(path.join(output, 'app.log'), 'w');
    const child = spawn(executable, [`--inspect-brk=${inspectorPort}`, `--remote-debugging-port=${cdpPort}`], { stdio: ['ignore', log, log] });
    fs.closeSync(log);
    let socket, spawnError;
    child.once('error', error => { spawnError = error; });
    const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
    async function close() {
        socket?.close();
        if (child.exitCode === null && child.signalCode === null && child.pid) child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
        try { await exited; } finally { clearTimeout(timer); }
        fs.rmSync(profile, { recursive: true, force: true });
    }
    try {
        const target = await until(async () => {
            if (spawnError) throw spawnError;
            if (child.exitCode !== null || child.signalCode !== null) throw Error('Player exited before startup');
            try { return (await (await fetch(`http://127.0.0.1:${inspectorPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json())[0]; }
            catch { return null; }
        });
        socket = new WebSocket(target.webSocketDebuggerUrl);
        const pending = new Map(); let nextId = 0, paused;
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.method === 'Debugger.paused') paused = message.params;
            const waiter = pending.get(message.id);
            if (waiter) {
                pending.delete(message.id); clearTimeout(waiter.timer);
                message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
            }
        });
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(Error('Player inspector timed out: ' + method)); }, 15000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
        });
        await call('Runtime.enable'); await call('Debugger.enable');
        await call('Runtime.runIfWaitingForDebugger'); await until(() => paused);
        // Change storage alone, before the wrapper calls configureGameStorage.
        // No game code, engine settings or runtime state is replaced by the test.
        const result = await call('Debugger.evaluateOnCallFrame', {
            callFrameId: paused.callFrames[0].callFrameId,
            expression: `(() => { const app = require('electron').app; app.setPath('appData', ${JSON.stringify(profile)}); return app.getPath('appData'); })()`,
            returnByValue: true,
        });
        if (result.exceptionDetails || result.result?.value !== profile) throw Error('Player storage isolation failed: ' + JSON.stringify(result));
        await call('Debugger.resume'); socket.close();
        return { cdpPort, profile, close };
    } catch (error) { await close(); throw error; }
}

module.exports = { launch, until };
