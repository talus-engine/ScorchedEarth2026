# Terra Reach WFC artist template

The replacement scaffold was installed in Indigo on Talus **0.0.2561**; current runtime **0.0.2568** includes the accepted full-footprint origin-save fix. It has **50×5 square tiles**, each **4×4 chunks / 256×256 pixels**. The 33 stray anchors were demoted with the native reversible repair; their common data and the old `indigo-mixed` palette remain intact. Checkpoint: `snap_90863e52-32f7-4bde-a2f2-2ae7c948c2e2`.

Use the [contact sheet](../world/WFC/artist-sheet.svg) and [machine-readable template](../world/WFC/template.json). [The native editor capture](evidence/m12-wfc-template/editor-connected-grid.jpg) shows the installed boundaries and native slider marks. The bright socket-label rectangles describe connectors; they are not the tile footprint. Every footprint is four grid squares wide and four high.

## Layout and seed behavior

| Tile row | Chunk Y | World Y | Purpose |
| --- | --- | --- | --- |
| 0–1 | 0, 4 | 0–511 | Empty sky |
| 2 | 8 | 512–767 | Mixed earth surface, ridge/bowl variants |
| 3 | 12 | 768–1023 | Four earth textures, stone transition at the bottom |
| 4 | 16 | 1024–1279 | Entirely solid STONE |

The height at each tile joint is deliberately fixed in this artist scaffold. A seed chooses between ridge and bowl silhouettes with those same joints, plus four earth interiors. The two silhouettes differ by up to 96px at their centers; extreme bowls/ridges are clamped inside the tile. This produces different terrain while keeping every editor guide exact. There are no wildcard/union faces and no overlapping footprints. The other procedural landscape modes keep their existing generation rules.

The leftmost eighteen surface tiles visit every ordered height pair twice, exposing both editable variants in a connected landscape. Only **24 origins** own reusable palette art. The other **226 anchors** are remix slots filled from that palette. Editing a remix slot is a local level override, not a new reusable tile.

## Edge contract

Native gate marks bracket the **filled bridge**. Fractions run left to right along north/south edges, and top to bottom along east/west edges. Matching faces copy the same fractions; do not mirror them.

| Connector | Required edge pixels | Slider A | Slider B |
| --- | --- | --- | --- |
| `sky` | Entire edge empty | 0 | 1 |
| `earth` | Entire edge filled with the shared mixed-material rim | 0 | 1 |
| `stone` | Entire edge STONE | 0 | 1 |
| `h64` | Empty above pixel 64; ground from 64 through 255 | .25 | 1 |
| `h128` | Empty above pixel 128; ground from 128 through 255 | .5 | 1 |
| `h192` | Empty above pixel 192; ground from 192 through 255 | .75 | 1 |

Keep the eight-pixel collar at the west/east terrain edges level with its connector. Preserve the outer two material pixels on each face so all matching tiles retain identical material seams. Freely repaint the interior, add silhouettes, strata and details, and retain the ground connection between the filled faces. Keep sky sources empty and bedrock completely STONE. The foundation variants retain sixteen STONE rows at their base.

The sliders are real `wfcGates` metadata, draggable with the editor's entity move tool. They do not alter the terrain or the solver. Socket names enforce compatibility. Moving a guide alone does not change which tiles can join. Changes to connector height require updating every tile offering that connector, its matching neighbors, and this template's gate policy.

## Where to paint

The user owns the painting pass. Preserve their source art; automation must not regenerate or replace it.

Coordinates below are **chunk anchors** in Indigo. Multiply by 64 for world pixels. Every source occupies the following 256×256 rectangle. Use the World Layout editor to locate the coordinate; zoom in before painting.

| Source | Chunk anchor |
| --- | --- |
| Sky | (0,0) |
| Bedrock | (0,16) |
| Earth 1 / 2 / 3 / 4 | (0,12) / (4,12) / (8,12) / (12,12) |
| 64→64 ridge / bowl | (4,8) / (8,8) |
| 64→128 ridge / bowl | (12,8) / (20,8) |
| 64→192 ridge / bowl | (40,8) / (48,8) |
| 128→64 ridge / bowl | (0,8) / (16,8) |
| 128→128 ridge / bowl | (24,8) / (28,8) |
| 128→192 ridge / bowl | (32,8) / (56,8) |
| 192→64 ridge / bowl | (36,8) / (44,8) |
| 192→128 ridge / bowl | (52,8) / (68,8) |
| 192→192 ridge / bowl | (60,8) / (64,8) |

Arrows mean **west height → east height**, measured down from the tile top. Source IDs and installed tile UUIDs are retained in [installation evidence](evidence/m12-wfc-template/installed.json).

**E50 artist saving is accepted on 0.0.2568.** Packaged worker and loopback tests preserve the origin/remix bindings, all fifteen painted child chunks and an intentionally empty child, with no unintended standalone child placements. This fixes the 0.0.2561 top-left-only autosave defect. The user can paint the editable origins; automation will preserve that artwork. The acceptance used isolated fixtures, not a repaint of these sources.

## Files and safe maintenance

`world/WFC/bootstrap.svg` is the original element-indexed 24-tile import, built from the exported Talus noise-brush swatch now packaged at `world/WFC/mixed-earth-swatch.svg`. Both are historical bootstrap inputs, not current painted native tile art. `world/WFC/template.json` owns the layout/source/connector manifest. `world/Game/wfc-gates.json` records the guide policy. These files are installed into the game instance and tracked as real repository files, not symlinks.

The builder and installer are **one-time bootstrap tools**. Do not rerun them over later artist work. The installer refuses an existing origin layout and keeps the old palette. Native database tile art is not automatically captured by syncing the world file mount; use Talus's project export to preserve the complete edited palette, alongside normal mount-file capture. Retain the edited export before any future source regeneration.

Validation commands:

```sh
arch -x86_64 python3 tools/check_wfc_template.py
node tools/check_wfc_solver.cjs
```

The first checks actual material pixels, slider spans, 222 possible material joins, all 445 layout adjacencies, candidate coverage, and the solid bottom. The second loads the engine's actual WFC solver and verifies 100 distinct seeded maps, repeatability and use of all 24 tiles. Native installation, reopen and terrain survey evidence lives in `docs/evidence/m12-wfc-template/`; these local checks validate the scaffold; E50 acceptance comes from the separate installed engine tests.

Native running-game acceptance covers seeds 256201 and 256202: all 50 surface columns were present and all 100 bedrock probes per save were STONE. The seeds differ at 29 sampled center heights. One loose-surface probe changed during physics and is retained explicitly; no exact post-simulation pixel invariance is claimed. Accounts remained byte-for-byte unchanged. See [validation summary](evidence/m12-wfc-template/validation-summary.json).
