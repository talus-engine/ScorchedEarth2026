/**
 * Live-flight correction for native ballistic forecasts.
 *
 * The native planner integrates gravity, the weapon's authored drag and constant wind. Live rigid
 * shells also lose speed to air coupling the forecast leaves out (plans report
 * `evolving-air-fields-not-predicted`), so long and slow arcs land measurably short of the
 * forecast. These helpers keep the planner's validated launch angle and solve the power for a
 * drag-aware flight, and fit that drag from the game's own observed shots.
 */
type Point = { x: number; y: number };
type Launch = { x: number; y: number; vx: number; vy: number };
type Forecast = { angle: number; power: number; speed: number; origin: Point; velocity: Point; time: number; end: Point };
type Speeds = { speed?: number; speedAtMinPower?: number };
type LiveAim = { power: number; speed: number; launch: Launch; gravity: number; drag: number };

/** Linear drag (1/s) measured for rigid shells in open air on Talus build 2961. */
const DEFAULT_DRAG = .015;
const MIN_DRAG = 0, MAX_DRAG = .1;
const STEP = 1 / 60;
const finite = (...values: number[]) => values.every(Number.isFinite);

function forecast(s: any): Forecast | null {
    return s && finite(s.angle, s.power, s.speed, s.time, s.origin?.x, s.origin?.y, s.velocity?.x, s.velocity?.y, s.end?.x, s.end?.y)
        && s.speed > 0 && s.time > .05 ? s : null;
}

/** Gravity (px/s²) implied by a native forecast's own launch, flight time and endpoint. */
function impliedGravity(solution: any): number | null {
    const s = forecast(solution);
    if (!s) return null;
    const g = 2 * (s.end.y - s.origin.y - s.velocity.y * s.time) / (s.time * s.time);
    return Number.isFinite(g) && g > 0 ? g : null;
}

/** One exact step of constant acceleration with linear drag. */
function advance(position: number, velocity: number, acceleration: number, drag: number, dt: number): [number, number] {
    if (Math.abs(drag * dt) < 1e-9)
        return [position + velocity * dt + acceleration * dt * dt / 2, velocity + acceleration * dt];
    const terminal = acceleration / drag, decay = Math.exp(-drag * dt);
    return [position + terminal * dt + (velocity - terminal) * (1 - decay) / drag, terminal + (velocity - terminal) * decay];
}

/** Height of a free flight where it first crosses `targetX`, or null if it never gets there. */
function heightAt(launch: Launch, gravity: number, wind: number, drag: number, targetX: number, maxSeconds = 30): number | null {
    const direction = targetX >= launch.x ? 1 : -1;
    let { x, y, vx, vy } = launch;
    for (let time = 0; time < maxSeconds; time += STEP) {
        const [nx, nvx] = advance(x, vx, wind, drag, STEP), [ny, nvy] = advance(y, vy, gravity, drag, STEP);
        if ((nx - targetX) * direction >= 0) {
            // Sub-step to the exact crossing rather than interpolating a chord.
            let lo = 0, hi = STEP;
            for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if ((advance(x, vx, wind, drag, mid)[0] - targetX) * direction >= 0) hi = mid; else lo = mid; }
            return advance(y, vy, gravity, drag, hi)[0];
        }
        if ((nx - x) * direction <= 0) return null;
        x = nx; y = ny; vx = nvx; vy = nvy;
    }
    return null;
}

function speedRange(spec: Speeds): { min: number; max: number } | null {
    const max = Number(spec?.speed), min = Number(spec?.speedAtMinPower ?? spec?.speed);
    return finite(min, max) && max > min && min >= 0 ? { min, max } : null;
}

/** Whether power changes this weapon's launch speed, so a forecast's power can be corrected. */
function correctable(spec: Speeds): boolean {
    return speedRange(spec) !== null;
}

/**
 * Power that lands the forecast's validated angle on `target` under live drag. `planned` is the
 * point the native forecast was solved for; this model's drag-free bias there is carried to the
 * target column, so integration differences between the two models cancel.
 * Null when the forecast is incomplete or power cannot change speed. When full power still falls
 * short, `capped` returns full power (the closest this angle gets); otherwise null.
 */
function compensate(solution: any, planned: Point, target: Point, spec: Speeds, wind: number, drag: number, capped = false): LiveAim | null {
    const s = forecast(solution), range = speedRange(spec), gravity = impliedGravity(solution);
    if (!s || !range || gravity === null || !finite(planned?.x, planned?.y, target?.x, target?.y, wind, drag)) return null;
    const dx = s.velocity.x / s.speed, dy = s.velocity.y / s.speed;
    const launch = (speed: number): Launch => ({ x: s.origin.x, y: s.origin.y, vx: dx * speed, vy: dy * speed });
    const free = heightAt(launch(s.speed), gravity, wind, 0, planned.x);
    if (free === null) return null;
    const goal = target.y + free - planned.y;
    // y grows downward: a faster shell crosses the target column higher, so the miss falls with
    // speed. A shell that never reaches the column counts as short.
    const short = (speed: number) => { const h = heightAt(launch(speed), gravity, wind, drag, target.x); return h === null || h - goal > 0; };
    if (short(range.max)) return capped ? { power: 1, speed: range.max, launch: launch(range.max), gravity, drag } : null;
    let lo = range.min, hi = range.max;
    if (!short(lo)) return null;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (short(mid)) lo = mid; else hi = mid;
    }
    const speed = hi, power = Math.min(1, Math.max(0, (speed - range.min) / (range.max - range.min)));
    return { power, speed, launch: launch(speed), gravity, drag };
}

/** Linear drag that explains an observed free flight from `launch` to `impact`, or null. */
function fitDrag(launch: Launch, gravity: number, wind: number, impact: Point): number | null {
    if (!finite(launch?.x, launch?.y, launch?.vx, launch?.vy, gravity, wind, impact?.x, impact?.y)) return null;
    // More drag crosses the impact column lower (larger y).
    const miss = (drag: number) => { const h = heightAt(launch, gravity, wind, drag, impact.x); return h === null ? null : h - impact.y; };
    let lo = MIN_DRAG - .02, hi = MAX_DRAG;
    const low = miss(lo), high = miss(hi);
    if (low === null || high === null || low > 0 || high < 0) return null;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, m = miss(mid);
        if (m !== null && m < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/** Drag estimate from fitted samples, shrunk toward the measured default until samples accumulate. */
function calibratedDrag(samples: readonly number[] | undefined): number {
    const valid = (samples || []).filter(v => Number.isFinite(v));
    const estimate = (DEFAULT_DRAG * 2 + valid.reduce((sum, v) => sum + v, 0)) / (2 + valid.length);
    return Math.min(MAX_DRAG, Math.max(MIN_DRAG, estimate));
}

export = { DEFAULT_DRAG, impliedGravity, heightAt, correctable, compensate, fitDrag, calibratedDrag };
