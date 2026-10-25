> Released follow-up: Talus 0.0.2535 (`0a1412f03`). See [current results](m10-followup-results.md) and [bounded acceptance](evidence/m10-engine-2535/validation.json). E31–E35 contracts/integration are available with explicit ballistic and audit limits; full game M10 remains open. The 2533 reproduction below is retained unchanged.

> Accepted on 2026-10-24. The user explicitly accepts best-estimate ballistics without forecasting future air/pressure fields. `evolving-air-fields-not-predicted` is an informational limitation, not a reason to reopen this patch prompt. Preserve collision checks for known current geometry and truthful refusals for unavailable/unsupported inputs.

# M10 follow-up — gameplay acceptance on Talus 0.0.2533

Continue from the released E25–E30 contracts; do not reimplement or revert them. The engine release is installed and its app.asar hash matches the handoff. Actual Scorched Terra integration uncovered the following gaps. The author explicitly wants native fixes, not game-script substitutes for missing engine behavior.

Workspace: `/Users/tonygermaneri/gh/indigo`. Template: `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`. Engine: `/Users/tonygermaneri/gh/foxtrot`. Runtime commit `05b275f7526e33706f874481a5b6c8dca50d820e`, release 0.0.2533, app.asar SHA256 `8f67ac41e0901dd084b0d661ed1682a6ccbf1a61380b733c1e74e767971a7a01`.

## E34 — Terrain-aware ballistic planning (highest gameplay priority)

**User-observed blocker:** CPUs repeatedly shoot into a wall instead of firing a sufficiently steep arc out of a valley. A MIRV carrier was expiring against the wall without deploying its payload. The game-side MIRV policy is now repaired: an early carrier end queues its five warheads exactly once, with one ammunition debit. **That repair does not solve aiming.**

Repro: native `bunker-grid`, seed `2533410`, two CPUs, diagnostic save `M10 native maze acceptance`. Evidence: [CPU wall repro](evidence/m10-2533/cpu-wall-repro.json), [battle events](evidence/m10-2533/maze-before-fix.json), [battlefield](evidence/m10-2533/maze-battlefield.jpg). Ember is around `(5959.5,973.7)` and its target around `(6654,568.5)`. Ember's previous shot travels only 136.5 px toward a target about 694 px away. The match reached turn 10 without resolving this obstruction.

Root: `BehaviorTreeRuntime.ts::chooseBallisticAim` returns the first analytically feasible angle/power. High-arc order is `[60,70,50,75,45,80,40]`; there is no terrain sweep. `Aim_Ballistic` solves from entity position, not the actual muzzle, and does not test the flight corridor. The game's four `groundY` probes only look 220 px above the tank; they miss this valley's upper walls. Extending those probes or hard-coding 80° would still not validate the actual trajectory.

Add a reusable bounded native ballistic planner and graph/API access. Enumerate viable angle/power candidates using the actual weapon launch origin, speed range, projectile size, gravity, wind and supported drag/lifetime. Sweep the trajectory against current terrain and relevant bodies using the projectile's actual collision policy; do not interpret unknown/unloaded cells as empty. Account for the existing off-screen flight/streaming model. Return a clear solution, best obstruction/impact information, or an explicit refusal with reason and bounded work telemetry. Keep unsupported deflection/homing physics explicit. Expose enough candidates/precision/risk policy for the five game persona skill profiles without hiding damage/accuracy cheats in difficulty.

The same native result should be usable by behavior graphs and scripts; avoid five copied solvers. Store chosen plan/refusal/obstruction on the NPC blackboard, replan after movement or terrain changes, and permit game policy to change target, dig, move or use another available weapon when no clear arc exists. Give MIRV planning a clear carrier-to-apex requirement and an explicit distinction between carrier clearance and eventual child impacts.

Acceptance: reproduce this actual valley; a feasible steep trajectory clears the wall. Test an overhang with no clear ballistic path (truthful refusal), a narrow muzzle obstruction, opposite firing direction, wind/elevation, destructible cover changing between turns, a body blocking a route, unloaded portions, supported defense refusal, and finite fuel/ammo/budget rules. Compare predicted collision/clearance with actual flight, not just analytical endpoint math. Preserve camera → shout → three simulation seconds → shot and one-turn/one-ammo ownership.

## E31 — Whole-source zone surface coordinates

All ten authored recipes pass `engine_terrain_recipes` validation, but native zone hills produce empty space above the foundation. `dune-sea`, seed `2533410`, bounds `(0,0,12800,1280)`, south-facing surface baseline 640/amplitude 90 produces ground at y=1024 across the combat area. That is the separately applied stone floor, not the intended dune surface. See [initial deployment](evidence/m10-2533/zone-initial.json), [readback](evidence/m10-2533/zone-ready.json), [image](evidence/m10-2533/zone-missing-hills.jpg), and `world/Game/terrain-recipes.json`.

Root: `crates/talus-core/src/terrainassembly.rs::surface_signed_distance` computes `local_y = world_y - chunk_y * CHUNK_SIZE`, then compares this 0..63 value to baseline 640 plus noise. The runtime recipe accepts a world-scale surface but sends it through the existing chunk-local gate. A smaller baseline would create repeating terrain bands in every chunk, not continuous world-scale hills.

