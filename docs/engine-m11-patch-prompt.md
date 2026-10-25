# Next engine release — portable procedural worlds and remaining game UX

Implement these as reusable engine capabilities, then release an installed build. The user is Talus's author and explicitly prefers engine fixes over game-script workarounds. Work in the engine repository, obey its AGENTS.md, and preserve current Scorched Terra game content. Do not launch another UI acceptance session concurrently with the game agent.

## Accepted baseline and priority

Read `docs/m10-native-menu-validation.md` in the engine repo. **0.0.2541** accepts E36 native navigation and the original E37 inner-control skin at the tested desktop viewport. Its app.asar hash is `79713e412541e3c6d1a32fdb20f4bcfb7236e684280a6809e43215146b070e88`. Preserve this work; do not repeat its old implementation prompt. The report explicitly leaves the expanded Settings width/clipping matrix, E38/E39 and older carryover open.

The game workspace is `/Users/tonygermaneri/gh/indigo`; Indigo template ID is `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`. Its current installed generation works with the supported subset: native zone base, all 50 semantic detail sites (17 neural evaluations), all 50 living sites, and seven light foreground clearing jobs. Seed 2541102 reached ready with two live CPUs and sixteen intact STONE floor probes. See `docs/evidence/m11-foreground/`. Three generation diagnostic baselines were restored exactly; no match is running.

Prioritize E45 (invalid WFC anchor overlap) and E37/E40 (concrete UX/series defects), E43/E44 and E41 (new procedural generation), E42 (loading presentation), then the remaining E38/E39 launch/publishing flow. All remain requested; if release boundaries split the work, report exact completed and unimplemented IDs rather than claiming the whole prompt complete.

## E43 — Game-owned complete preset and asset snapshots, executable at runtime

### User requirement

Randomize across the **entire available noise, semantic, neural and life catalogs**, including Bramble and the many presets the current game does not use. Copy settings into the authored game and each new game instance so engine defaults, profile changes or later template edits cannot change an existing save. Include every preset in the project snapshot; use bounded seeded selections across rounds, not all presets simultaneously in one enormous stamp.

The game agent has already exported and installed `Game/Presets/` in Indigo, mirrored at `indigo/world/Game/Presets/`:

- `noise.json`: 166 complete noise presets, all with texture sources.
- `semantic.json`: 97 complete semantic recipes (96 built-in, one authored).
- `living.json`: 18 complete growth presets, including full sheets/depth/materials/timing; the list tool alone returns only summaries, so full JSON was read through guarded read-only SQL.
- `neural.json`: all four models (`builtin-nca-eight`, `builtin-nca-four`, `builtin-nca-masonry`, `builtin-nca-stations`), complete architectures and base64 weights with checksums.
- `vectors.json`: 37 native SVG path/viewBox definitions.
- `semantic-settings.json`, `element-catalog.json`, a SHA-256 `manifest.json`, and `dependencies.json`.

Every copied file has exact API readback in `docs/evidence/m11-presets/installation.json`. The total is about 1 MiB. **This is a settings snapshot, not completed native activation or full asset portability.** Dependencies contain **642 unique `sprite-image:` references**; their image payloads still need project-owned resolution. Do not treat IDs/URLs alone as copied assets. Preserve the snapshot as input rather than recapturing a moving global library without comparison.

### Demonstrated limitations

These are source/contract findings against the actual captured catalog, not invented failed paint calls. `docs/evidence/m11-presets/capability-audit.json` lists the exact counts/IDs.

- `simulation/TerrainRecipe.ts` rejects raster washes and non-world particle slots. **96/97** captured semantic recipes contain raster output. Dropping those washes would change the preset, so the game has not enabled the whole catalog with stripped fields.
- `simulation/TerrainGrowth.ts` requires world/active depth with both other bands dropped; it refuses body output, clipping, flow and raster shadows. **12/18** captured growth presets are incompatible as authored. Bramble, coral, flowers, grass, wheat, ivy and others need depth routing; Vine ledge targets Midground; Lightning also uses time clipping. Do not silently rewrite their depth or disable timing to make them pass.
- `brush_models`, `vector_shapes`, `brush_shapes` and `patterns` are classified as **profile** data in `DatabaseWorker.ts`. Neural models have no template ownership column. Preset ownership exists, but shared built-ins and merge/retired-builtin behavior are not an immutable per-save resource snapshot.
- Noise bands refer to numeric element IDs and visual assets. Resolve/preserve material identity and textures, including the visual dependencies used by semantic compilation and NCA anchors.

