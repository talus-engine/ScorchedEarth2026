# CPU firing solutions and measured feedback

Implemented on the game side using existing `weapon.plan`, projectile events,
blackboards and saved match state. No new engine API is required.

## Behavior

- Search a useful 2–3-weapon shortlist with enough candidates per weapon,
  preserving the overall skill budget and a demolition reserve. Keep native
  terrain/collision/unknown-physics refusals authoritative.
- Remove the random angle/power errors on every planning attempt. All skill
  levels now use an eight-pixel aiming tolerance. Skill changes search budget
  and learning rate, not a new dice roll after a hit.
- Search a fine elevation grid for fixed-speed guns; the previous direct
  line-of-sight angle ignored gravity/drop.
- Store bounded per-target/per-weapon records in saved match state and expose
  them on `custom.fireControls`. Each pair retains its last useful observation,
  best successful angle/power, measured range correction and correction gain.
  Switching weapons does not discard another weapon's learning.
- Correct short/long impacts by changing requested range and asking the native
  solver for the resulting power. Try the last useful/proven angle first and
  re-survey the corridor. Ordinary repositioning can retain feedback; substantial
  changes in range, height, side or wind invalidate its applicability without
  deleting the evidence.
- Successful solutions receive target/weapon preference. A settled successful
  tank holds position instead of randomly exploring. Emergency escape remains
  available. Direct hits outrank splash hits; worse follow-ups cannot overwrite
  the best solution, roll back its correction and reduce correction gain.
- MIRV apex releases, deliberate support/demolition shots, expiration, distant
  wall/body collisions and moving-target observations remain diagnostics rather
  than misleading ordinary range corrections. Uncertain field/fluid shots can
  retain an observed hit without being relabelled a clear forecast.
- Recheck a changed firing pose/target/wind after the three-second speech, before
  spending ammunition. This is one bounded native fixed-angle re-solve; a refusal
  preserves ammo and enters the existing explicit pass/stall policy. Normal
  unchanged-pose speech timing stays the same.
- Preserve native zero power when applying a solution. Log planned and actual
  launch pose/velocity, angle/power, endpoint, hit classification and flight time
  so a launch/model mismatch is diagnosable instead of hidden in aim randomness.

The two bounds are 64 observations and 64 weapon/target records per tank. Records
are ordinary saved game data; there is no hidden closure-only learning state.
Five personas retain their strategy, risk, shopping, movement and voice choices.
Learning rates are .45/.55/.65/.8/.9 from rookie to expert; search budgets remain
12/24/48/72/96.

## Authoritative baseline

Run from Indigo:

```
node ../foxtrot/node_modules/vitest/vitest.mjs run --config tools/aim-benchmark.config.mjs
node tools/check_cpu_learning.cjs
```

The first command runs **actual Talus Rapier/WASM**, with game planner requests
and weapon specs. It never starts an app, opens a profile/database or uses the
GPU. The result records SHA-256 hashes of the WASM, native planner and game code
in `evidence/cpu-aim/native-benchmark.json`.

Twelve native benchmarks pass:

| Case | Result |
| --- | --- |
| Flat, left and right, 800px | Each passes target plane within 0.10px |
| 2,304px artillery range | Within 0.01px |
| 400px elevated target beyond valley wall | Clears wall envelope, within 0.10px |
| Wind + elevated target | Within 0.18px |
| Fixed-speed machine gun | Elevation compensates drop; within 6.51px |
| Unmodelled constant force, expert, six shots | Native floor-contact range error: 36.11 → 5.18 → 0.73px, then unchanged |
| Same force, all five skills | All converge below 4px in six shots; error does not increase |

The first six measure the real native trajectory at the target plane, with a
static survey fixture (wall clearance is checked against its envelope). The
learning test uses real Rapier contact with a fixed ground body; its hit window
is a defined ±20px horizontal target region and direct window ±4px. These are
controlled benchmarks, **not** claims of live tank damage or full GPU air-field
prediction. The unmodelled force is intentionally absent from the forecast to
prove actual-impact feedback, not to pretend we can predict evolving air.

The expert benchmark serializes/restores learned records every turn and verifies
repeated subsequent plans retain the successful power with no RNG consumption.
Policy tests separately verify actual projectile hit/end wiring, normalized
power, duplicate-event handling, regression rollback, distinct weapon memory,
geometry invalidation, bounded retention, field hit reuse, holding a successful
position and the post-speech pose recheck.

Additional passing checks: strict TypeScript, CPU inventory/uncertain-drag policy,
menu start, safe exit, arcade timing and camera interruption sequencing. The
camera fixture now yields through the existing asynchronous supply-boundary
check before marking camera arrival; its actual camera assertions are unchanged.

## Delivery boundary

Source changes are ready for installation/export. The still-running published
0.3.1 application embeds the old engine/game code and was not modified or closed.
Actual articulated-tank combat, dynamic terrain/air and a fresh packaged CPU
series remain live acceptance work. Use the newly installed engine 2588 (or its
successor) for a fresh release-matched export; do not restamp the old snapshot.

Related completed source work: `start-flow.md` removes the invalid Continue
button and automatically starts CPU-only opening rounds after purchasing. The
engine's public scripted next-round transition and headless database export are
still queued; the new menu editor request is in `menu-editor-engine-prompt.md`.
