# Indigo M5: character movement and constrained game cameras

Started from `ebfcba48d7884fdbb0f00b18cec6f2e209fdc9c4` on 2026-10-22.
The earlier terrain, projectile identity/completion, editor authority and
world-scoped reload fixes remain in place.

## Engine changes

The native character controller receives a complete effective configuration
for each actor's solve. Updating slope, step or snap settings no longer
resets skin to 0.01, and registration order no longer selects everybody's
controller profile. The configuration object is reused.

The actual Rapier 0.35.2 step solver had two additional problems at this
game's pixel scale. Signed 2D slope angles misclassified right-facing walls;
large-coordinate floating-point error could also reject a parallel stair
clearance cast at zero time of impact. A locally maintained, attributed
copy of the upstream controller uses unsigned slope comparisons and a
coordinate-scaled clearance tolerance. Movement keeps the authored skin.
Its source header records the upstream version and removal criterion.

Powder support uses authored climb/step/snap distances and skin instead of
body-size constants. Its correction checks solid headroom. Solid support
stays with the native shape-cast controller: applying a second downward
raster snap had lowered trailing hulls into solid steps during development.

`talus.camera.setZoom`, `talus.camera.view`, `talus.camera.frame` and the
HTTP/MCP `engine_camera` tool use the real renderer and ChunkManager bounds.
Zoom and frame are saved per game and restored before initial streaming and
script boot. New games default to zoom 1; scripts can select 0.25 at boot.
Editor preferences are separate. The old game boot path reset zoom after
scripts started. Anchored zoom now applies position and viewport atomically.

A camera frame constrains follow, centering, panning and resize without
changing residency capacity. It reports visibility and simulation fit
separately, and refuses an impossible simulation span without replacing the
accepted constraint. Indigo's M5 script updates its surviving-roster bounds
each simulation tick and uses the shell or impact only as a desired focus.

Opt-in `independent` rigid projectiles claim a bounded moving flight/blast
region from the existing simulation-anchor reserve. They wait for actual
terrain readiness, retain the region through deferred damage/hits/end, and
release it on termination. The camera continues to retain the tanks. This
does not simulate the whole arena. Loose GPU matter outside the camera grid
remains held; rigid physics, terrain collision, carving and damage work
there. This patch does not add persistence for an in-flight transient shell.

## Verification

Tests use an APFS clone of the actual Indigo profile and separate diagnostic
saves. Original failing saves, M4 fixtures and retained evidence are preserved.
No paid activity-agent requests are used.

| Check | Result |
| --- | --- |
| Full unit suite | 1,119 files / 13,727 tests passed; one expected failure and 17 skipped |
| Native physics tests | 46 passed, including the real ABI step course in both directions |
| Real WASM movement integration | Seven tests passed: complete skin/config, different profiles in reversed order, solid and raster powder support, forward and return travel |
| Prior contract regressions | 327 targeted tests passed for terrain capture/reclaim, ownership, completion, authority and script reload |
| Plain terrain browser lane | Four camera trips and save during departure/reopen; exact material and particle fingerprints unchanged |
| Packaged movement | Lone pixel, four- and ten-pixel steps crossed both ways; forty-pixel wall stops the tank; fresh and restored actors retain identity/health |
| Packaged profile isolation | Step 16 / skin 0.5 and step 2 / skin 1.5 in one scene, both registration orders; high profile crosses, low profile stops at four pixels and can retreat |
| Mixed terrain | Actual tank crosses a stone ramp capped with sand in both directions, descends, and stops at the forty-pixel wall |
| Game framing | Real 0.25 zoom and 1600×968 world viewport; two-, four- and sixteen-CPU rosters tested |
| Small window | 800×600 reports `fitsViewport: false`, retains `fitsSimulation: true`, and keeps every surviving tank live; restoring the window restores full visibility |
| Independent flight | High shot reaches about y=-2458 and returns for one credited hit; long shot impacts around x=10831 outside the camera ring; one detonation/end per shot |
| Remote crater persistence | All material cells in the 192×192 impact region match after save/reopen; carved interior stays empty; all sixteen identities/health restore |
| Installed final combat | Fresh two-CPU match, three real shots, one survivor, zero parking; identical durable IDs/health and 0.25 zoom after save/reopen |
| User state | Original preferences and scores restored exactly; Tony and Copper left ready in a fresh two-CPU game |
| Untouched combat terrain | All 124 audited bottom chunks remain full after four-CPU combat and save/reopen |
| Desktop smoke | Packaged Apple Metal/WebGPU, isolation, OPFS, HTTP tools, native text selection and exit arbitration passed |

