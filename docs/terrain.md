# Terrain and WFC art

Gameplay uses the `daylight` biome in `world/Biomes/`: a 0.95 neutral ambient
floor, exposure 20, fixed noon, and no night-cycle or fog dimming. Talus applies
Reinhard tone mapping: this yields 95% light on open terrain and over 90% even
with the compositor's maximum wall-interior dimming. Its native
`scorched-daylight` lighting preset is captured in `assets/native/lighting/`.
The arena's layout cells also bind that preset for editing. Rain retains the
same daylight floor; fire and explosions can still add their own light.

The battlefield is 50 tiles wide and 5 tiles tall. Each WFC tile is a square
256×256 world pixels, or 4×4 native 64-pixel chunks. The bottom tile row is solid
stone so loose material remains in the world. The visible editor socket labels
are not the tile boundaries.

`world/WFC/template.json` describes the reusable square scaffold and its 24
source origins. `artist-sheet.svg` is a reference. Native saved tile pixels are
authoritative; `bootstrap.svg` is a reproducible starting palette. Reimporting
the bootstrap replaces art, so do not use it to update a painted palette.

Gate markers bracket the filled portion of each connector. h64, h128 and h192
start ground at that many pixels down a vertical face. North/south fractions run
left to right; east/west fractions run top to bottom. Keep the eight-pixel
silhouette collars and two-pixel material rims compatible. The rims copy the
same native noise samples on touching edges, which makes the join agree in
both geometry and material. Interiors can be painted freely.

The scaffold's source origins are listed by `originAnchor` in chunk coordinates.
Surface origins occupy Y8, X0 through X68; foundation origins occupy Y12 at
X0, X4, X8 and X12. Sky is at (0,0), and bedrock at (0,16). Paint the source
origins in the editor, save, and export the complete project to capture the art.
The live artist layout may intentionally omit or relocate scaffold slots.

## Procedural families

Native terrain recipes select WFC, zone and maze forms, including materialized
zones decorated with brushes. The advanced setup panel exposes their native
parameters. Brush landscapes build a foundation and connected central terrain,
then use noise, semantic, neural, living and vector tools from the pinned catalog.

Preset selection uses seeded shuffled bags. Story affinities weight ordering
without excluding presets from a complete bag. Noise strokes vary spin and Size
LFO amplitude. Living brushes scale nominal growth and planting density to a
bounded region. Textured vectors become material-appropriate physical planks,
blocks and other props. Story motifs add breakable supports and reservoirs.

Foreground clearance uses large spinning flower masks with an empty-heavy
semantic mixture. It follows the terrain imperfectly and leaves the background
and stone foundation intact. Native terrain receipts must report completion and
actual body placement before progress is persisted. A refusal stops generation
with its reason; it is not silently counted as completed work.

`tools/build_wfc_template.cjs` regenerates the local bootstrap and reference files
from `assets/art/terrain-swatch.svg`. It does not install them into the editor.
`tests/wfc.test.cjs` checks pixel seams and gates; `tests/wfc-solver.cjs` runs the
native solver across seeded layouts.
