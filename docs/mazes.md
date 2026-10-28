# Procedural maze chunks

Maze terrain belongs to the native streamed chunk generator. Tile mappings,
edge strokes and entity rules are inputs to that generator. They are not
editor-painted chunks or a script that visits the whole map before play.
The seed determines maze topology and native noise. Destruction belongs to the
saved game instance and must survive unloading a chunk.

The four authored combinations are in
[the maze catalog](../world/Game/Mazes/catalog.json):

| Maze | Foreground / background tile presets | Brush character |
| --- | --- | --- |
| Bunker Grid | Atomic Realm Industrial / Industrial Background | Concrete texture, neural factory seams, ruined masonry, ivy |
| Rat Run | Atomic Realm Mine / Mine Background | Wood texture, neural dungeon seams, sewer ledges, roots |
| Cavern War | Atomic Realm Mine B / Mine B Background | Dirt texture, neural cliff seams, rubble ledges, living bramble |
| Terrace Siege | Atomic Realm Industrial D / Industrial D Background | Grass texture, neural hills, grassy ledges, meadow growth |

Foreground tile art carries physical material on the world particle plane.
Background-specific tile art paints the `background` raster plane, including
the maze interiors. It has no collision. Tile and pattern strokes use the
foreground preset for trim; they do not substitute background art for walls.
Every recipe also includes a small sand edge so blasts can release loose grit.

Noise strokes use authored variations of native Spin, Size LFO amplitude and
frequency. Their paths and noise vary with maze geometry and seed. Neural
strokes include the actual trained model bytes and an anchor that belongs to
that model. Semantic and living strokes include their complete native presets.
No external image generation runs when a round starts.

Physical scenery is made of native entity templates: wood crates, concrete
barriers, rusted girders, rubble blocks, ruined outposts and lamps. Their records
are captured under `assets/native/entities`; their IDs are in
[the scenery list](../world/Game/Mazes/entities.json). Maze entity and torch
rules own placement and persistence. These objects are not terrain stamps.
The same templates can be used by zone spawn settings.

Maze options
-----------

| Native option group | Available controls | Game choice |
| --- | --- | --- |
| Topology | DFS, Prim, Kruskal, Wilson, recursive division, braid, cellular cave, drunkard cave, BSP dungeon, housing block, platform | Four distinct topologies; WFC remains a separate painted source |
| Geometry | Cell size, entrances, entrance width, algorithm-specific room/gap/fill/braid/shaft controls | Existing advanced controls and open tank deployment corridor |
| Cave smoothing | Wall bias, edge wobble/scale, cleanup threshold/passes | Available for cave tuning; does not replace the maze source |
| Material mappings | Wall, floor, wall background, door and secret; none/element/noise/tile on particle or raster layers | Solid tiled walls, empty collision floor cells, decorative raster background |
| Edge strokes | North/south/east/west, stacking order; element/noise/pattern/tile/grow/semantic/neural | All seven sources represented in each recipe |
| Brush geometry | Shape, size, rotation, rotation step, spacing, Size LFO amplitude/frequency | Thin trim, varied noise tips, wider neural/semantic seams, sparse small growth tips |
| Entities | Template, probability, centroid/noise filters, footprint, boundary avoidance, count limit; optional graph/faction/loadout/flags | Destructible scenery; up to 48 placements per maze |
| Torches | Weighted entity types, wall/ceiling/floor/any, spacing, probability, position ratio, jitter and limit | Native floor lamps; up to 24 per maze |
| Doors and keys | Sliding/swinging doors, useful/decorative placement, locks, spacing, secrets, key progression | Disabled: artillery rounds do not require puzzle traversal |

The 256-pixel stone foundation and foreground deployment clearances remain in
the round recipe. Clearance must leave raster backgrounds intact and exclude
prop/torch placements from tank space. Lighting remains daylight.

Authoring and activation
------------------------

Edit [themes.json](../assets/mazes/themes.json), then run
`node tools/mazes.cjs build` to assemble the self-contained native catalog.
[tiles.json](../assets/mazes/tiles.json) records the selected native tile presets,
their source paths, tile dimensions and layer IDs. Brush sources are the
project-owned files in `world/Game/Presets`.

With Indigo open in the editor, `node tools/mazes.cjs props` regenerates the six
scenery templates and captures their records. Their pixel/material definitions
live in `tools/lib/maze-props.cjs`; use the native entity editor for detailed art.
Rebuild the maze catalog after changing template IDs.

The active new-round file is `world/Game/terrain-recipes.json`. The rich maze
catalog is authored but not activated: the installed round-source interface
must accept native layered mappings, rich strokes and persistent entity rules
before these entries replace its maze entries. The native layout maze evaluator
already supports those features. Activation must use that evaluator directly,
preserve background planes, and verify one seeded chunk reload without duplicate
props. Do not substitute a whole-map painting pass or mutate the shared WFC
authoring layout to bypass a round-source limitation.

Zone chunks are a separate procedural source to expand later. Hand-painted WFC
tiles remain the author's canvas.
