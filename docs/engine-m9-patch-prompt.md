# Indigo M9 engine request — historical

M9 is now closed at the [delivered 0.0.2530 scope](m9-closeout.md). The following is the original engine request, preserved as history; several contracts have since shipped and the posture policy was revised. Use the [current backlog](backlog.md) for unresolved work rather than treating every item below as still blocked.

Continue from Talus 0.0.2498, engine commit `8e0b0647104ca6cb797f400e2004b1c71810998a`. The installed app.asar independently matches SHA-256 `9f569ededc042f0c471eff83d5a55eac211c05a6f59ad817c24b99d0d711bb0b`. Preserve the M8 acceptance in `docs/evidence/m8-engine-2498/`; do not redo or regress those features.

Indigo template: `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`. Game workspace: `/Users/tonygermaneri/gh/indigo`; engine workspace: `/Users/tonygermaneri/gh/foxtrot`. Use public HTTP/MCP and `talus.*` contracts for game acceptance. Engine features must be generic and parameterized. The engine author explicitly prefers a proper engine fix and release over script workarounds. Do not mark this milestone fully accepted until its required contracts work in the packaged app.

Preserve names, scores, wallets, stock, dialogue bags and original saves. Original state for this work is in `docs/evidence/m9-installed-baseline.json` as exact JSON strings. Use CPU-only diagnostic saves in the existing profile. **Do not clone E2E profiles**: disk space is limited. Keep tests/evidence bounded. No purchases, external messages or publishing are required.

## E27 — priority: arbitrary world text on the native text layer

**Latest user correction supersedes the initial M9 nameplate implementation:** dialogue must NOT be part of a tank's nameplate. The engine must expose arbitrary retained world-space text instances on the native text/overlay layer, independent of names and health bars. Dialogue must be at least four times its current visible size: the present nameplate renderer uses a 9-pixel minimum at 25% zoom, so target **36 screen/CSS pixels minimum**, with correct device-pixel-ratio handling. Increasing every nameplate globally is not the requested fix.

The current API has `nameplate` with fixed text size, screen-coordinate `hudText`, and `floatText` that always rises/fades. None expresses a stationary, retained, independently sized world label. Source: `src/scripting/ScriptUi.ts` (`NameplateSpec`, `ScriptUiPlates`), `src/scripting/api/spec/presentation.ts`, and `src/app/composables/useOverlayDraws.ts:drawScriptNameplates`. Do not implement this by polling coordinates into HTML/HUD, reusing the nameplate's text, or repeatedly respawning damage text.

Add a generic script-owned create/update/remove contract for arbitrary text at a world point, with optional durable entity attachment and offset. Support explicit screen-pixel font size independent of zoom, color/contrast, alignment, multiline wrapping/max width, and deterministic cleanup. Use the engine's presented-frame camera and existing native text rendering path; update attached positions at render cadence without per-frame Vue reactivity. It must work without any entity or nameplate, and allow multiple independent texts near one entity. Define behavior for detached/dead/streamed entities, script reload and session teardown. A script can own the lifetime; do not force wall-clock expiry that runs ahead of a paused three-second presentation.

Then update Indigo: nameplates remain names/health only; create a separate large speech text above the tank after camera centering; retain it for the existing three simulation seconds; remove it before the shot/death effect. Keep the last-words anchor coherent with E21's retained death pose. Use readable wrapping (roughly 720 screen pixels maximum at the current window), with no font shrinking below the user's 4× minimum. Long phrases must stay readable without covering the full screen. The existing combined name-and-quote implementation is only a diagnostic of sequence timing, **not acceptance of this revised requirement**.

Acceptance: a non-entity world label; multiple independent labels beside an unchanged name/health plate; 36px dialogue at 25% zoom; multiple zooms/DPRs/viewports; readable longest library phrases; camera pan and tank motion without jitter; pause/resume; simultaneous/queued deaths; removal and cleanup; exact camera → speech → minimum-three-second wait → shot/effect ordering. Preserve E10's separate rising/fading damage text.

## E21 — native ground posture, righting, seating and retained death pose

Public Entity/Body APIs expose angle reads and translation/velocity/force, but no native grounded orientation, righting controller or bounded seating operation. CCT tanks currently cannot naturally rest against slope normals and then level before firing. Do not solve this by per-tick teleporting, painting rotated sprites, or hand-writing a collision solver in match.ts.

Add a generic controller capability with validated parameters: passive slope alignment using a stable support estimate; bounded angular speed and penetration tolerance; active self-righting; terrain-aware horizontal seating with bounded native excavation and exclusions; finite work/fuel when appropriate. Expose state and accepted/refused receipts. Preserve it through streaming/save/reopen. Use existing native terrain work/collision paths. The game asks for passive slope pose off-turn, upright at both turn boundaries (including the end of its own turn) and a practically flat seated firing posture.

