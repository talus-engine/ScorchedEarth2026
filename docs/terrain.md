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

Only the current round is created. Talus generates its native chunks when the
game pins the battlefield ring, and deployment waits for `whenRingLoaded()`.
Empty sky counts as ready without occupying a GPU layer. Saved terrain damage
is preserved by the native world lifecycle; scripts do not repaint the map.

Tanks start across a 3,072-pixel central area with 128-pixel edge insets. Maze
maps reserve a matching open deployment corridor. The full 12,800×1,280 map
remains playable and simulated as the camera follows each tank or shell.

## Simulation coverage

`Game/input.json` owns the native starting ring, confined camera bounds,
electrical window and engine budgets. The ring includes the full map, sky up
to Y −8,704 and a margin beyond the arena edges. `Scripts/lib/simulation.ts`
reapplies that policy before deploying or restoring a match. Camera travel and
zoom do not move the ring. Heat, air pressure and liquid run on resident chunk
tiles throughout it; electricity stays in the authored 3,072×1,280 window over
the central deployment area. Rendered weather crosses empty sky and becomes
real rain where it reaches matter.

New rounds wait for the whole ring to become ready before deploying tanks.
Rich maze strokes can take several minutes to prepare across the full map;
painted WFC terrain loads faster. The HUD shows ready and total chunk counts.

The project requests 3,584 chunk layers and 12 million particle slots. The
bootstrap WFC palette occupies about 8.2 million terrain pixels, leaving room
for weapons and debris. The engine estimates about 3.48 GiB of GPU allocations
and 549 MiB of particle CPU storage at these settings. These are allocation
estimates; renderer and effect working buffers need additional memory. They
are not a guarantee for every painted or maze-generated map. Native
budget pressure appears in the HUD; persistent exhaustion stops the match with
an explanation instead of leaving a turn waiting forever. Edit Engine Budgets
and reopen the project to apply changes.

`Game/arena-rules.json` supplies native projectile and loose-body edge rules.
Shots and wreckage are removed 128 pixels beyond the sides and bottom, or
8,192 pixels above the terrain. Those walls sit inside the simulated ring.
Tank bounds remain the original map rectangle and use the game's death rules.
Install these policies with `node tools/project.cjs ui` and
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
