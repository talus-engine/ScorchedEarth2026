# Indigo M4 results

**M4 is implemented in the current template but is not accepted on Talus 0.0.2496.** CPU-only testing found blockers in long-range aiming, active projectile persistence, floating text. Tony resolved the settling behavior by requesting a bounded wait instead of requiring all powder motion to stop. The [engine patch prompt](engine-m4-patch-prompt.md) contains reproductions, source findings and release acceptance. No engine source was changed.

## Current game content

The command behavior graph chooses a nearby vulnerable opponent, requests the engine's ballistic solution, favors a high arc over nearby cover or an obstructed previous shot, shows the choice briefly and requests one shot. Angle and power errors are zero during these diagnostics. The script does not contain a replacement ballistic solver. The shell's power spans 80–3000 px/s so distant opponents are within its nominal range.

The HUD shows aim direction, target, tactic and the last hit. A new tank rig includes an aim pivot and held cannon barrel. Camera transitions fade between turns; in flight the camera continues to follow the current projectile. Damage feedback uses the engine's floatText API at scale 1.2. Its movement and expiry remain blocked by E10; the static last-hit HUD line is intentionally persistent. The saved focusing phase resumes the already-selected turn rather than selecting another tank.

The **Mixed Reach** biome replaces the new-game stone palette. It uses an engine-authored noise brush with DIRT, SAND and STONE bands. The exported 512×512 swatch supplies four interior variants and 18 connected surface variants, plus sky and solid bedrock: 24 tiles total. No separate noise generator was substituted in Python; the builder cuts and masks the actual engine-painted material indices into the WFC atlas.

The arena remains 50×5 WFC tiles, each 256×256 pixels. Rows 0–1 are sky, row 2 is the connected mixed surface, row 3 is mixed interior, and **all 50 tiles in row 4 are solid STONE**, y=1024–1279. Every bedrock tile contains 65,536 stone cells. The row sockets only admit that solid tile. This is destructible terrain, so a weapon can intentionally excavate it; powders cannot fall through an initially absent floor. The menu still accepts a specified seed or randomness. WFC arrangement varies with the game seed.

Each impact now waits at least one and at most three simulation seconds, then advances the turn even if the engine still reports particle motion. Physics continues running. The earlier 600/900-tick timeout traces below describe the previous strict policy and remain preserved as history.

## Verification and retained evidence

| Scenario | Result | Evidence |
| --- | --- | --- |
| Mixed palette import | 24 tiles, 250 anchors, no unresolved materials, fallback pixels or warnings; only sky intentionally empty | [Import](evidence/m4-terrain-import.json), [layout](evidence/m4-mixed-layout.json), [tile counts](evidence/m4-mixed-palette.json) |
| Fresh mixed terrain, seed 1 | All 450 floor samples across 50 tiles are resident STONE; dirt, sand and stone present above | [Floor audit](evidence/m4-mixed-terrain-bottom-verified.json) |
| Four CPUs, mixed map, seed 2, bounded wait | Reached turn 20 without a script fault; 19 impacts each advanced after 180 ticks. Tanks 2 and 4 were eliminated and skipped. The remaining pair stopped dealing damage after turn 13; observer paused without forcing a winner | [Combat trace](evidence/m4-bounded-four-seed2.json), [38-sample trajectory](evidence/m4-bounded-trajectory.json) |
| Save/reopen during bounded impact wait | All six checks pass: same roster, no fault, one original launch/resolution, one wait, one turn advancement | [Bounded replay](evidence/m4-settlecap.json) |
| Save/reopen while aiming, bounded wait | All six continuation checks pass; the original CPU turn fires and advances exactly once | [Aiming replay](evidence/m4-aimcap.json) |
| Two CPUs, mixed map, seed 0, continued after aiming replay | Finishes naturally on turn 3; all 11 combat checks pass, including parked-owner attribution, capped waits, elimination, one shot per turn and recorded winner | [Completed match](evidence/m4-twocap.json) |
| Completed mixed match save/reopen | All four checks pass: roster/winner, score ledger, remembered settings and scoreboard; no duplicate score | [Score replay](evidence/m4-scorecap.json) |
| Fresh two-CPU match after weapon readiness/color corrections | Ready weapon is pinned at 45°/70%; finishes naturally on turn 3 and repeats all 11 combat passes | [Final content regression](evidence/m4-aimready.json) |
| Three CPUs, original stone map, seed 0 | Middle tank eliminated; two survivors repeatedly miss at long range. No forced winner | [Combat trace](evidence/m4-three-seed0.json), [paused turn 27](evidence/m4-three-stall.json) |
| Three CPUs, mixed map, seed 1, former strict wait | First shot directly hits for 56.9449 damage; attribution survives shooter parking. Match stops on the old settle timeout | [Combat trace](evidence/m4-mixed-three-seed1.json) |
| Longer independent settle watch | Another 900-tick timeout; chunk motion readings present, fastest body speed 0 | [Inspection](evidence/m4-settle-inspect-first.json), [results](evidence/m4-settle-events.json) |
| Save/reopen in flight | Roster retained; projectile missing and continuation stops | [Flight replay](evidence/m4-resume-flight.json) |
| Save/reopen while settling, former strict wait | One launch and one completed impact retained; restarted watch reaches the old timeout | [Historical replay](evidence/m4-resume-settling.json) |
| Save/reopen while aiming, former strict wait | Roster and one shot/impact retained; the old settling policy blocks advancement | [Historical replay](evidence/m4-resume-aim-check.json) |
| Floating text, requested 900 ms | Same visible position and opacity after the lifetime; earlier labels accumulate | [Timed probe](evidence/m4-floaters-verified.json), [before](evidence/m4-floaters-verified-fresh.jpg), [after](evidence/m4-floaters-verified-expired.jpg) |