Also investigate dead-hull physics. In diagnostic save `bc927f06-c18a-4e8c-97ea-45dfb8884722`, a Nuke killed M9 Vega at approximately (5959.5,625.5). During the three-second last-word interval its retained hull fell to (6084,1686), then below y=3300, despite the solid foundation. Evidence: `artifacts/m9-status-stall.json`, `artifacts/m9-stall-roster.json`, and `docs/evidence/m9-wfc-progress2.json`. The original game frame policy included death hazards and therefore exceeded the simulation frame; M9 now constrains the mandatory frame to living tanks and catches framing errors. That game correction does not fix the dead hull. Establish whether CCT teardown drops collision, and add a generic finite pose hold/release for authored death staging if necessary. The physical wreck, nameplate and later effect must remain coherent; no invisible substitute body.

Acceptance: uneven and single-pixel terrain, multiple slopes, inverted tanks, buried/partly supported tanks; no energy injection or teleport through foundations; release after a three-second death hold; streamed/reloaded state; simultaneous deaths; native numeric damage text still rises/fades once.

## E22 — game-time procedural brush source and shape operations

2498 `terrainWork` accepts one world-plane recipe and rect/circle shapes. The editor exposes richer semantic/neural/growth tooling, polygon selections, guided strokes and multi-plane effects. Extend a shared native contract rather than reproducing these evaluators in game scripts.

Required: deterministic seed, global coordinate/ribbon origin, 64–128-pixel brush sizes, polyline/polygon masks and connected ridge/site guides; explicit semantic mixtures, neural model references and bounded growth jobs; living Bramble plus comparable living vegetation; valid foundation/exclusion masks; progress/cancel receipts and bounded streaming/backpressure. Consider a generic chunk-generation source next to WFC so revisiting and new-game seeds reproduce missing chunks lazily without editor-mode calls. Regeneration must distinguish authored source from saved destruction. Native commits must preserve color/material, collision and live-body exclusions.

Indigo's current optional Brush Reach uses the real recipe evaluator in an empty 50×5-tile-equivalent area, with a complete STONE bottom row and 64–128-pixel semantic detail stamps. It does not pretend to have neural or living brushes. Its configuration and content are in `Game/generation.json`, `Game/arena.json` and `assets/m9-{brush,neural}-library.json`.

The same generic shape operations unlock Riot Charge, Riot Blast and Dirt Charge wedges. Earth Disrupter needs a bounded native structural-collapse operation; a scripted rectangular erase or a bigger explosion is not equivalent.

Acceptance: same/different seeds, joined peaks across commit/chunk boundaries, no WFC tiles in brush mode, full foundation before powders, visits in varied orders, camera away/back, remote commit, save/reopen during and after generation, all 50 columns, no profile copies, bounded memory and generation progress. Verify neural and living output physically, not just nonzero receipts.

## E23 — native penetrators and beams

Complete Baby Digger/Digger/Heavy Digger and Baby Sandhog/Sandhog/Heavy Sandhog using generic subterranean projectile behavior: collision policy, native bounded excavation, material hardness/work budget, charge travel/expiry, branching, source attribution and posthumous ownership. Tank contact, terrain contact and fizzle rules must be independently authorable. Do not teleport shells through terrain while erasing circles in JavaScript.

The catalogue's Laser is disabled: the current material registry has no `LASER`, despite a ProjectileEmitter source comment suggesting one. Add a real straight cutting/damaging beam or an appropriate first-class material projectile, with finite energy, ray/shape collision, material removal, shield interactions and source credit. Plasma Blast already composes the native self-centered blast and a finite battery debit; do not replace the beam with a radial explosion.

## E24 — finite per-shot accessories and field variants

Expose generic, consumable next-cast modifiers through the existing cast pipeline rather than multiplying every gun template for every accessory combination. Required original accessories: Heat Guidance, Ballistic Guidance, Horz Guidance, Vert Guidance and Contact Trigger. Native homing already exists on a dedicated Homing Rocket; it does not provide an inventory-backed attach-to-next-shot modifier. Define usage/debit and refunds for refused/misfired/cancelled casts and serialize unapplied modifiers.

Smoke Tracer is now implemented with native SMOKE trail particles. Per-tank colored/retained trajectories are optional further fidelity, not a blocker to this existing weapon. Preserve material identity if adding a separate trail-color parameter. Force/Heavy Shield and Super Mag currently use real native reserve charge packs; exact reflection/deflection variants need parameters rather than special-case Indigo code. Auto Defense is already implemented as game policy over native defense activation and a once-per-round, successful-activation-only debit. Lazy Boy is also implemented using the existing native aim graph, with one charge debited on an applied solution and no debit on refusal. Preserve it; no dedicated engine class is required.

Acceptance: combine with bursts, MIRVs, beams and indirect/dead-owner payloads; one accessory debit per cast, never per child; correct target/guidance control; field depletion and honest aim-solver refusals; no stale buffs after reload/death.

## E25 — fall and ground propulsion utilities

