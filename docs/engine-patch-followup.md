# Engine follow-up: an untouched chunk disappears on 0.0.2494

**Historical patch prompt. Implemented in the 0.0.2495 terrain handoff patch.** See the [diagnosis and engine validation](evidence/engine-2495-validation.md) and [current M1 results](m1-results.md). The reproduction below remains preserved as evidence.

Continue from `adf204861` in `/Users/tonygermaneri/gh/foxtrot`. Read AGENTS.md. **This is the remaining P0 terrain-integrity blocker for Indigo M1.** The original ownership and hit-completion fixes pass in the actual project. Preserve them; do not start that work again.

## Build and result

Installed app: `/Applications/Talus.app`, version 0.0.2494. Its `app.asar` SHA-256 is `0401374675477b33c77ea4c1392d98c9c38d7731181aa5bb2af64dd43b3dcdbd`, identical to the current packaged artifact. Your committed report covers package 2493 in an isolated profile; this replay uses actual Indigo on installed 2494.

22 of 23 distinct checks pass: corrected import, normal start, long flight, target restoration, two damaging hits and death, owner/source/killer identity while stored, hit-before-end, high arc, settling, home-ground round trips, and entity/crater persistence after save/reopen.

One entire untouched chunk is missing after combat:

- Chunk `(50,10)`; pixels x=3200–3263, y=640–703.
- **All 4,096 STONE cells are absent**, with resident neighbors full.
- Four impacts: `(4686.265625,639.75)`, `(4595.25,627.9621)`, `(4595.25,627.9621)`, `(4593.875,675.75)`. Carve radius 48. None is within 1,300 pixels of the hole.
- The square hole persists exactly after save/reopen. Screenshot: `docs/evidence/m1-2494-missing-chunk.png` in Indigo.
- The corridor was first audited after all four shots. The precise loss frame and a pre-shot baseline in this same save have not been captured.

## Preserved state and control

Game repo: `/Users/tonygermaneri/gh/indigo`.

- Template: `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`.
- Failing combat save: `5c0bd082-1ae1-4301-b719-fadeb0d7715a`, seed 1729.
- No-shot control: `9b903c72-7b0b-4407-ba1f-1dfbe2314662`, same template and seed.
- Current app: failing combat save, camera `(3200,640)`.

The fresh control has every expected stone cell across chunk columns 49–51, rows 10–11. Three camera-only trips between x=400 and x=3200 retain them all. Reopening the combat save still shows exactly 4,096 missing cells at `(50,10)`. This rules out a permanently empty source tile as the explanation.

SQL shows normal unbaked WFC anchors at `(40,8), (44,8), (48,8), (52,8), (56,8), (60,8)`, scoped to `indigo-m1`, with no explicit child override. The tile has 32,768 particles; import creates the live catalog. No game script deletes terrain outside explosions, repairs chunks, or pins the arena resident.

Preserve these saves. Use a separate test save/profile for destructive diagnostics. Do not delete the saved hole, regenerate it, and call the engine fixed.

## Reproduce and isolate

Use Indigo's `tools/bridge.py` on port 3702; it reads the pairing token without exposing it.

1. Continue the failing save and center `(3200,640)`. `engine_sample_points` at `(3232,672)` reports resident but empty. `(3168,672)`, `(3296,672)` and `(3232,736)` report STONE. Full cell counts are preserved, not just representative samples.
2. Compare the no-shot control at the same location; it is solid. Keep template and seed identical.
3. For a fresh replay, open Indigo in the editor; the fixture has already been imported through the corrected interface. `python3 -u tools/replay_m1.py` starts at x=400, fires calibration, spawns the target, checks home/crater return, fires two shots at 99% power and 30 degrees, and then one 60-degree arc. It audits terrain and saves/reopens. Preserve the existing report before rerunning, since the runner overwrites its report.
4. `python3 -u tools/probe_m1_terrain.py` makes the no-shot control, compares every material cell in the affected region during camera trips, and returns to the combat save. Preserve its report too.
5. Add full-corridor audits before the first shot and after each flight/return to locate the first lost chunk. Compare particle records, capture ownership, allocator reuse and world-row persistence at that transition. Include original-project context and real combat timing: ordinary camera-only tests and isolated-profile tests passed.

Evidence in Indigo's `docs/evidence/`: `m1-2494-summary.json`, `m1-2494-replay.json`, `m1-2494-fresh-terrain-control.json`, `m1-2494-corridor-samples.json`, and `m1-2494-missing-chunk.png`. Your previous validation is copied as `engine-adf204861-validation.md` and `engine-adf204861-acceptance.json`.

## Acceptance

Find and fix the remaining general engine cause. Preserve the previous capture/dead-row/body-retirement fixes and mutation-lease safety. No game-side terrain repair, whole-arena residency, or regeneration of legitimate craters.

Require zero unexpected material/particle loss across the visited corridor through repeated shots, camera trips, save and reopen, while retaining exact intentional craters. Rerun actual-project M1 alongside the existing regressions, zero-error type-check and desktop checks. Report the app hash and each acceptance result. Keep failing evidence intact and coordinate the updated release with Tony.