Original stone stall save: `a03cc798-b52e-4f01-af37-4fffa34670c0`. Missing-projectile save: `f2c40e1a-bd40-4da0-893e-e55537267691`. Mixed first-impact save: `e5ae98bd-a1b8-4790-b88b-949a36361d35`. Settling continuation save: `fd1cc202-9c47-4cde-9c89-7602b78458a2`. Accepted earlier saves and `fixtures/m2/`, `fixtures/m3/` remain preserved.

The first aiming-reopen attempt had an observer navigation race; the game itself resumed and completed a two-CPU stone match in three turns, retained in [its observed state](evidence/m4-resume-aiming-observed.json). This is useful evidence, not a clean pass of the revised replay harness. A tick-boundary firing-phase capture timed out because it did not observe that brief phase; it does not establish a queued-cast persistence defect.

The revised two-CPU scenario and save/reopen tests pass 27 checks in total (6 aiming, 6 post-impact wait, 11 combat, 4 completed-result reopening). TypeScript checking against the installed Talus declaration file and Python compilation pass. These passes cover their stated scenarios, not the outstanding engine blockers.

## Test and authoring corrections

The initial atlas used separate indexed PNGs for individual tiles, while the SVG reader expects the indexed material image to cover the whole document. The builder now writes one full atlas; the validated import has zero warnings. The first floor audit put its lowest samples at the camera's residency edge; the retained second audit centers on the bottom row and passes every floor sample. No terrain was patched or regenerated to make that audit pass.

The deployment observer now waits for the game-ready event and non-null entity health after camera restoration; reading the persisted ready phase alone was premature. Both tanks in that diagnostic subsequently read 100 HP. The corrected floating-text size is a game-content change; the separate age/expiry defect remains in the engine handoff.

Diagnostic names now reserve room for the numeric suffix within the game's 32-character limit. A long test label initially produced duplicate truncated names, which the menu correctly rejected before deployment.

Final visual inspection found a ready tank's cannon pointing down while its HUD showed 45°/70%. Reapplying the public aim API correctly posed it, and a subsequent save preserved the aim. The content's focus routine had ignored the aim API's false return while the weapon emitter was not registered; it now waits for a successful aim request before declaring readiness. Authored tank/cannon colors also now use opaque packed RGBA. These are content corrections, not additional engine patch requests. [Aim probe](evidence/m4-rig-aim-probe.json), [correctly aimed cannon](evidence/m4-rig-aimed.jpg), [save retained aim](evidence/m4-rig-after-save.json).

## Remaining acceptance

Full three- and four-CPU mixed-terrain matches, broader high-arc/close-range tactics, natural fall and draw scenarios, and complete arbitrary-time continuation remain to be accepted after the engine blockers are fixed. The four-CPU test now reaches turn 20 and isolates the long-range aiming problem. The two-CPU match finishes naturally in three turns after a successful aiming save/reopen. No winner is manufactured and no game-side projectile restoration is added.

M4 is the last currently defined milestone. Its acceptance and the engine release are still outstanding. A later milestone can add the second weapon, biome selection/progression and further presentation work.

## Ready handoff

The app is left on a fresh seed-7 mixed-terrain match, save `81b50c65-1483-4681-ac21-5aa6dc6265e3`, with Tony and Copper both controlled by CPUs, 100 HP each, ready for **Begin match**. The cannon and HUD agree at 45°/70%. The remembered names are preserved; the menu defaults to zero humans and two computers for this testing phase. Only identified M4 diagnostic scores were removed; unrelated records were retained. Diagnostic saves and evidence remain available. See [ready state](evidence/m4-ready-final.json), [screenshot](evidence/m4-ready-final.jpg), and the [first](evidence/m4-handoff-cleanup.json) and [final cleanup audits](evidence/m4-ready-final-cleanup.json). The earlier handoff screenshot/state remain as evidence of the corrected initial weapon-readiness issue.