A generic native parachute/fall-brake controller with finite inventory activation, terminal-speed/drag and collision-safe fall-damage protection. Ground fuel should be debited from actual accepted native movement/work, not a guessed input duration. Reuse 2498's finite controller resource model. Jetpack and burrowing are already native and enabled; retain all M8 regression cases.

## E26 — confirmed horizontal parallax tiles vertically

**Visible renderer defect.** The generated layers all declare `tiling:'horizontal'`, but the live game displays repeated horizontal mountain bands up the entire screen. See `docs/evidence/m9-wfc-progress.jpg` and `artifacts/m9-setup.jpg`; asset configuration in `assets/m9-environment-records.json`. The generation request/result are in `assets/m9-background-{request,result}.json`.

`src/renderer/ParallaxRenderer.ts` around lines 263–269 uses `layer.tiling === 'none' ? 1 : screenHeight/(imgHeight*pxScale)` for Y, treating horizontal like both. The shader/sampler repeats V too. Correct the renderer's distinct horizontal/both/none semantics, vertical placement/edge clamping and transparent padding; retain native pixel scale and per-axis parallax. Do not enlarge/rewrite the generated art or change it to a different tiling mode to hide the bug. Check both editor and game, worker and loopback, 25% and other zooms, varying viewport/aspect ratio and camera Y. The expected result is one horizon with three depth layers, horizontally seamless.

## Carried blockers and additional investigation

E14: actual color-preserving wreck transmutation to DYNAMITE/acid, central 2×2 ignition, and the ten-shot last-laugh finale remain absent. Keep disabled until native body-to-material conversion and ignition work.

E15's runtime large FIRE brush is now physically verified at radii 96 and 240 and integrated as a fifth random death effect. The maximum isolated probe placed 176,921 FIRE cells at approximately 900 K. A native in-match radius-240 death job placed 157,372 cells. See `docs/evidence/m9-material-probe.json`, `m9-large-fire-240.json` and `m9-nuke-after-bridge-timeout.json`. A 256-cell WOOD fixture fell to 24 WOOD cells with embers, fire, smoke and soot after 180 ticks. LAVA initialized at 1400 K and nitrogen at 70 K. E16 remains open for complete corrosion/cooling/material-emitter acceptance: the acid probe did not dissolve its 512-cell STONE target in the tested interval. Test furnace, thermite, oil, lava, nitrogen and acid interactions, ownership where damage applies, remote limitations and their ten-second lifetimes. A positive spawn count alone is insufficient. Retain the successful FIRE cases and verify the remaining interactions. Sustained wreck-attached emitters also need the E21 death-pose contract. Preserve the engine limitation that remote world-plane simulation does not imply remote air/heat/EM fields.

E9: transient projectile/cast persistence remains unresolved. M9 must not silently resume an empty attack or duplicate paid ammo after saving mid-volley. Either persist native flights/casts and ancestry or expose an explicit supported save barrier; test MIRV/burst/material job/death queue phases.

Rain/contact investigation: the first M9 MIRV carrier ended near (6126.5,431.5), well above the ground, while rain was visible. Its authored lifetime is 20 seconds and native onTerrain is true. Investigate whether loose rain particles trigger terrain detonation and expose generic material/state collision filters if needed. This is initially an observation, not yet a proven defect. Do not remove weather or suppress all terrain collision as a workaround.

## Current game acceptance and observability

The Brush Reach two-CPU match completed on turn 2, with a real MIRV split, Nuke direct hit and delayed death effect. All 166 captured frames retained every survivor at 25% zoom. All 50 columns had surface and both foundation-edge samples; the post-combat profile and installed bank survived save/reopen exactly.

The eight-CPU arsenal diagnostic used explicitly granted ammunition and 10,000 HP to cover weapon families. It exercised real bursts, flames, clusters, deposits, plasma and spread guns, then finished on turn 78. Native last-word intervals were at least three seconds. The first retained 1,340 frame samples had no survivor residency failures. The bounded observer ring later rolled over during an extended tool/bridge interruption, so do not claim uninterrupted frame-level evidence for all 78 turns.

A bridge request timed out during the integrated death-nuke test; the subsequent native UI inspection itself returned after an unusually long delay. When the bridge returned, the game was finished, error-free, with a successful native FIRE receipt. **This is an observability interruption, not a confirmed nuclear-brush engine hang.** Preserve that distinction and reproduce before assigning a new engine defect. Current concrete visual blockers remain E21 and E26.

## Deliverable

Implement generic engine contracts with docs, generated scripting types, focused native/unit tests and worker/loopback coverage. Update Indigo only through public authoring APIs. Run CPU matches proving the actual requested behavior. Record exact build/commit/package hash and install the new local release. Preserve independent raw evidence and original accounts. Record accepted/blocked outcomes explicitly; do not equate an enabled shop card with acceptance. The game source already has 31 enabled weapons and 10 utilities; preserve the completed native Lazy Boy and Auto Defense policies. Final M9 account restoration is verified in `docs/evidence/m9-restoration.json`; capture a fresh baseline before further diagnostics rather than overwriting newer user progress with this historical snapshot.