### Required implementation

1. Add a supported, scoped catalog snapshot/import/export/resolution contract. It must capture full presets, neural architectures/weights, vector/brush shapes and their dependency closure into the template, then pin the selected version for each game save. Stable project resource IDs and content hashes are preferable to reliance on `builtin-*` global lookups. Expose this through HTTP/MCP and the script/runtime surface as appropriate. No arbitrary SQL writes or private store mutation from game scripts.
2. Resolve the actual texture/image/pattern assets used by the snapshot. Include bytes and references in `.talus` export and installed/published games. Missing required resources must produce an actionable preflight error. Preserve per-project overrides without modifying other templates or the engine's shared library. Imported assets must survive offline replay on another machine; retain source/license provenance where available.
3. Let bounded runtime jobs execute complete semantic/noise/neural/growth presets through the same native editor kernels and visual resolver. Support their authored target layers, raster washes and depth routing. Honor each layer's identity, ownership, locks and serialization. The user's **final clearing pass targets foreground only**; it must not erase background/midground textures or living bodies.
4. Support finite generation of the captured growth variants, including their native output/timing semantics. If a preset continues living/flowing after generation, hand it off through the normal lifecycle with explicit completion/progress/save semantics; never wait forever for a living world to settle. Keep bounds, quotas, cancellation and all-or-refuse commits. Provide a preflight capability report by preset ID rather than silently pruning unsupported presets.
5. Pin the catalog/version and resolved selections to a new save before generation. Script policy will use separate seeded shuffle bags for each preset family and store selected IDs/settings/progress. Do not consume combat RNG, write a megabyte of global state every tick, or re-read mutable global defaults on resume. Updating the template applies only to deliberately created new games.

### Acceptance

Validate every captured preset and all four neural models against the new contract; exercise every distinct output/layer/timing class in real bounded jobs, including ordinary Bramble and Living bramble. Use several fixed seeds to show variation and repeatability without fixed alternation or catalog-order bias. Capture actual material/color/layer output, not allocation counts alone. Compare same-seed editor/runtime native output where their contexts match. Verify native NCA weights and textures are the snapshot's bytes.

Export/import to an isolated minimal test environment with the original global preset/model libraries and network unavailable. Create and reopen a map, then change engine/shared defaults and the template snapshot: the old save remains unchanged, a new save deliberately adopts the new version. Verify streaming does not regenerate or duplicate completed jobs. Keep account baseline/restore and disk bounds described below.

## E44 — Runtime native vector/line brushes and textured rigid structures

The user wants random vector shapes and line strokes in terrain generation, and rigid bodies whose geometry/material fits the selected noise texture: **concrete texture → CONCRETE block/box; wood texture → WOOD planks/blocks**, with varied dimensions, orientation and other appropriate structures. Preserve visual texture while assigning real element properties; changing tint alone is insufficient.

Existing native building blocks should be reused:

- `components/raster/VectorShapes.ts`: shape library, geometry-bound fitting, SVG rasterization, fill/stroke.
- `LiveEditorController.ts`: `applyVectorShape`, masked brush plans, independent fill/stroke sources and `outputMode: rigid-body`; line/stroke implementation.
- Runtime `terrainWork` already accepts polygons/thick polylines, but does not expose that native vector-shape/texture/output pipeline.
- `talus.bodies.create` currently accepts a one-element rect or explicit cells, at most 16,384 cells. It skips occupied/out-of-ring cells. It cannot faithfully provide arbitrary textured vector bodies across a 50-tile arena. Do not solve this by moving the camera, hand-rasterizing SVG in scripts, or emitting thousands of scripted cells.

Add bounded native runtime vector/line jobs (or extend the common job contract) with project-owned shape/path, world geometry, seeded transform/size, fill and stroke source (element/noise/semantic as supported), and output target (foreground/raster or durable rigid body). Reuse the editor rasterizer and texture/material sampling. Expose optional real element override for a texture-derived material so concrete and wood bodies have the intended physics without losing their sampled colors. Resolve materials by stable identity/name; refuse non-solid body members or unsupported combinations explicitly.

