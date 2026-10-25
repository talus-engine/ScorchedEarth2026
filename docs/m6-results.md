# M6 — random death chaos

**In progress; blocked on engine capabilities and one reproduced particle-spray defect.** Tested against installed Talus 0.0.2497. M5 remains accepted and is snapshotted under `fixtures/m5/`. The current engine handoff is [the M6 patch prompt](engine-m6-patch-prompt.md).

## Implemented game behavior

Each eliminated roster member receives one seeded random effect, recorded in global match state and its NPC blackboard. Duplicate death notifications cannot repeat effects or kills. Physical shell ownership remains the deceased tank's durable ID. Particle chemistry retains the engine's environmental attribution; no invented kill attribution is applied.

Scheduled hazards run on simulation ticks alongside normal turns. The camera remains at 25% and temporarily frames active wreck effects as well as all surviving tanks. Primary turn projectiles and secondary death shells have separate tracking. If the current tank dies while waiting for its cast, the turn advances; an already launched primary shot keeps its impact/settle path. Focus checks handle a tank dying while being prepared.

When zero or one tank remains, the match waits for scheduled emissions and all tracked secondary shell endings, then three simulation seconds. It does not wait forever for loose matter to stop moving. The result is based on the remaining survivors at that point, so a chain reaction can produce a draw. Scores commit once. Arbitrary mid-flight resume still requires E9; missing saved secondary projectiles fail explicitly instead of being replayed or discarded.

The effect-selection RNG and authored shell direction draws persist in match state. Native particle scatter and physics retain their engine behavior; this does not claim whole-simulation determinism.

## Catalog

| Effect | Behavior | Current status |
| --- | --- | --- |
| One hundred bad decisions | 100 real shells at the wreck, all detonate in one tick | Playable |
| Hostile fireworks | Ten shells in a radial fan over 0.72 seconds | Playable |
| Popcorn minefield | Six bouncing shells with 2.5-second fuses | Playable |
| Your personal meteor shower | Eight shells dropped over the wreck's neighborhood | Playable |
| Ten-second furnace | Continuous FIRE jet from the wreck's top for ten seconds | Scheduler tested; disabled for E16 |
| Thermite confetti | THERMITE spray plus ignition | Disabled for E16 |
| Oil well from hell | Burning oil geyser | Disabled for E16 |
| Pocket volcano | LAVA fountain | Disabled for E16 |
| Cryogenic tantrum | Liquid nitrogen spray | Disabled for E16 |
| Corrosive sprinkler | Hydrochloric acid spray | Disabled pending the shared spray initialization fix |
| Dynamite makeover | Actual hull becomes dynamite; paint retained; 2×2 FIRE center | Requires E14 |
| Acid bath | Actual hull becomes flowing acid | Requires E14 |
| Extremely poor reactor design | Random 96–240 radius FIRE brush | Requires E15 |
| The last laugh | Ten random shells in 0.75 seconds, then lit dynamite hull | Requires E14 |

Disabled entries are retained as explicit requirements; the random selector uses only enabled entries. They are not silently replaced by ordinary explosions. `FIRE` and `HYDROCHLORIC_ACID` are the actual palette names corresponding to the requested flame and acid.

## Evidence and limits

[Camera/100-shell replay](evidence/m6-2497-camera.json) passes 12 scheduling and lifecycle checks. The furnace performs 100 accepted pulses / 3,200 allocations over ten simulation seconds. The magazine records exactly 100 launch, detonate and end events in one tick. [Variety replay](evidence/m6-2497-variety.json) passes 48 corresponding checks for the eight additional effects, including exact real shell counts for fireworks, mines and meteors.

Those spray counts measure accepted allocations, **not correct thermal behavior**. The [material probe](evidence/m6-2497-material-probe.json) disproves physical acceptance of the thermal sprays. After six ticks, spray FIRE is smoke around 325 K versus a mostly-FIRE fill control around 885 K; spray lava is basalt around 298 K versus molten fill around 1392 K; sprayed nitrogen is gas around 295 K versus a mostly-liquid cold control. The [element defaults](evidence/m6-element-defaults-summary.json) confirm the expected initial temperatures. The six spray effects were then disabled, pending the engine repair.

