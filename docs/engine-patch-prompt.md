# Talus patch: finish Indigo M1 reliably

**Historical prompt: implemented in `adf204861`.** Verification on 0.0.2494 exposed an additional terrain-loss case, addressed by the [follow-up patch in 0.0.2495](engine-patch-followup.md). See [current results](m1-results.md); the old experimental diff is retained only as evidence.

You are working on Talus, authored by Tony, to unblock the Indigo artillery game. Fix these as general engine behavior. Do not hide defects with game scripts, keep the whole battlefield resident, or delete terrain until a test happens to pass. Read the engine's AGENTS.md and follow its no-migrations and zero-type-errors rules.

## Context and handoff

- Engine source: `/Users/tonygermaneri/gh/foxtrot`, inspected at `e369493bd`. Check the current branch and working tree before editing; the running application's precise source commit was not independently verified.
- Game repository: `/Users/tonygermaneri/gh/indigo`.
- Full investigation: `docs/engine-work.md`; raw live evidence: `docs/evidence/`.
- Experimental E1/E2 fixes: `/private/tmp/indigo-engine-support`, branch `indigo-engine-support`. They are uncommitted, unshipped, and have not changed the running app. A portable diff including new files is saved at `docs/evidence/experimental-engine.patch`. Review it; do not blindly apply it over newer work.
- Template: Indigo, `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`.
- Diagnostic save: `13af8ed1-c493-4ff9-9253-5db2dd8b1b2d`, seed 1729.
- Local bridge: `http://127.0.0.1:3702`; use the repository's `tools/bridge.py`. It reads the local pairing token without printing or committing it.
- Assets/fixture: `assets/m1-ground.svg`, `tools/install_m1.py`, `world/Scripts/m1.ts`. The tank is a simple single-body test fixture; generated multipart art has a separate defect below.

The final game is a 50×5-WFC-tile artillery arena with a seeded/random menu, human/AI tanks, timed turns, persistent names and scores, scripts, behavior graphs and Ink. This patch is the engine prerequisite for completing that game. M1 is the smaller two-tank long-range proof: fire, follow the shell, park the shooter, restore the target, damage/kill it, settle the impact, identify the survivor, and restore the shooter.

## 1. P0: terrain disappears during GAME-MODE streaming

**This is the principal release blocker. Treat growing chunk-shaped holes as one terrain-integrity bug. Fix the game-mode path, not just editor refresh.**

The fixture contains one 4×4-chunk tile with STONE in its lower half, repeated across 50 anchors at `(0,8), (4,8), …, (196,8)`. Stone should occupy chunk rows 10–11 across the strip. The import reports success, zero issues, 50 anchors and a 32,768-particle tile. Those anchors really exist on the template cells plane.

Observed failures:

1. After import, the live editor layout was stale until reopening. The area catalog remained empty. Resident starting ground was blank in both the editor and a fresh seeded game. Boundary samples showed columns 28–32 empty and 33–40 containing STONE in rows 10–11. Scrolling back did not repair the blanks.
2. Continuing the diagnostic from generated ground at x=3200 allowed actual shots. The shooter stood at `(3199.5,≈626)` through several visits. All impacts were over 4,000 pixels away, near x=7390–7524.
3. On return after the high-arc shot, previously solid shooter ground had square missing chunks. The restored tank fell to y≈690. Tony explicitly confirmed no manual terrain edit. Screenshot: `docs/evidence/m1-shooter-pit.png`; before/after entity states and ground samples are saved alongside it.
4. A subsequent camera-only round trip retained the holes; Tony observed additional missing terrain. No shell was fired during that round trip. Do not infer integrity from the tank staying at the same y: inspect the surrounding chunks too.

Source leads, not a substitute for reproducing the failure:

- `ChunkManager.templateSnapshotEligibleAt` uses `getTemplateCellAt` / `templateCellLookup`, an exact-cell lookup. WFC child chunks have no direct cell, although `generateFromTemplate` discovers their owning anchor. A stale blank child snapshot can therefore be eligible where the WFC recipe should own the full footprint. Review both editor and game read-through, queued and direct load paths, wrapping, and explicit baking.
- `importWfcTilesTool` in `src/ai/orchestrator/tools.ts` writes tile/cell data without updating the active layout session or publishing live assignments. Route import through the shared authoring operation instead of duplicating UI behavior.
- Trace capture/readback/eviction as well as load eligibility: the game loses terrain that was visible earlier. Establish whether an incomplete or stale chunk is being persisted as an intentional empty edit. Preserve valid game modifications.
- Do not mistake raw `tile_placements: []` for missing placements: `getWorldTemplateById` synthesizes them from canonical `cells`. Do not claim all palette generation fails: the farther stone proves it works in some chunks.

Required regressions: preload blank chunks, import through the actual HTTP/MCP tool, sample every subchunk of multiple WFC footprints, save/reopen, and launch a fresh seeded game. Repeatedly move the camera more than one residency ring away and return, with and without firing. Compare full matter state for untouched chunks. At the impact site, verify that legitimate craters persist rather than regenerate. Include nonzero origins, footprint boundaries, supported wrapped copies, baked content, and ordinary modified world chunks. The existing WFC E2E helper duplicates import logic; exercise the real production entry point too.

## 2. E4: preserve durable projectile ownership through streaming

Launch-time owner handles resolve, but become null once the shooter parks. Shots retain only decimal live body IDs, which change on restoration.