Acquire a bounded simulation region for off-camera generation and commit the complete body or refuse before mutation. Never silently crop to the current active ring. Report durable body IDs and accepted geometry/material counts, persist generated objects/progress, and preserve normal streaming, sleeping, collisions, destruction, saving and reloading. Avoid disconnected islands being accidentally joined into one body; use native component handling with bounded body/particle budgets. Keep the solid bottom tile protected.

Game policy will select size, pose and structural families from the captured texture metadata, with occasional concrete slabs/blocks, timber planks/blocks and matching structures for other solids. It will keep the central playable area broadly open, without carving a perfect tunnel through everything. No need to hardcode Scorched Terra names or this material policy into the engine.

Acceptance: actual native line and several nonrectangular vector shapes; textured concrete box and rotated timber plank; a job outside the camera; capacity/overlap refusal with no partial object; real gravity/contact and material readback; save/reopen and stream-away/back with identical shapes/colors and no duplicate bodies. Verify foreground erasure leaves the rigid bodies and other layers intact by default.

## E41 — Seeded Spin/Size LFO and shaped foreground erasure

Retain the full E41 contract in `indigo/docs/engine-m10-completion-prompt.md`. The user clarified **Spin + Size LFO amplitude**, not an invented oscillating-rotation control. Reuse native maze/editor dynamics with deterministic path sampling. Support a large noncircular flower/custom brush shape and eraser output. Preserve the shape asset in the scoped snapshot.

Latest correction: all decoration/growth passes should run; final clearance should be light and imperfect, **foreground only**. Do not restore skipped central sites, delete living bodies or demand a perfectly collision-free tunnel. Native semantic EMPTY erasure already works; do not duplicate it. The current game uses seven varied 128–192px-radius EMPTY-heavy pockets, matching-only, ending above pre-decoration ground. It removed much less material than the rejected heavy pass. Spin/Size LFO and shaped eraser strokes remain the missing native features.

## Retained requests E37–E42

Use `indigo/docs/engine-m10-completion-prompt.md` for the full reproductions and acceptance; these are still requested, not closed by the 2541 menu report:

- **E37:** Settings **600→900 CSS px**, responsive outer gutters, connected/centered tabs and fixed title/footer. The user screenshot shows left action labels clipped when the rightmost binding button receives focus. Test both edges, all columns, top/bottom and remapping at normal/narrow/short viewports. Actual screenshots must be inspected; font shrinkage or hiding inaccessible overflow is not a fix.
- **E38:** visible editor **Play from Title** action. Publication is unnecessary for local play. Actual title→setup→armory→first CPU shot works after HTTP title entry; visible editor entry still needs implementation/acceptance.
- **E39:** installed Talus **Publish Game** wizard → exported artifact → bundled publishing CLI/toolchain → real installer (Mac DMG/app, optional ZIP) → reveal/launch. Full field, cancellation, failure, storage and clean-machine acceptance requirements are in the linked prompt. A repo-relative CLI invocation or artifact download alone is not complete.
- **E40:** cached setup terrain draft overwrites the between-round shop's explicit typed generation request. Source: `MenuOverlay.vue::onOverlayClick` unconditionally uses a cached terrain draft even when the submitted menu has no terrain control. Preserve current-menu ownership and explicit request precedence; actual round-two evidence is in `indigo/docs/evidence/m10-final-2026-10-24/terrain-carryover-defect.json`. This blocks full-series acceptance.
- **E42:** authored loading presentation or explicit hidden option, including pre-script startup/new game/load/round advance. Preserve errors, retry/cancel, focus and progress/indeterminate status. No invisible blocking modal or flash of stock loading text. Include configuration/assets in exports.

The WFC guide configuration is game-side work already saved: 250 known anchors/1,000 pairs, sky/full-material extents and variable-height envelopes. The later E45 audit below finds the previously preserved unknown anchors are overlapping invalid placements. Preserve their authored content while diagnosing and repairing them; do not simply erase them.

## E45 — Overlapping WFC anchors make the square layout appear irregular