The initial furnace test exposed game camera framing that dropped a dead wreck from the active ring. The corrected scheduler includes active wreck coordinates; the retest emits on all 100 pulses. Its [screenshot](evidence/m6-2497-camera-furnace.jpg) then prompted the temperature investigation because the expected flame was absent. The earlier [first attempt](evidence/m6-2497-first.json) is retained as superseded evidence, not acceptance.

The [four-CPU concurrency replay](evidence/m6-2497-concurrent-combat.json) passes nine live checks and finishes on turn 11. Later turns execute while the ten-second job is active, all survivors stay live at 25%, each death has one completed effect, secondary launches do not steal primary tracking, and completed-result save/reopen preserves winner and scores exactly once. This test enables the furnace only in its diagnostic world to measure scheduling; it does not claim E16 is fixed.

The [final preview match](evidence/m6-2497-preview-combat.json), with only the four supported shell variants enabled and no forced selections, passes eight live checks and finishes on turn 10. Completed save/reopen, exact-once scoring, survivor residency, and primary-shot isolation all pass.

The [corrected physical chain replay](evidence/m6-2497-chain-recheck.json) passes six live checks. A controlled dead tank emits 100 real shells, kills its weakened neighbor after death, receives that kill credit, and triggers another 100-shell burst. All 200 shells end, no projectile remains, and the match records a draw after the bounded aftermath. Only initial position/health and the first death are controlled; the chain kill is delivered by actual engine explosions.

`node tools/check_m6.cjs` exercises actual game functions for duplicate deaths, interrupted casts, synchronous secondary launch/end handling, overlapping hazards, bounded aftermath, a draw, posthumous credit, score idempotence and RNG restoration. It mocks engine physics and does not substitute for live material tests. The existing 2–16 tank layout and movement-boundary checks still pass. Strict TypeScript checking passes against the installed API declarations.

## Tools

- `tools/install_m6.py` installs game content and the ragdoll-capable M6 tank clone while preserving M5 assets. Open the Indigo template editor first.
- `tools/verify_m6.py` runs isolated CPU-only effect diagnostics. Its forced choices exist only in disposable test-world script copies. The driver enables only its requested effect in that diagnostic world; this allows E16 reproductions without enabling broken sprays in the production catalog.
- `tools/probe_m6_materials.py` compares real spray/fill GPU material and temperature output.
- `tools/verify_m6_combat.py` verifies a complete CPU match, camera residency, primary/secondary shot separation, result timing and completed-result persistence. `--furnace` enables only the furnace in that diagnostic world to measure concurrent turns; it does not repair E16.
- `tools/m6_support.py` waits for actual session navigation and restores the captured names, settings, scores and ready game. Future diagnostics capture the current session when they start; start from a loaded game, not the template editor.

The initial [chain/cast harness](evidence/m6-2497-chain.json) did not exercise its requested condition: this cannon launches synchronously, so the observer never saw a pending `firing` phase. A normal shot killed the weakened neighbor and the game completed; the cast assertion correctly failed. This is a diagnostic setup limitation, not evidence of an engine cast defect. Interrupted-cast policy is covered by the game-function regression; physical chain behavior is tested separately.

No multi-gigabyte E2E profile was created. Test saves and compact JSON evidence are retained. The engine patch prompt requires release validation before declaring M6 complete.

## Final user session

Final cleanup found that `m6-start.json` contained stale **M5 Verify** settings and a test-only scoreboard, even though its saved roster was Tony/Copper. The independently captured pre-M5-test baseline records Tony/Copper, two CPUs, 30-second turns and an empty scoreboard. That verified baseline is retained in [m6-user-baseline.json](evidence/m6-user-baseline.json), with provenance; it is restored for the final preview. The mistaken intermediate preview is retained as [superseded evidence](evidence/m6-2497-stale-baseline-preview.json). No real player score was discarded.

The final [ready-state verification](evidence/m6-2497-preview-ready.json) records a fresh two-CPU Tony/Copper M6 preview, seed 7, 25% zoom, the original settings and clean original scores, no script error, and exactly four enabled effects. The earlier M5 ready save remains available. Click **Begin match** to run the preview.
