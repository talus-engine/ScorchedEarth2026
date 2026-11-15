# Talus engine alignment plan

## Scope and baseline

Prepared 2026-11-10 against sibling Talus engine checkout, HEAD
`b47d6c1e1`. Reviewed its `src/home/changelog.json` from the template's
build-2845 publication through November 9, plus the current script API,
template source, authoring tools and native fixtures. The template source HEAD
is `6e43209`; `project.json` still advertises minimum build **2799**.
The engine changelog entry `8076bfb90` identifies the published template as
build **2845**, with **65 project-owned element definitions**.

This document tracks the update. The implementation evidence below distinguishes
completed source work from native runtime and release gates still in progress.

Status on November 11: schema/audio source alignment, current-API checks, native
content preservation and bounded material checks pass. Release acceptance is
still open: packaged Bunker Grid runs at roughly 41–42 sim ticks/s against a
58-tick/s minimum. Profiling points to unique native brush generation on the
simulation worker. Resolve that dependency and the resumed-tank readiness fault
below, complete weapon/wreck integration checks, then refresh the final artifact
and minimum build. No release promotion has been made.

Status on November 15: the template is updated to the installed desktop build
**2961** (source `fc03607d9`). Its custom element ids were migrated above the
engine's new built-ins, and CPU aim was corrected for live flight. A native 2961
export passes the full archive audit (see
[Build 2961 retarget](#build-2961-retarget-2026-11-15)). The two engine
dependencies below (cast-state restore and maze brush throughput) are still open,
so release promotion is still on hold.

## Recommended next work

| Order | Work and location | Exit condition |
| --- | --- | --- |
| 1 | Talus engine: preserve cast state in the chunk inventory schema/adapter; resolve the saved inventory/cast disagreement at its producer | Exact state survives the codec and a fresh process reload after weapon switching and streaming; both live and parked tanks become ready |
| 2 | Talus engine: reduce or move unique maze brush generation work off the simulation worker | Exact authored maze output is preserved and the unchanged standalone 90-second packaged replay meets at least 58 sim ticks/s |
| 3 | Template: finish representative weapon, moving wreck, death-chain and round-completion checks on the corrected matched engine | Effects complete, intended debris pose/velocity is preserved, the next turn/round starts, and resumed play remains healthy |
| 4 | Template: refresh native captures, resource catalogs, affected gameplay docs, final archive and minimum build | Fresh import, named copy, ownership/audio audit and packaged save/discard/exit pass for the final artifact |

Steps 1 and 2 are engine dependencies discovered during investigation. Source
alignment already prepared here remains reviewable in the worktree. Do not
advertise build 2933 as accepted while its runtime gates fail. The detailed
sequence below covers the complete update; the evidence sections record what
has already passed and what still needs work.

## Impact assessment

| Priority | Engine change and evidence | Template impact and action |
| --- | --- | --- |
| Required | Element sample fields removed; keys now reference project/shelf rack synths (`9acdf9f36`, `f56f3a7ff`, `72b762133`) | The original `assets/native/elements/*.json` contained removed `ambientSfxId` fields, including `TANK_INK_VAPOR`. Null patch values are accepted removal requests, so these did not block installation. The prepared source changes remove stale keys, explicitly silence ink synths, and restore four intended element sample bindings through shelf keys. Review material records separately: similarly named fields in other record kinds must not be removed by a global text replacement. |
| Required audit | Old entity spawn storage and sprite spawn fields deleted (`7897d547e`); authored spawners replace them | Inspect the complete root/Title archive, design objects and sprite envelopes for former spawn points. Re-author any actual placements with current entity-key spawners. No direct old storage references were found in maintained template scripts/tools; this is an archive compatibility risk, not a confirmed script break. |
| Required verification | WATER/liquid gravity and FIRE/State defaults changed (`764eb31d7`); liquid pressure, shear and flooded flow changed (`aded8a2d5`, `e74b99578`, `828eb33a6`, `3e24f9114`) | Recheck liquid weapons, water ducks, fire/napalm, terrain ignition and title lettering. Project-owned overrides can retain authored values, so new engine defaults cannot be assumed to apply to this project. Inspect effective root and Title settings and elements before deciding what to adopt. The changelog explicitly reports wood-fire-spread failing under the new FIRE defaults. |
| Required verification | CA-damaged rigid bodies release debris at their current pose and velocity (`a326d0d7d`) | Recheck moving/rotated tank wrecks, death chains, terrain-eating effects and flame damage. Expect corrected debris placement; remove a workaround only if an actual conflicting one is found. |
| Required verification | Wait budgets now count simulation ticks, frozen while paused (`438a512c8`) | `lifecycle.ts` uses `tank.whenLive({timeoutTicks:600})`; admission and residency tests need 60/120 Hz and pause coverage. This change is at the baseline boundary and may already be included in 2845; verify rather than assuming a new break. |
| Required verification | Desktop exit arbitration and published wrappers changed (`4efbc5bc2`); bundling fixed (`497f8e31a`) | Exercise existing discard/save semantics and packaged exit, including failed/stalled saves. Continue using the engine publisher; check wrapper changes rather than duplicating its exit logic in game scripts. |
| Low risk | Default minimum zoom now 75% (`0186a0248`) | `camera.ts` explicitly uses zoom 1–2, above the floor. Keep this range; inspect stored camera settings and update overview documentation only where behavior differs. |
| Optional | Spawner transport, field/entity/body payloads, lifetime and landing modes (`2fe930dee`, `ddf63c0d5`, `3e8f57b4c`, `2fc152c23`) | Consider native spawners for repetitive emissions only after compatibility is established. Maze `spawners` in `terrain-recipes.json` and `Game/Mazes/catalog.json` remain represented in the current generation API; they must not be blindly renamed to authored spawner definitions. |
| No feature adoption needed | Camera/video textures, MIDI clock, synth editing and field-driven shape sizing | Existing gameplay does not require these features. Preserve explicit permission policy and check that startup and packaged audio do not request devices. |

## Implementation sequence

1. **Establish a reproducible target and preserve native content.** Record engine
   checkout build, installed desktop build and source revision; require matching
   builds using the existing export guard. Preserve a complete recoverable native
   project and account/save snapshot outside maintained source. Inspect root and
   Title records, elements, settings, spawners and audio dependencies. Record
   whether the old archive opens cleanly; if current schemas refuse it, use a
   compatible engine to inspect/export the authored content, then recreate it
   through current public authoring APIs. Do not add legacy loaders to the game
   or patch the engine database to accept obsolete records.

2. **Align schema and authoring tools.** Regenerate `.build/talus.d.ts` from the
   target editor (`node tools/project.cjs types`). Type-check the entire game
   against those declarations. Validate all custom element fields before writes;
   update `assets/native/elements`, relevant material definitions and
   `tools/records.cjs` where required. Bind intended element audio to shelf or
   project rack synths and include referenced samples/buses in the native export.
   Retain intentionally silent tank ink. Add focused checks for removed fields
   and unresolved audio dependencies. Do not rely on the Element editor silently
   discarding unknown fields: script validation remains strict.

3. **Re-author affected placements and verify persistence.** Replace any actual
   obsolete spawn placements with current spawners, choosing one-shot clock,
   landing, lifetime and residency deliberately. Test one birth, stream away/back,
   save/reopen and named copy: no duplicate tanks/props, missing Title objects or
   lost dependencies. Leave runtime creature/projectile creation alone unless
   current API validation or a reproduced behavior failure requires changes.

4. **Align physics with explicit game intent.** Compare effective project values
   with current defaults, then explicitly author the values needed for the game.
   Preserve the burning title, weapon identity and turn-resolution boundaries.
   Run representative water, acid/lava, napalm, digging and tank-death cases on
   painted terrain and a maze. Verify effects expire and the next turn begins.
   Measure corrected debris and fluid behavior before adjusting balance. Update
   `docs/terrain.md`, `docs/arsenal.md` and Title documentation to match results.

5. **Run bounded acceptance on the matched engine.** Run `npm run check`,
   `node tools/audit.cjs --source-only` and
   `TALUS_ENGINE_ROOT=/path/to/talus npm run test:native`. Extend only affected
   fixtures for actual API/behavior differences. Use the packaged smoke for a
   fresh game, CPU turn, round transition, save/resume and exit. Check admission
   at 60/120 Hz and paused loading, root/Title switching, complete project copy,
   title fire/audio, and no unsolicited device prompts. Keep evidence in
   `.build/`; mocks alone do not establish engine compatibility.

6. **Prepare the replacement release.** Set `minimumEngineBuild` to the oldest
   build actually validated for the final schema and APIs; do not retain 2799 by
   assumption. Refresh current native captures/resource catalogs and docs.
   Export with the editor saved/closed using `npm run template:export`. Audit
   project ownership of all expected elements (baseline 65; explain any intended
   change), child worlds, rack/bus/sample references, spawner definitions, native
   scene data and permissions. Test fresh import and named copy from the exported
   artifact. A later publication should use the existing immutable revision flow
   and update the engine registry only after these checks pass.

## Completion criteria

- Current declarations type-check without errors; focused source/native checks pass.
- All authored element and placement records validate against the target engine.
- Root and Title retain their content through export, import and named copy.
- Title ignition, representative fluid/fire weapons, wrecks and turn completion
  behave intentionally; save/resume and streaming do not duplicate placements.
- Packaged save/discard/exit work, with no device prompt during normal play.
- Minimum build, docs and exported artifact describe the same verified target.

Optional spawner/transport gameplay redesign and decorative audio upgrades are a
separate follow-up, with independent acceptance criteria.

## Implementation evidence

- Target checkout and installed desktop publisher both report build **2933**,
  source `b47d6c1e175d7968aef9bf6f18cae29cd6af9bde`.
- A read-only extraction of the original archive is preserved under
  `.build/engine-update/baseline.sqlite`. It contains 65 elements, zero installed
  player records, no template entity spawns, no cell entity births, and five
  design objects, all annotations. No placement conversion is needed for those
  records. There are zero stored sprite envelopes, so no sprite spawn payloads
  need conversion either.
- The original archive has four elements with non-null sample bindings:
  POLYETHYLENE, TERRA_LIQUID_DRAIN, TITLE_INK and WATER. Their original bindings
  are recorded in `.build/engine-update/element-audio-before.json`; these require
  rack review.
- The 17 custom ink specifications now omit obsolete null sample fields and
  explicitly disable their synths. `tests/native/elements.test.ts` checks known
  field names, intended silence and validation against the current engine table.
- `tools/records.cjs` validates the complete element batch before any writes.
  A regression proves that a refused later element leaves all earlier elements
  untouched. The five focused authoring tests and source audit pass.
- Declarations obtained from the build-2933 editor type-check all game scripts;
  the associated `npm run check` run passed all 157 game tests.
- Native validation passes 27 tests in five files and the 100-seed WFC solver
  check. Logs and inventories are under `.build/engine-update/`. These results
  do not establish visual, packaged, persistence or export acceptance.
- The original archive is refused by 2933 because `cells.entity_data` and
  `world_templates.entity_spawns` were removed. A separate candidate uses the
  engine's current definitions for those tables after proving both removed
  fields empty. Its receipt proves all retained values in 8,006 cells and three
  world records equal the baseline; all values in the other 67 tables also
  match. The original archive is unchanged. Receipts and the candidate live
  under `.build/engine-update/`; this is preparation for a native re-export,
  not an engine compatibility loader.
- Automatic review refused candidate import into the existing user profile
  because asset rows could be overwritten. That action did not proceed. A new,
  empty profile (`profile-2933-isolated`) with separate bridge ports and no host
  mount was used instead. Its import succeeded: **10,945 rows / 62 tables**.
- The imported template opens in the 2933 editor. All 65 element names resolve;
  `main` and `guide` report no faults or suspension. The 17 ink definitions
  install and read back successfully. All three native world identities and
  the Title `menu:title` / reset-on-entry binding are present.
- Four archived elements lost their former sample bindings when read by the
  current engine. `assets/native/materials/element-audio.json` explicitly binds
  those same samples through current shelf synth keys. Installation and
  readback pass for POLYETHYLENE, TERRA_LIQUID_DRAIN, TITLE_INK and WATER; native
  tests verify every referenced shelf synth exists. Silent source emitters
  also use the current explicit synth-off policy.
- Effective project WATER retains authored gravity **0.1**. FIRE uses current
  engine defaults (heatGen 0, life 20). Do not assume the new gravity-1 default
  replaced project overrides.
- The Title scene loads visibly with its native silver lettering, destructive
  particle animation and usable New game / Options controls; no device prompt
  appeared during this check. Its cold GPU startup takes time; do not restart
  it merely because a short observation finds the loading overlay.
- A fresh two-CPU, single-round Terra Reach match, seed **293311**, reached
  turn **4** through the title UI. Native match state records Buck firing twice
  and Molly once. The native save barrier blocks saving during the active
  sequence, as intended (`wfc-first-turns.json`). Finish action to save reached
  the ready boundary, Save & title returned to the title with Resume saved game
  available. Resume reopened the same world and reached turn **6**, preserving
  both roster identities and shot history; the native save status was allowed
  with no blockers (`wfc-resumed-state.json`). Cmd+Q then exited the isolated
  desktop cleanly.
- The closed isolated profile exports successfully through the installed native
  publisher as build **2933**. The candidate is
  `.build/engine-update/scorched-earth-2026-native-2933.talus`, SHA-256
  `e4508f3d504ab52593ac7d45f8278b0b6dac9f9fdf5b29b72e999b15b1fa4cf3`.
  The full archive audit passes, including source equality, Title binding,
  permissions and arena rules. Independent inspection confirms **65 root-owned
  elements**, **three world documents**, **zero installed player records** and
  **no obsolete sample fields** in exported element definitions. The original
  archive is still unchanged.
- Next gates remain representative effects, a maze replay, named copy and
  packaged acceptance against this native export. The advertised
  minimum build remains unchanged until those gates pass. No replacement has
  been published.

## Remaining acceptance findings (2026-11-11)

- The complete game check now passes **160 tests**, including the element batch
  refusal and trace-stream regressions, against current native declarations. The three targeted
  engine suites pass **55 tests**: simulation-tick wait budgets (including
  paused / 120 Hz presentation), rigid-body debris release ownership, and exit
  arbitration for stalled/failed saves.
- A Home → Save As named copy opens as project
  `14375948-2ea2-4452-8c07-bb539efba2a2`. It owns 65 elements, has no script
  faults, and has newly scoped child identities and its Title binding. It also
  exports through the native publisher. Root and acceptance-fixture chunk
  hashes/counts match the source exactly.
- Copied Title content is verified through the current engine's actual packed
  particle storage and color reader: all 20,045 particles are semantically
  equal. All 1,488 source chunks preserve raster data; game-time changes only
  remove the deleted empty spawn-claim field. The copy's 77 additional chunks
  contain no particles. Raw chunk hashes differ because of serialization
  normalization, not lost artwork. See the detailed proof below.
- The matched native publisher builds an ad-hoc-signed app, installer and ZIP
  from `publish-native-2933.talus`. Network asset staging initially could not
  resolve 270 required audio files; using the existing local asset-repository
  checkout with the supported `--assets dir=...` option preserves the complete
  sound closure. Package output and its manifest are under
  `.build/engine-update/package-2933/`.
- **Packaged Bunker Grid throughput is not accepted.** Seed 293311 with two
  CPUs loaded, deployed and reached native combat. The first 30-second replay
  ran beside the editor and averaged 31.7 sim ticks/s. A justified standalone
  replay with the editor closed, using the standard 90-second observation,
  completed a shot and reached the next turn but averaged **41.3 sim ticks/s**
  (80.5 display FPS), below the required 58. The gate remains unchanged.
- Standalone telemetry shows streaming work around 13–15 ms during the first
  minute, then around 2.3 ms in the last 30 seconds. Average sim rates for
  successive 30-second windows were 31.0, 39.4 and 54.2 ticks/s, with active
  particles growing from roughly 0.94 M to 1.48 M. Cadence was pinned to full
  speed (`simRung:1`, `simTickHz:60`), so this is observed workload slowdown,
  not a deliberately selected slower cadence. These measurements identify a
  profiling target; they do not yet establish the responsible subsystem.
- Both packaged test processes and the isolated editor exited. Evidence is in
  `packaged-maze-2933/`, `packaged-maze-standalone-2933/`,
  `engine-regressions-2933.log` and `final-check-2933.log`. Do not promote the
  export, raise the advertised build, or publish until the failing throughput
  and representative effects checks are resolved.

## Copied Title verification

The earlier raw-field comparison was too strict for the engine's actual live
particle representation. The current `PackedParticles` storage treats
`0xffffffff` in the explicit birth-color lane as absent, and
`storedParticleBirthColor` then reads the color carried in `tmp` for these
non-state materials. Applying those actual engine readers proves all **20,045
particles** semantically equal, including their effective colors. No artwork
repair is needed.

Across all **1,488 source Title chunks**, raster payloads are unchanged. The
game-time difference is solely removal of the empty `cellEntitySpawned` claim
from 1,380 records, matching the spawner change; every removed claim was checked
to be empty. The copy added 77 empty chunks while opening its editor, with no
extra particles. Evidence: `named-title-semantic-proof.json`,
`named-title-decoded-proof.json` and the passing `copy-codec.log` under
`.build/engine-update/`. This closes the copied-content/color gate. The later
bounded material checks also pass; throughput and remaining weapon/wreck
integration stay open.

The packaged smoke tool now supports bounded `--trace` / `--trace-seconds`
capture without changing gameplay or acceptance thresholds. Stream preservation
and cleanup tests pass, and short headless Chrome protocol checks pass for both
page and browser CDP sessions. The first full 90-second capture reproduced the
slowdown but its trace flush exceeded the initial 10-second deadline; that run
is not claimed as a successful trace. Capture now defaults to the first 15
seconds and uses a 30-second flush deadline. The subsequent standalone profiled
replay completed successfully; its results follow.

## Throughput trace and next investigation

The short trace completed successfully in the standalone packaged game. The
15-second capture contains 744,097 events. The unchanged 90-second acceptance
observation still fails throughput (41.7 / 60 sim ticks/s); this remains a
profiling run, not a performance acceptance result. Evidence is under
`profiled-maze-short-trace-2933/run-rT4lsg/`.

The engine's trace readers attribute **7,522 ms inclusive** of a **15.1-second**
engine-worker capture to `renderMazeBrushStroke`. Total sampled engine JS time
was about 8,665 ms across 35,394 tasks. Most brush cost is native semantic
stamping and growth/noise evaluation; `recipeRasterWashes` also appears. Only
about 10 ms of sampled long-task time was garbage collection. These are CPU
attribution measurements, not proof that the GPU has no independent cost.
Analysis is saved in `profiled-maze-all-cpu.txt`, `profiled-maze-cpu.txt` and
`profiled-maze-tasks.txt`.

An exact authored-brush replay now distinguishes unique generation from cache
eviction: seed 293311, the full 267 × 27 maze, both semantic and growth strokes,
and 720 chunks requested in center-out order produced **90 unique renders and
zero repeats**. Both the existing 262,144-pixel budget and a 1,048,576-pixel
budget produced the same output digest, covering 957,096 rendered pixels.
Unique rendering took about **14.2 seconds** in this replay. Evidence:
`brush-cache-replay.json` and `brush-cache-replay.log`. This rules out cache
thrashing for this workload; increasing the budget has no demonstrated benefit.

Next: investigate reducing or moving this unique CPU generation work off the
simulation worker, retaining exact output parity. This is an engine dependency
investigation; no engine change has been made or validated. The engine
already has a bounded brush cache and block evaluation; do not assume it is
missing a cache or raise memory limits without measurement. Preserve the full
maze, semantic layers and living decoration. Any engine dependency change needs
its focused parity/regression checks and a newly matched native build before
re-exporting the template. Neither a reduced observation window nor weaker
throughput criteria closes the current gate.

Trace export is opt-in and uses the gameplay page's CDP session, a bounded
15-second default capture, a 30-second completion deadline, streamed writes and
a 1 GiB file budget. Its stream-preservation and failure-cleanup tests pass;
actual packaged trace output is also verified. The profiling process has exited.

Final check for this stage: current declarations type-check; all 160 game/tool
tests pass (`check-with-trace-tools.log`), and the source audit passes.

## Native material acceptance

A disposable game instance of the blank acceptance world exercised native GPU
materials and the current `terrainWork` API. The source template was not painted.
Final GPU type counts and completed operation receipts are retained in
`effects-game-results.json`:

- All **960 WATER particles** remained in the closed basin and settled into its
  bottom region; none remained in the upper region. The authored gravity 0.1 was
  retained.
- LAVA and WATER produced **209 BASALT** and **215 STEAM** particles in the
  reaction region. Acid reduced the region's IRON from **384 to 27**.
- Matching excavation completed, removing exactly **512 DIRT particles**;
  immediate readback confirmed no DIRT remained in its target.
- The game's matching-fuel FIRE recipe completed with **183 removed / 183
  added**, preserving the replacement boundary. Fuel and wood burned, producing
  smoke; FIRE subsequently expired. Bare FIRE also expired without fuel.
- A final sequential 120-tick step completed; the native save status was allowed
  with no blockers.

An earlier harness request overlapped two step controls and timed out. That
interruption is retained in the receipt and is not counted as a gameplay or
timing result. Final assertions use the separately completed sequential step and
fresh GPU readback. These checks establish bounded material behavior; they do
not establish every weapon's balance, moving wreck pose, or maze throughput.

Remaining release work is the packaged throughput dependency, tank/wreck and
weapon integration coverage, then final matched export/import and minimum-build
promotion. Keep the original release archive and advertised build unchanged
until those gates pass.

## Resumed tank readiness fault

A later continuation of the same saved Terra Reach match reached turn 6 but
then stopped with `Error: Camera, terrain or tank weapon did not become ready:
Molly ‘Mole’ Morgan`. Native snapshots showed Buck stored and Molly restoring,
with both alive at 100 health. A bounded 600-tick observation found neither
tank live. The lethal-damage probe refused before applying damage, so this run
does not validate death, wrecks or round completion. The UI independently showed
the same guarded fault. The isolated editor was then closed normally.

Evidence: `tank-death-readiness.json`, `tank-death-damage.json` and
`tank-death-resume-fault.json`. Earlier save/return/resume navigation succeeded,
but sustained resumed play is now an open gate. Investigate native component
restore readiness for the saved tank, its weapon and inventory; compare a fresh
match with this save before attributing the fault to the engine or template.
Keep the existing readiness guard and timeout intact. After fixing the cause,
repeat saved play through a shot/next turn, lethal damage, wreck production and
round completion on the matched native build.

### Saved weapon evidence and engine investigation

A clean process reload of that exact save now produces the native exception
`Saved cast weapon does not match restored inventory` before world publication.
`engine_script_status` then reports no loaded world/scripts. This is a terminal
load error in that run, not a slow-loading inference. The engine console receipt
is `restore-diagnostics-console-all.json`; the closed profile's verified,
read-only SQLite copy is `restore-diagnostics-profile.sqlite`.

The matched publisher's profile reader and `ChunkStoreCore` extracted the exact
`world:6bc9aade-a416-455e-a4b6-ec0c88f94534:122,10` envelope. Decoding it with the
current engine's `ChunkEnvelopeCodec` proves a cross-store disagreement for
Molly (`instance@spawn-1c38fe0e-aee2-420e-a620-62d703e39969`):

| Saved owner | Weapon template ID |
| --- | --- |
| Parked chunk `npcInventory.equippedItem` | `082ebfbd-7d8a-493d-88a2-ec807bcef397` |
| Global `nativeProjectiles.casts` | `219d46ea-fa7c-4578-b119-bba07279e6f0` |

The parked inventory has neither an equipped-instance slot nor a cast record;
the global cast has zero pending shots. Buck's live sidecar, by comparison,
agrees with his global cast on `219d46ea-fa7c-4578-b119-bba07279e6f0` in all
three equipped-item/slot/cast fields. The passing diagnostic replay
`restore-codec-local.log` asserts the actual mismatching IDs; it verifies the
diagnosis, **not compatibility**. Compact evidence is in
`restore-diagnostics-weapon-parity.json`.

A second diagnostic isolates a confirmed engine defect without a GPU or save
repair: take Buck's actual live-sidecar entity (whose equipped item, instance and
cast agree), call `legacyEntityToSchema` then `schemaEntityToLegacy`, and compare.
The cast survives the first conversion but disappears from the second, while
the equipped instance remains byte-for-byte equal as JSON. The current
`ChunkSnapshotNpcInventory` type also omits `cast`, although
`SerializedNpcInventoryState` carries it. Both diagnostic assertions pass in
`restore-codec-local.log`; `restore-diagnostics-adapter-loss.json` records the
before/after values. This proves adapter loss, but does not by itself explain
why Molly's equipped weapon differs from her global cast.

The engine work therefore has two separate acceptance items:

1. Preserve and validate the native saved cast through the chunk inventory
   schema, codec and live-entity adapter, with exact cast-state round-trip tests
   and malformed-input refusal. Reuse the existing cast-state shape/validation;
   introduce no legacy fallback or save migration.
2. Resolve the observed cross-store weapon disagreement at its producer. A
   passing cast-field round trip alone cannot close the resumed-play gate.

Investigate the engine's coupled capture/publication path before changing the
template. `WorldManager.augmentCollectedEntityRecords` can augment a parked
record using a matching blackboard while reading instance/cast data from a
body-ID-keyed emitter. `ParticleSimulationWASMHost` also stamps inventory while
parking; `ProjectileManager.unregisterEmitter(..., true)` separately retains a
durable cast. These are candidate seams, not a proven causal attribution.
`EntitySpawner` prepares/restores the chunk inventory, and
`ProjectileManager.prepareCastRestore` / `applyRestoredCast` correctly refuse a
different weapon. Preserve that refusal and exact-body readiness guard.

Required regression: equip a non-default carried weapon, switch weapons, park
the tank by streaming away, save, close the process, and reload. Assert parked
inventory, saved equipped instance and global/native cast agree at the same
capture boundary; restore the exact instance/mods and resume a shot without
duplication or loss. Include recycled body IDs and both live/parked owners.
Do not repair the observed save in place or discard a paid cast as a workaround.
After the producer is fixed, regenerate a fresh acceptance save and test the
full round/death path. Any engine fix requires a newly matched desktop and
publisher build, declarations and re-export before release acceptance.

## Build 2961 retarget (2026-11-15)

The installed desktop and its publisher report build **2961**, source
`fc03607d93540b09df2def4606f123ae1d842fde`. Engine changes since 2933 cover
GPU/renderer performance, colour bleed, art materials and tools, and a light
height. None of them changes casts, inventory, chunk codecs or maze brush
generation. The declarations differ from 2933 only by an optional light `z`.

### Element ids

2958 added eleven built-in art elements at fixed ids 223–233 in the engine's
256-element table. This project's custom elements were created at 223–249, so
on 2961 the project table was refused (`Duplicate element ID: 225`) and neither
its custom elements nor its overrides loaded. The template now adapts to the
engine:

- Ten custom elements no game source, chunk or record uses were removed: the
  five terrain emitters/drain, three old title emitters, `TANK_INK_VAPOR` (now only
  the generator's base recipe, `assets/native/materials/tank-ink.json`) and
  `TITLE_INK`. `terrain-emitters.json` and the two dead audio bindings went with them.
- `TERRA_LASER` moved 231 → 249 and `TANK_INK_35D9FF` 233 → 250. The laser
  round's particle projectile (`elementType`) and `laser.json` follow it.
- Eight unowned, unreferenced `indigo/art/…` milestone art entity templates built from the
  removed emitters were dropped from the archive.

Stored chunks carry their own id→name table, and all three worlds contain only
built-in materials (`chunk-element-names-2933-export.json`). Renumbering
therefore changes no painted content. `id-remap/migrate.cjs` built the
candidate; its receipt proves every other row of every table is unchanged. The
project now owns 55 definitions (38 overrides, 17 custom elements at 234–250)
with four ids to spare. `tests/native/elements.test.ts` guards that budget.

### CPU aim against live flight

Planned CPU shots were landing 200–390 px short at ~2,850 px range. Engine-only
flight probes (`id-remap/flight-probe.js`) separated two causes:

1. **The game's own shot trails.** Moving rigid bodies push loose gas aside and
   take a weight-scaled impulse. The ink (weight 1) was spawned at the shell's own
   position and persisted between shots, braking shells by up to 415 px. The ink
   is now weightless, and the probe's errors returned to the engine baseline.
2. **Unmodelled air drag.** Live shells lose ~0.015/s of speed that the native
   forecast omits (`evolving-air-fields-not-predicted`), about 4% of range on a
   5-second arc. `ballistics.ts` corrects power at the validated angle,
   re-surveys for headroom when the arc was solved at full power, and fits the
   drag from each clean CPU flight. Live matches fitted 0.0150–0.0154/s.

Corrected planned shots then landed 14–17 px from target in both directions
(`id-remap/play/fixed-2961*.json`). CPUs now also zero in deliberately by
bracketing, with skill-sized opening widths ([players](players.md#zeroing-in)). Live,
an expert's ranging round landed 109 px short and its next bracketed shot hit; a
rookie whose short and long ranging points were blocked by terrain fell back to a
half-distance long round instead of an exact shot (`id-remap/play/bracket-final-2.json`).

### Verification

- 173 game/tool tests and the type check pass on the 2961 declarations; the native
  suite (27 tests, real Rapier) passes against an exact 2961 source tree; the source
  audit passes.
- A fresh profile imports the migrated archive (11,028 rows / 66 tables). All
  55 definitions resolve by name with their overrides applied (WATER gravity 0.1).
  `records.cjs elements` installs and reads back, and `records.cjs install`
  finds no entity differences.
- The Title renders its lettering, and CPU matches run through shots and turns
  without script faults.
- `npm run template:export` (guarded against an exact 2961 source tree) wrote
  `project/scorched-earth-2026.talus`, build 2961, SHA-256
  `454a9e95ccae762ad3a4a77ac53109de325ca52bd47bf8995248e6bce384d918`. The full
  archive audit passes. The previous 2845 archive is kept as
  `.build/engine-update/project-archive-2845-before-2961.talus`.

`minimumEngineBuild` stays at 2799 until the release gates above pass.

### Publication (2026-11-15)

The installed desktop moved to build **2975** (source `ca49070fe`) before
publication. Builds 2962–2975 change only synth and audio code, with no element,
script API or archive schema changes. The native suite (27 tests) passes against
the exact 2975 source. `npm run template:publish`, matched to that source, produced
the same archive bytes, still stamped build 2961 by its authoring profile. It
published revision `454a9e95…` to the `templates` branch, and hosted verification
reports `ok`.

The engine branch `scorched-earth-template-2961` (`3278836ad`, based on the
local engine `main`) changes only `src/templates/templateRegistry.json`. Its
live registry lane downloads and installs the revision and opens a copy with no
script faults. The engine type check and registry unit tests pass. The branch
skips the commit hook's build bump so it merges cleanly, and it is not pushed.