The first crater audit was invalid: it sampled some chunks outside the new
survivor-centered ring and filtered terrain through CPU body classification.
The replacement GPU census used the same loaded inspection window and
proved all 124 untouched chunks intact. A moving corpse covered two cells
in that crater's visible pmap. The independent remote crater has no entity
overlap and provides the exact full-material preservation check. A GPU-only
probe of that off-grid region correctly returned no texture data; the final
remote audit reads its loaded CPU terrain. These attempts remain in evidence.

The four-tank movement-profile save contains diagnostic overhead platforms;
its combat is useful for lifecycle and persistence checks, not a clean-arena
gameplay comparison. The two- and sixteen-tank flight runs use the actual
arena without those platforms. A separate clean four-CPU run finished on
turn 10; the sixteen-CPU run finished on turn 30. Each had exactly one
survivor, no survivor parking, and exactly one detonation/end per launched
shell, with all hit notifications preceding end (10 and 30 shots).

After installation, the translated course passed again with a parked and
restored actor (live body ID 4 → 6, same durable ID and 100 HP). A separate
fresh tank crossed a 48-pixel-wide one-pixel ledge in both directions.
An initial ledge attempt timed out while the simulation was paused; the
repeat used the public simulation control to resume before starting. A
course save key reported no focus, so that attempt is not evidence of
course persistence. The course is rebuilt by the diagnostic runner.

The clean four-tank menu retry used the actual error-expanded layout after
fixed coordinates submitted empty numeric fields. Its subsequent submitted
parameters were verified as 0 humans / 4 CPUs / 5 seconds / seed 7. A large
sixteen-tank audit exceeded a single HTTP response timeout; paged retrieval
recovered the completed run (15,180 observed ticks, no residency violations).

## Artifacts and reproducibility

The refined candidate and final release differ only in build-number/home
content and generated documentation; no simulation or camera implementation
changed between them. Candidate `app.asar`:
`fba0e90e05b90e877fb1d547ab6cbf6e2e70dbd1f2487284414f1d7ae6a5d703`.
Final installed 0.0.2497 `app.asar`:
`79c695fa6099d65f6470d3454a59997b8254651f0b4d2c21915dfa3e986596ba`.
The Apple Silicon DMG and ZIP are in `tools/desktop/dist`. This local release
is ad-hoc signed, not notarized or publicly published. No Intel or Windows
runtime validation is claimed. Individual results and artifact hashes are
recorded in [acceptance evidence](m5-engine-2497-acceptance.json).

Raw reports and harnesses are under `/private/tmp/indigo-m5-engine`.
Completed disposable builds and the redundant full profile copy were removed
when disk space ran low; `cleanup.json` records that cleanup. The remaining
test profile is an APFS copy-on-write clone, not another full physical copy.
No old diagnostic profiles, saved holes or source evidence were deleted.

Indigo's course runner supports `--course-offset-x 1000 --stream` so the
extra diagnostic NPC can exercise restoration inside the supported camera
frame. Its temporary remote anchor parks/restores only that unscored actor;
production tanks are never parked to follow a shell. Production M5 wiring
uses the supported camera and independent-projectile APIs.
