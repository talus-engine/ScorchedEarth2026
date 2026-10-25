# Indigo M1 verification on 0.0.2495

**M1 accepted on 2026-10-22. All 33 acceptance checks pass in the installed app against the actual Indigo project.** The remaining terrain-loss blocker is resolved in this replay. No new engine blocker was found.

Seven audits each checked every ground cell across runtime chunk columns 0–95 and rows 10–11: **192 chunks, 786,432 cells per audit**. The audits ran before firing, after each of four shots, after three camera round trips, and after save/reopen. They found zero missing STONE cells outside the actual explosion discs. The formerly missing chunk `(50,10)` retained all 4,096 cells at every stage. All 192 chunk hashes, including intentional craters, match exactly across the camera trips and save/reopen.

| Check | Result |
| --- | --- |
| WFC area present and normal x=400 start | Passed |
| Calibration flight over 4,000 pixels with shooter unloading | Passed |
| Target restoration, two damaging hits, death, one survivor | Passed |
| Durable projectile owner, damage source and killer | Passed while shooter was stored |
| Hit callbacks after damage and before projectile end | Passed |
| High arc and four impact settle watches | Passed |
| Complete corridor before and after each shot | Passed, no unexplained terrain loss |
| Complete terrain and crater hashes after three camera trips | Exact match |
| Survivor identity, name, 100 HP, cannon and blackboard after reopen | Preserved |
| Target death and blackboard after reopen | Preserved |
| Complete terrain and crater hashes after save/reopen | Exact match |

The calibration impact was `(4686.265625,639.75)`, matching the earlier failing run. The two direct hits dealt approximately 60.14 and 58.15 damage. The shooter retained its durable identity while its live body changed; the target remained dead after reopening. No script faults were recorded.

The replay uses fresh save `2c5632cb-1eea-47d4-aed1-b38c0ffa7331`, Indigo template `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`, seed 1729, and camera zoom 1. The original failed combat save and no-shot control remain preserved. The app is left at the surviving shooter in the new accepted save.

## Engine fix and evidence

The engine agent reproduced the prior loss and traced it to a rejected departure snapshot. A deferred explosion rejected a chunk save after its GPU terrain rows had been extracted but before the restore/release scope began. The retry then saved zeros. Snapshot ownership now starts at method entry, so rejection restores the terrain before retrying.

Installed Talus **0.0.2495** matches the tested packaged artifact byte-for-byte. The tested patch is now committed on clean local `main` as `aef4c32cf`. Its committed diff matches the saved validation diff; [build provenance](evidence/engine-2495-provenance.json) and [the source diff](evidence/engine-2495-source.patch) preserve the exact candidate.

The [engine agent's validation](evidence/engine-2495-validation.md) separately covers complete particle-record fingerprints, both original combat timing and per-flight audits, 13,682 passing unit tests, zero TypeScript errors, browser regressions, production build, and desktop smoke checks. This independent installed-app replay uses the public HTTP and scripting APIs to compare material cells. No game-side terrain repair or whole-arena residency was added.

- [33-check summary](evidence/m1-2495-summary.json) and [complete replay](evidence/m1-2495-replay.json).
- [Intact former hole](evidence/m1-2495-intact.png), [preserved craters](evidence/m1-2495-craters.png), and [survivor](evidence/m1-2495-survivor.png).
- [Previous 0.0.2494 failure](m1-2494-results.md), [original pre-patch results](m1-prepatch-results.md), and [engine work log](engine-work.md).

One of the 33 checks compares the recorded full-corridor hashes after the three camera trips; it was evaluated after the replay and is now included directly in the runner. The runner accepts a build label and output path, refuses to overwrite an existing report on a new run, and supports the expanded corridor audit.

M1 closes the two-tank flight, streaming, impact and persistence proof. The 50×5 WFC arena, seeded/random menu, timed turns, movement and aiming UI, AI behavior graphs, Ink flow, out-of-bounds elimination, and remembered names/scores remain game work.
