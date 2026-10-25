# Talus engine fixes for Indigo M4

Indigo M4 is blocked on the installed **0.0.2496** build. Fix the engine capabilities below, validate them in the packaged app against the retained saves and fresh CPU-only matches, and make a new release before accepting M4. Tony owns the engine and explicitly requires engine fixes instead of game-script workarounds.

Engine checkout: `/Users/tonygermaneri/gh/foxtrot`, clean baseline `ebfcba48d7884fdbb0f00b18cec6f2e209fdc9c4`. Installed app.asar SHA256: `b8d8df44af4be97b03851a2e38f694cd5e29a4fb95e2781f79440f79dff4a417`. Game project: `/Users/tonygermaneri/gh/indigo`; template `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`. No engine source was changed during this investigation.

Read the engine's AGENTS.md and preserve accepted M1–M3 behavior: WFC streaming integrity, durable entity attribution, completed explosion ordering, editor authority, and script-reload isolation. Do not regenerate real craters, pin the whole battlefield, teleport shells to targets, apply empirical aim offsets in the game, or fabricate damage outcomes in scripts.

## E8 Ballistic aiming must match the actual shot

The zero-error `ai/action/Aim_Ballistic` graph hits at shorter ranges but repeatedly misses the two remaining tanks about 4,608 pixels apart. In the original stone match, these misses excavate shafts beside/below stationary targets until neither survivor can damage the other. This is not deliberate AI spread: both angleErrorDeg and powerError are zero.

Retained stone save: `a03cc798-b52e-4f01-af37-4fffa34670c0`, paused at turn 27. [Full trace](evidence/m4-three-seed0.json), [paused state and wind](evidence/m4-three-stall.json). Do not overwrite this reproduction. The old stone palette and M3 content are retained in `fixtures/m3/`.

Examples: target 3 stays near `(8831.5, 674)`, but turns 10, 12 and 14 end at `(8840,802)`, `(8872,837.47)`, `(8903,874)`. The opposite target is near `(4223.5,642)`; turns 11 and 13 end at `(4235.25,745)` and `(4202.32,779.75)`. Both CPU solutions remain approximately 45°/135° and 56.3%/56.7% power. Last recorded damage is on turn 9. The observer stopped without forcing an outcome.

Source findings that need to be reconciled:

- `src/ai/BehaviorTreeRuntime.ts` Aim_Ballistic solves from the entity root position. `ProjectileManager.spawnShot` launches from the arm plus spawnOffset and adds inherited root velocity. Share the launch calculation rather than maintaining independent approximations.
- `ProjectileManager.getBallisticProfile` supplies speed bounds, gravity scale and kind; it does not describe muzzle pose or the remaining forces.
- The authored rigid shell has drag 0, no spread or speed variance, speed 80–3000, gravityScale 1, spawnOffset 36. Nevertheless the captured flight has changing horizontal velocity. In [the flight capture](evidence/m4-resume-flight.json), the first snapshot is age 1/60, vx `883.7443`, whereas the recorded launch is about `883.9448`. A later long-shot diagnostic also observed significant horizontal deceleration with world wind 0. Do not attribute the entire miss to muzzle offset without measuring the trajectory.
- `RapierBridge.step` applies `AirForceSystem` before the physics step. `crates/talus-core/src/bodyforce.rs` computes drag relative to the air field, including for moving bodies in still air. This is a plausible additional force missing from the analytic aiming model; confirm against real shot telemetry. Explicit projectile drag and air coupling are distinct.

The new [mixed-terrain trajectory capture](evidence/m4-bounded-trajectory.json) records this directly: turn 4 launches at vx `1214.833862`, then reads `1214.557983` at age 1/60 and `1154.792236` at age 3.7167, with world wind 0. There are 38 samples; the shell is not held in those samples. Match the predictor to this actual trajectory and identify the responsible force rather than adding an empirical game coefficient.

The [four-CPU mixed match, seed 2](evidence/m4-bounded-four-seed2.json), save `9e2d89b3-5eb4-4b30-8c52-6b5c4ed14585`, reached turn 20 using the new bounded wait. Two tanks were eliminated on turns 1 and 5; the final pair remained alive at roughly 65 and 19 HP. No damage occurred after turn 13. All 19 impacts advanced at 180 ticks with no script fault. The observer paused at turn 20 without forcing a result. This keeps the aiming reproduction independent of the former strict settling policy.

Provide a general ballistic aiming contract consistent with the actual equipped weapon and supported physics. A supported numerical predictor or a clearly specified projectile force model is preferable to game-specific correction factors. Account for left/right shots, height differences, high arcs, muzzle offset, inherited motion and streaming holds. An unreachable target must be reported as such.

Acceptance: zero-error solutions hit stationary tank-sized targets at short and long ranges in both directions, including elevation differences and high arcs; compare predicted and actual trajectories. Repeat with camera following the shell and the shooter parked. Three- and four-CPU matches on multiple seeds must finish without repetitive shaft-digging stalemates. Keep the stone reproduction as well as the new mixed terrain tests.

## E9 Active projectile continuation is not persisted

Retained flight save: `f2c40e1a-bd40-4da0-893e-e55537267691`. [Replay and checks](evidence/m4-resume-flight.json). Reproduce with `python3 -u tools/replay_m4_resume.py --phase flight --label <new-short-label>` against the updated game.