Provide explicit native surface coordinate space/extent for runtime source zones. Evaluate source-relative/world-relative baseline and edges consistently across all chunks while preserving existing authored tile/chunk surface semantics. Carry the extent through native tables and worker requests, save/version it, and support all documented directions. Do not paint substitute hills from the game script or manufacture hundreds of per-chunk overrides.

Acceptance: the actual 50×5 tile-equivalent source has a continuous noisy surface near y=640, varied terrain above y=1024, no 64-px terraces/repeated horizontal air bands, and an intact 256-px stone foundation. Same seed/parameters reproduce it, different seeds vary it. Test source offsets, seams, camera travel, saved empty craters, reload and world transitions. Game zone weights are zero and menu options disabled pending this fix; restore their intended weights (6 each) only after live acceptance. The native maze path already produces terrain.

## E32 — Authored menu cancellation lifecycle

Source inspection: native menu Back calls `menuBack()`/`closeMenuOverlay()` directly. Script events are emitted only by authored button clicks. Scorched Terra's armory owns `shopOpen`; its `shop-close` action releases that state. A controller B/Escape can therefore close the visible armory without releasing its game-owned state, making Begin Match/turn transitions unresponsive.

Provide a generic close/cancel/navigation lifecycle notification with menu identity, reason, and exactly-once delivery, or an authored native Back action that routes through the same event as the visible button. Handle controller B, Escape, mouse close, replacement, title history, and script-driven close without loops/reentrancy. Gameplay input ownership must be released consistently. Do not require DOM polling or synthesizing click coordinates from the game script. Live reproduction is confirmed in [menu-back-repro.json](evidence/m10-2533/menu-back-repro.json): after closing with native Back and explicitly activating Begin, the match remains `ready` with no script error. The authored close button releases the state and Begin then works.

## E33 — Pre-world Advanced recipe parameters and weights

The new catalog exposes validated per-recipe parameters and HTTP requests accept weights, but authored menus currently only collect static named fields. `generationRequestFromParams` handles recipe/parameter names, not weights. `MenuOverlay.vue` merges all prior submenu fields into `launchValues`; parameter keys from one recipe remain when switching to another, whose strict validator rejects them. Template bindings do not expose a live selected recipe/its parameter schema or input-change-driven conditional controls.

Provide a generic declarative native control/binding for recipe choice, applicable parameter fields, and random-selection weights (or equivalently general typed local form state and schema-aware scoped submission). It must work before world boot, retain roster/name/seed drafts, discard inapplicable recipe parameters, show bounds/defaults/effective configuration, support reset and controller text/numeric editing, and launch an immutable reproducible request. Preserve the selected request through between-round launch without a hidden string/object conversion or old unrelated form values. Do not inject document scripts or boot a dummy world to edit pre-world settings.

Acceptance: switch zone → maze → random after editing parameters; no stale-key rejection, no ignored knobs, correct weights, same seed/request resolves identically. Changing a parameter should change the resolved native recipe before any chunk is created. Explicit invalid values produce a themed, controller-usable error without creating a save or spending money.

## E35 — Preserve game theme/context while native Options is open

Live screen audit found that Scorched Terra title → Options exposes the default grey/system-font Talus Settings dialog over Talus Home. The installed `Menus/theme.json` matches the documented native schema and is verified by file hash; its cyan borders, pixel font, midnight surface and square controls are absent. See [settled screenshot](evidence/m10-2533/options-theme-context-loss.jpg) and [native control readback](evidence/m10-2533/options-navigation.json). This is separate from the initial transient screenshot-service failure; a second settled capture reproduces the actual unthemed dialog.

Repro through public API: open the template title, focus Options with right/down, confirm, then capture after the dialog has rendered. Back returns to the authored title. No settings were changed. Inspect the lifetime of `titleTemplateId` and theme ownership when `onOverlayClick('settings')` closes the authored overlay; that context appears to be lost while the built-in modal is active. Retain the originating game's presentation/theme and title backdrop across built-in Options/Controls, confirmations, save/load/error surfaces and nested dialogs, then restore the originating control's focus. Do not theme Talus editor/Home globally or duplicate native settings in game HTML. Acceptance needs screenshots of these actual game-reached surfaces, not merely theme variable parsing or an engine-settings preview outside the title route.

## Delivery and scope

Keep the M10 game changes, including wallet-only cash popups, native damage style, original three-second tank speech and color-only tank variants. Five native faction voice pools are installed; persona identity/shuffle/encounter integration is game-owned. Tactical persona shopping/skill/support-removal strategies and tasks 08–14 remain queued rather than being claimed complete.

Use fresh exact installed-state baselines for diagnostics. Never replay old restoration scripts over later player progress. Do not clone profiles, accumulate build artifacts, or run unrestricted matches. Supply updated public declarations, regression tests, packaged/HTTP evidence, version/hash provenance, and explicit limits. Do not declare full game-side M10 complete until actual gameplay and all menu flows pass.
