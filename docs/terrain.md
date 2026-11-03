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

## Map types

`world/Game/terrain-recipes.json` contains painted WFC terrain and four native
maze variants: Bunker Grid, Rat Run, Cavern War and Terrace Siege. Random
selection and landscape tours use this same catalog. The advanced setup panel
exposes each maze's native parameters, with a solid stone foundation beneath
all maps and an open central deployment area in each maze.

Only the current round is created. Talus generates chunks as the camera and
bounded native anchors need them. Deployment loads supported tank positions;
it does not wait for the entire battlefield. Saved terrain damage remains
owned by the native world lifecycle; scripts do not repaint the map.

Tanks start across a 3,072-pixel central area with 128-pixel edge insets. Maze
maps reserve a matching open deployment corridor. The full 12,800×1,280 map
remains playable as the camera follows each tank or shell.

## Simulation coverage

The engine simulates the camera's window and bounded `talus.sim.anchor` claims.
Native projectile flight regions request terrain along the shell's route.
`Scripts/lib/residency.ts` claims small regions for ongoing effects, waits for
native readiness and releases the claims when those effects finish. Distant
tanks may park; their durable identities and state survive streaming.
Zooming out uses the native pyramid instead of loading the entire map at full
resolution. The game does not override the engine's simulation pacing.

`Game/arena-rules.json` supplies native rigid-body projectile edge rules.
Shots are removed 128 pixels beyond the sides and bottom, or 8,192 pixels
above the terrain. Tank bounds use the game's death rules. Install input policy
with `node tools/project.cjs ui` and the walls with
`node tools/project.cjs arena`, then save and export the project.

Project-owned noise, semantic, neural, living and vector presets remain in
`world/Game/Presets/` for editor painting and weapon effects. Maze recipes bind
their required captured resources through the native catalog; game scripts do
not run a preset preflight or decoration pass during match startup.

[Maze recipes](mazes.md) combine native foreground/background tile presets,
semantic and living brushes, noise, tile/pattern trim, loose grit and native
scenery entity rules. All four are included in the default random pool alongside
WFC. Neural brushes are excluded. Their authoring catalog is
`world/Game/Mazes/catalog.json`; `node tools/mazes.cjs build` keeps the active
round recipes synchronized with it.

`tools/build_wfc_template.cjs` regenerates the local bootstrap and reference files
from `assets/art/terrain-swatch.svg`. It does not install them into the editor.
`tests/wfc.test.cjs` checks pixel seams and gates; `tests/wfc-solver.cjs` runs the
native solver across seeded layouts.