The harness pauses after launch, saves with Cmd+S, navigates to the editor, continues the same save and resumes. The durable roster and match phase survive, but the saved shot cannot be resolved by `talus.projectiles.get(match.shotId)`. The game stops with “The saved shot is missing. Projectile persistence needs engine investigation.” Four continuation checks fail; roster identity passes.

`src/simulation/RigidBodyProjectiles.ts` explicitly marks these projectiles transient, excludes `projectile@…` bodies from chunk/object serialization, and cancels pending resolution on teardown. This is a capability gap in the current contract, not an undocumented game implementation bug.

Add an engine-owned, opt-in persistence contract for gameplay shots and their in-progress resolution. Preserve identity or expose a durable handle that game saves can resolve, lifecycle state, pose/velocity/age, shooter identity, configuration, and pending blast/payload state. Coordinate snapshot ownership so reopen neither loses nor duplicates damage, kills, payloads, terrain carving or end events. Also investigate queued weapon casts at a save boundary; the tick-boundary harness did not capture the brief firing phase, so queued-cast loss is not independently confirmed.

Acceptance: save/reopen during aiming, actual flight, impact resolution and the bounded post-impact wait. Continue the same turn once, retain attribution with a parked owner, emit one completed shot resolution, complete one bounded impact wait, then advance once. Repeated reopening must not award duplicate scores. Do not fabricate replacement shots or reset the turn in Indigo scripts.

## E10 Floating damage text never rises or expires

Tony observed accumulated stationary damage numbers. [Timed probe](evidence/m4-floaters-verified.json), [initial visible text](evidence/m4-floaters-verified-fresh.jpg), [after expiry](evidence/m4-floaters-verified-expired.jpg). A `talus.ui.floatText` label requested for 900 ms is unchanged after more than 1.5 seconds of simulation time and roughly 3 seconds of wall time. The earlier label remains visible too.

Source chain: `src/menus/scriptUiState.ts` creates the page-realm `damageFloaters.spawnText`; `src/app/composables/useOverlayDraws.ts` draws that store using its age. The only `damageFloaters.tick` caller is `src/simulation/DamageManager.ts`, in the simulation realm. The displayed store is not being aged. Check built-in damage events and teardown for the same ownership split.

Make transient text owned and aged by one presentation lifecycle, with explicit pause behavior, upward motion, fade and removal. Clear it on world teardown. Avoid per-label timers and reactive per-frame state. `size` is a scale multiplier; Indigo's mistaken initial large size has separately been corrected to 1.2. That content correction does not fix expiry.

Acceptance: script labels and ordinary damage labels visibly move upward and fade, disappear after the documented lifetime, remain bounded under rapid damage, and do not reappear after camera trips or reopening. Verify Show Damage settings still respect the documented difference between ordinary damage and explicit script text.

## Settling policy resolved in game content

Tony clarified that powder motion need not stop before play resumes. Indigo now gives each impact at least one second and at most three simulation seconds of presentation time, then advances even when the watch reports timedOut. Physics keeps running. **The former E11 settling investigation is not an engine blocker or a requested patch.** Do not freeze powders or change engine stillness thresholds to satisfy the earlier strict test.

The earlier evidence remains useful context: a first direct hit on mixed terrain exhausted 600 ticks, and a later diagnostic watch exhausted 900. Readbacks were present, with body speed 0 and nonzero particle motion. Those traces describe the old game policy and are not acceptance requirements for the new bounded wait.

The revised [settling save/reopen replay](evidence/m4-settlecap.json) passes all six continuation checks: one original shot, one completed impact, one bounded wait and one turn advancement with the same roster. Do not treat the older strict-policy timeout as a persistence failure.

The [aiming replay](evidence/m4-aimcap.json) also passes six checks, then that two-CPU mixed match [finishes naturally on turn 3](evidence/m4-twocap.json), passing 11 combat checks. [Completed-result reopening](evidence/m4-scorecap.json) passes four checks without duplicating scores. Preserve these passes while adding active-projectile persistence; E9 is specifically the missing in-flight capability, not a blanket failure of all continuation.

Keep the requested mixed terrain: DIRT and SAND powders with STONE pockets, over an entirely solid stone bottom WFC row. [Recipe](../assets/mixed-earth-brush.json), [exported brush swatch](../assets/mixed-earth-swatch.svg), [palette counts](evidence/m4-mixed-palette.json). The 50×5 dimensions are unchanged. Bottom row y=1024–1279 only admits the full 65,536-cell STONE tile. [Runtime floor audit](evidence/m4-mixed-terrain-bottom-verified.json) passes all 450 floor samples and verifies mixed materials above it. The original stone and mixed-terrain failed saves remain preserved.

## Release and verification

Run the engine's required unit, type, production and packaged checks. Include targeted regressions for each corrected ownership/physics contract and run the actual Indigo fixtures through HTTP/MCP in the packaged build. Tests must use all-CPU rosters, preserve user names/scores, and leave the diagnostic saves available. No paid activity-agent calls are necessary.

Record the tested commit, version, installed package hash, commands, results and retained evidence. After the release is installed, independently rerun M4 in Indigo. M4 remains unaccepted until the game completes these scenarios. The current game scripts deliberately expose failures rather than masking them.
