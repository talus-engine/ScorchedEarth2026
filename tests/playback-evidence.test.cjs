const test = require('node:test');
const assert = require('node:assert/strict');
const { assessPlayback } = require('../tools/lib/playback-evidence.cjs');
function trace(hz, seconds = 30) {
    return Array.from({ length: seconds * 2 + 1 }, (_, sequence) => ({
        fps: 60, telemetry: { sequence, sampledAtMs: sequence * 500, currentFps: 60, metrics: { simStepsPerSec: hz } },
    }));
}
test('smooth presentation cannot pass slow or stopped simulation', () => {
    assert.equal(assessPlayback(trace(60)).passed, true);
    for (const hz of [0, 4.25, 18, 30, 57]) {
        const result = assessPlayback(trace(hz));
        assert.equal(result.passed, false);
        assert.equal(result.meanHz, hz);
    }
});
test('normal simulation still requires smooth presentation', () => {
    const samples = trace(60);
    for (const row of samples) row.telemetry.currentFps = 30;
    assert.equal(assessPlayback(samples).passed, false);
    for (const row of samples) delete row.telemetry.currentFps;
    assert.equal(assessPlayback(samples).passed, false);
});
test('repeated telemetry is not additional evidence and missing telemetry fails', () => {
    const samples = trace(60);
    assert.deepEqual(assessPlayback(samples.flatMap(s => [s, s, s])), assessPlayback(samples));
    assert.equal(assessPlayback([]).passed, false);
    assert.equal(assessPlayback(trace(60, 3)).passed, false);
});
test('a long stall fails even when the remaining trace is fast', () => {
    const samples = trace(60, 90);
    for (let i = 20; i <= 32; i++) samples[i].telemetry.metrics.simStepsPerSec = 0;
    const result = assessPlayback(samples);
    assert.ok(result.meanHz > 54);
    assert.equal(result.passed, false);
    assert.ok(result.longestSlowSeconds > 5);
    assert.equal(assessPlayback(trace(60).filter((_, i) => i < 10 || i > 28)).passed, false);
});