Live evidence: shooter durable ID `instance@spawn-c0e04cfe-fdea-4ec9-ad7e-a70a6ab1f642`; launch IDs 0, 3, 6, 9, 14 across visits. Shot 3 hit the target for 60.6066 damage with source `"6"` and no resolved source handle. Shot 4 killed it with `killerEntityId: "9"` and no resolved killer. The shooter was still alive and stored. This blocks reliable kill credit.

Carry durable owner identity from launch through particle, rigid-body and entity projectiles, payloads, deferred explosions, damage/death events, behavior hooks and scripting handles. Keep transient body/group IDs separately for collision exclusion. Owner-filtered projectile queries must work after unloading/restoration. Review `ProjectileManager`, `RigidBodyProjectiles`, `EntityProjectiles`, `ProjectileLifecycle`, `ProjectileEventDispatch`, and `src/scripting/api/runtime/{projectiles,entity,index}.ts`.

Tests must cover an owner that parks, restores with a different body ID, and dies or is removed; guard against a reused live ID crediting the wrong entity. Preserve nonentity source IDs. Do not add an Indigo-specific old-body-ID mapping.

## 3. E5: deferred explosions must retain projectile hit completion

Both damaging shots emitted body detonation and `projectile.end`, then damage/death and a nonempty `explosion.hits` on the next tick. Neither delivered `projectile.hit`, despite a registered listener.

`ParticleSimulationWASMHost.explode` returns null when a persistence capture holds the mutation lease. The rigid projectile adapter converts that to `[]`; `RigidBodyProjectiles.detonate` ends the projectile immediately. The later deferred explosion loses its projectile callback context.

Preserve projectile ID, direct target, behavior hooks and durable owner until blast completion. Emit one `projectile.hit` per actually damaged target after damage, with amount, killed and direct/splash data. Define and document end/resolution ordering so a turn/settle consumer can wait for completed effects. Do not bypass the mutation lease or reconstruct hits in the game by matching coordinates.

Regress immediate and deferred direct/splash damage, lethal and nonlethal hits, and an unloaded owner. Check hook delivery, exactly-once behavior, teardown/cancellation, and the ordering used by settle watches.

## 4. E1/E2: existing menu and asset-generation defects

These do not explain the terrain failure, but are required for the planned game:

- **E1 menu seed:** `newGameFromMenu` ignores a submitted `seed` field when choosing the actual world seed. Missing field should preserve engine settings; blank requests randomness; an explicit valid integer, including zero, sets the actual seed before generation. Invalid values must fail before save creation. Preserve launch params. The isolated helper/menu patch has 13 passing unit tests across MenuLaunchSeed and MenuGameFlow; its title-screen E2E edit has not run.
- **E2 generated parts:** the HTTP generation agent created `indigo/tank-art` with two bodies both indexed 0 and a joint connecting 0 to 1. `renderPart` ignores its part index. Fix shared generation and redraw, review editor index remapping, and test real HTTP save/readback. The isolated fix has two passing regression tests. Preserve or explicitly replace the broken generated asset; do not introduce a migration system.

## Live M1 replay after the fix

Preserve the existing diagnostic save and evidence. Use a fresh test save for acceptance. Install the fixture while Indigo is open in the editor with `python3 tools/install_m1.py`; check script compilation, the live layout and materialized ground. Start a new game with seed 1729, then emit the following custom events through `engine_run_script` (argument key `source`):

1. `talus.emit('indigo:m1-start', {})`. The normal x=400 start must work after the terrain fix. For exact comparison with captured flights, use `{x:3200}` in a separate test.
2. Wait for `m1.status` to report readiness. Emit `indigo:m1-fire` with `{}` (30-degree elevation, power 1). The script follows the shell every simulation tick and holds the camera at impact until settling.
3. After impact, emit `indigo:m1-target` with `{}`. It places a target 70 pixels left of the measured first impact; terrain changes can affect later trajectories.
4. Emit `indigo:m1-return`; verify stored/live identity, health, inventory and blackboard. The target should park while the camera leaves.
5. Fire toward the target. In the captured run, power 1 missed beyond the first crater; `{power:0.99}` hit and a repeat killed the target. Use actual settled positions when terrain differs.
6. Fire `{angle:-Math.PI/3,power:1}` for a high arc. The captured shot reached at least y=-1219 and completed, so high arcs do not currently require a new whole-arena simulation feature.
7. Return to the shooter and inspect all visited ground, target health/death, stable event ownership, hit callbacks, and blackboard/inventory. Repeat camera-only trips and save/reopen.

Read `m1.events`, `m1.before`, `m1.impact`, `m1.restoration`, `m1.shooter`, and `m1.target` from global state. The observer source now preserves an explicit `event` field; early evidence predates that small logging improvement, so raw projectile `kind` overwrote the log label on some rows. Cause/reason fields distinguish detonation/end rows. No hit row was recorded on the damaging shots.

M1 is accepted only when the normal terrain start works, unchanged terrain and craters survive streaming, the shot reaches a restored target, damage/death have the original durable owner, hit callbacks complete correctly, exactly one roster member remains alive, and the surviving tank restores its state without unexplained ground loss. Menus, AI graphs, full 50×5 map art and production score UI remain later game work.

## Validation and release

Run focused regression tests and real bridge E2E first, then the required zero-error type-check. Run the desktop build and packaged smoke checks specified in `tools/desktop/README.md`, and repeat the M1 sequence in the candidate desktop build. Report each acceptance result and remaining limitation with evidence. Coordinate the new release with Tony; do not declare the tank game complete or ship experimental changes merely because the narrow unit tests pass.