**Current live read-only reproduction, 2026-10-24:** Indigo has a global WFC tile size of four chunks, so every WFC footprint is **256×256 pixels**. The intended battlefield is 250 anchors on the `(0..196 step 4, 0..16 step 4)` grid. The earlier marker audit found 26 additional origin-like `edge` anchors; the latest live audit finds **32 overlapping extra anchors**. Every extra overlaps another 4×4 footprint. Examples: `(136,2)` overlaps `(136,0)` and `(136,4)`; `(78,5)` overlaps regular slots `(76,4)`, `(80,4)`, `(76,8)` and `(80,8)` plus another extra `(76,6)`. Coordinates are chunks.

Evidence: `indigo/docs/evidence/m11-wfc-gates/overlap-audit.json`, `overlap-comparison.json`, the earlier `before.json`, and the user's `user-overlapping-footprints.png`. The six new coordinates are recorded in the comparison. The game agent's gate edit verified unchanged cell count and unchanged **every non-gate field** against its preflight; that operation only wrote `wfcGates`. The creation path for the extra anchors is **not established**. Do not attribute it to user error, the marker operation, or game-mode terrain loss without reproduction.

`world/layout/worldLayoutEdits.ts::wfcPlacementBlocker` already rejects overlapping/staggered WFC placement. Find the path bypassing that invariant: inspect native WFC paint/move/copy-paste/import, raster edits/baking/autosave, and load/serialization. An ordinary paint or gate drag must not manufacture a second origin inside an existing footprint. The small yellow anchor-chunk outlines and rectangular colored socket labels are overlays; the latter intentionally are not square. `useOverlayDraws.ts::drawWFCSocketOverlay` uses the same N×N footprint for every anchor. Overlapping anchors create the contradictory gray `edge` labels visible in the screenshot; do not “fix” this only by hiding overlays.

Enforce the placement invariant at every authoritative mutation boundary, including public APIs and persistence. Add validation that reports exact conflicting anchors when loading legacy invalid layouts. Provide a reviewable, reversible repair for this existing project: retain the legitimate 50×5 grid, preserve raster/particle data, tiles, entity/trigger/ambience records and any unique authored content attached to extra anchors, and reconcile misplaced anchor metadata without silently deleting content. Back up the affected native data and verify repair before removing redundant metadata. Do not expand or shrink individual footprints to accommodate overlap, or rely solely on UI-side checks.

Acceptance: preserve the original failure as a fixture; reproduce the creation path and add its regression. Exercise paint, gate dragging, move/paste/import, raster edits, save/reopen and export/import. The repaired project must have no overlapping or staggered WFC footprints and retain the expected square 4×4 anchors/content. Capture and inspect editor overlays at several positions and a seeded game-mode map. Account/save preservation still applies. If a path is not yet understood, report that limit rather than claiming a one-time cleanup prevents recurrence.

## Diagnostics, limits and delivery

One 2541 GPU-loss event after reopening the earlier hybrid diagnostic reported `gpu-stall-suspected`, `A valid external Instance reference no longer exists`, and a pending heartbeat; normal editor navigation/Quit did not finish. User restart recovered it. Screenshot and details are in `indigo/docs/evidence/m11-generation/gpu-device-lost.*`. Cause is unknown; investigate recovery and teardown without asserting terrain causality or removing generation passes. Subsequent runs and native navigation completed. This single incident is a diagnostic, not a proven new release blocker.

Older E14/E16/E23/E24 and quiet-save carryover remain documented/disabled. Future air/pressure prediction is explicitly not requested; preserve best-estimate native ballistic planning and observed-shot feedback.

Run the engine's required checks and one bounded installed acceptance pass. Use CPU-only diagnostics, fresh unique names and a **fresh exact account baseline per run**; restore only that baseline after verifying existing accounts did not change. Preserve other saves. No large profile clones or redundant builds: disk pressure is real. Use small owned temporary fixtures, clean them and report retained artifact sizes. Do not overlap UI automation with another agent or the user.

Deliver exact implemented/open IDs, source commit, installed version/hash, API/declaration/docs changes, test results, visually inspected screenshots with viewport dimensions, asset hashes/portability checks, and known limits. Leave the editor usable and accounts restored. Report failures as failures, and make the native API concrete enough for the game agent to wire the full catalog without private hooks or engine edits from game scripts.
