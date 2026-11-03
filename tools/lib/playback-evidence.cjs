/** Evaluate simulation progress independently of the display frame rate. */
function assessPlayback(samples, { targetHz = 60, minimumRatio = 58 / 60, minimumSeconds = 30 } = {}) {
    const unique = new Map();
    for (const sample of samples) {
        const t = sample.telemetry;
        if (Number.isFinite(t?.sampledAtMs) && Number.isFinite(t?.metrics?.simStepsPerSec))
            unique.set(t.sequence, t);
    }
    const rows = [...unique.values()].sort((a, b) => a.sampledAtMs - b.sampledAtMs);
    let seconds = 0, steps = 0, frames = 0, displaySeconds = 0, longestSlowSeconds = 0, slowSeconds = 0;
    for (let i = 1; i < rows.length; i++) {
        const dt = (rows[i].sampledAtMs - rows[i - 1].sampledAtMs) / 1000;
        if (dt <= 0) continue;
        seconds += dt;
        // A telemetry gap is a stall, not evidence of normal-speed simulation.
        const observed = Math.min(dt, 1);
        const hz = rows[i].metrics.simStepsPerSec;
        steps += hz * observed;
        if (Number.isFinite(rows[i].currentFps)) {
            frames += rows[i].currentFps * observed;
            displaySeconds += dt;
        }
        slowSeconds = hz < targetHz * minimumRatio || dt > 1 ? slowSeconds + dt : 0;
        longestSlowSeconds = Math.max(longestSlowSeconds, slowSeconds);
    }
    const meanHz = seconds ? steps / seconds : 0;
    const meanFps = displaySeconds ? frames / displaySeconds : 0;
    const problems = [];
    if (seconds < minimumSeconds) problems.push(`Only ${seconds.toFixed(1)} seconds of simulation telemetry`);
    if (meanHz < targetHz * minimumRatio) problems.push(`Simulation averages ${meanHz.toFixed(1)} / ${targetHz} ticks per second`);
    if (displaySeconds < minimumSeconds) problems.push('Insufficient display FPS telemetry');
    if (meanFps < 58) problems.push(`Presentation averages ${meanFps.toFixed(1)} FPS`);
    if (longestSlowSeconds > 5) problems.push(`Simulation stays below target for ${longestSlowSeconds.toFixed(1)} seconds`);
    return { passed: problems.length === 0, targetHz, minimumRatio, samples: rows.length, seconds, meanHz, meanFps, longestSlowSeconds, problems };
}

module.exports = { assessPlayback };
