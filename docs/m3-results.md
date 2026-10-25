# M3: timed artillery combat

**M3 combat acceptance passes on installed Talus 0.0.2496, 2026-10-22.** Twenty-nine checks pass across a full computer match, human controls and timer, completed-match save/reopen, and controlled out-of-bounds elimination. The installed build and independent M2 engine-fix acceptance are recorded in [the engine work log](engine-work.md).

## Implemented

The global `indigo.match` state owns deployment, tank selection, the countdown, firing, flight, settling, elimination and the result. NPC blackboards retain each tank's angle, power, role and computer ranging history. Stable entity identities remain usable while the camera follows the projectile and the shooter parks.

Human players share one keyboard: A/D moves, left/right adjusts elevation, up/down adjusts power, Space fires, and Enter passes. HUD buttons also adjust aim/power, pass and fire. Input closes immediately when a shot is requested. The game waits for projectile resolution and terrain settling before advancing. A turn timeout advances without a shot. Bounds are the configured 12,800×1,280 pixels; an out-of-bounds or destroyed tank is eliminated. One survivor wins, with a draw if none remain.

The command behavior graph plans, waits, and fires each computer turn. Its script nodes emit requests into the same match state machine as human input. The first shot uses a simple 45°/135° arc at 70% power; subsequent shots adjust speed from observed impact distance. This is basic ranging AI, not an optimized ballistic solver. Ink announcer stories introduce turns and the winner without blocking combat input.

Installation-level preferences remember names and setup choices. Scores track games, wins and kills by case-insensitive player name. The setup menu rejects duplicate names within a match. A completed-world ledger prevents counting the same result twice. The prototype has one cannon/shell; additional weapons, tank art, CPU tactics and biomes remain content expansion work.

## Evidence

| Scenario | Result | Retained save / report |
| --- | --- | --- |
| Two computers, seed 0, 10-second turns | 10/10; Amber wins on turn 5 | `1bfd91b9-8e77-48fd-8172-c6a801776840`; [full match](evidence/m3-cpu-match.json) |
| Human/CPU, seed 0, 15-second turns | 10/10; move, power, one-shot input lock, graph response, camera return, Enter pass, timeout, healthy script | `84d937d4-f1dc-4c25-a86d-195aaa0b85bd`; [human controls](evidence/m3-human-controls.json) |
| Save and reopen finished computer match | 4/4; winner, roster, scoreboard, preferences and unchanged score ledger | [reopen](evidence/m3-score-reopen.json) |
| Place diagnostic human below arena floor | 5/5; actual NPC death, immediate last-survivor win, no environmental kill credit, stored result | Same human diagnostic save; [bounds](evidence/m3-bounds.json) |

The computer match used normal graph-controlled shots throughout. It produced five launches, five completed settle watches, damaging hits and one credited kill. All projectile ends retained the durable owner while the shooter was stored. The killing direct hit dealt 62.827 damage to Cobalt; Amber finished with approximately 84 HP. The [finished HUD](evidence/m3-finished.jpg) was visually checked.

The bounds test deliberately teleported the active test NPC below y=1,280. It verifies the normal tick/event elimination path and score behavior; it does not claim a separately observed natural fall from the arena edge. Terrain generation, deterministic/random seeds, four-player deployment and remembered setup were already covered by M2. Combat acceptance here uses two players; a complete 16-player match was not run.

TypeScript checking against the Talus declaration file passed with zero errors. The authoring and verification Python tools compile. No engine source changes were made. Diagnostic score entries are removed after preserving the reports so the playable game's scoreboard begins clean; this does not change the earlier save/reopen proof.

The game is left in saved match `763aeab1-5c63-4a1a-b22d-479b9e3e4af7`: Tony (human) versus Copper (computer), seed 0, 30-second turns, both at 100 HP, waiting for **Begin match**. See [ready state](evidence/m3-ready-to-play.json) and [ready HUD](evidence/m3-ready.jpg). Diagnostic score cleanup is recorded [separately](evidence/m3-test-score-cleanup.json).

## Corrections and limits

The initial [human trace](evidence/m3-first-turns.json) passed movement, power, launch/input lock and settling, then stopped waiting for the computer. The authored graph had treated `bb.__hookData` as an object; it is JSON text. Parsing it fixed the command payload. The graph's sequence reevaluates earlier children while its Wait node runs, so planning is idempotent per turn. P was also already the engine pause key; Pass Turn now uses Enter. These were game-content errors, not new engine defects. The final complete replays above use the corrected content.

The first attempt to start the final human observer read a not-yet-spawned entity ID during deployment. The observer now waits for deployment before evaluating gameplay assertions. This did not require a game or engine change.

Completed-match save/reopen and between-game names/scores are verified. Suspend/resume during a projectile or a firing/focusing transition is not accepted in this milestone. The script reports an explicit fault if it cannot recover the saved shot or transition; it does not manufacture a replacement shell or silently skip resolution. Any required engine persistence extension should be investigated and patched in Talus before claiming arbitrary-time continuation.

No new engine blocker was found in the tested combat loop. Earlier M1/M2 evidence and saves remain preserved; the historical engine patch prompts are marked accepted on their verified builds.
