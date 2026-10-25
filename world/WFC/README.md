# Terra Reach artist scaffold

Indigo contains 250 WFC anchors on a 50×5 grid. Each tile is 256×256px (4×4 chunks). `template.json` lists every source tile, origin coordinate, connector and native gate pair. `artist-sheet.svg` is a visual reference, not a matter import.

Paint reusable art only at the 24 origins listed in `template.json` (`originAnchor`, in chunks). The other 226 positions are remix slots. All surface origins are at chunk Y8, from X0 through 68. Foundation origins are (0,12),(4,12),(8,12),(12,12); sky is (0,0), bedrock (0,16).

Gate marks bracket filled ground. h64/h128/h192 mean the ground begins 64/128/192 pixels down that face. North/south fractions run left-to-right; west/east run top-to-bottom. Sky is entirely empty, earth entirely filled, stone entirely STONE. Keep the 8px terrain collars and outer 2px material rims intact. Repaint interiors freely after the native save fix is accepted. Preserve the solid bottom row.

The seed selects ridge/bowl silhouettes and earth textures inside fixed connecting heights. The editor's large socket-label rectangles are not tile boundaries; the tile footprint always spans4×4 grid squares.

**E50 is required before a full artist pass:** Talus 0.0.2561 saves edits in the top-left origin chunk to the reusable tile, but other chunks can become local overrides. The engine agent is fixing full-footprint origin autosave. Verify that fix before painting, including save/reopen and a new seeded game.

`bootstrap.svg` is the initial 24-tile element-indexed import, using an exported native noise swatch. Do not reimport it over later artist changes. Native tile art resides in the database, so also export the complete Talus project after editing; a file-mount sync alone does not capture new palette pixels.

Full handoff, source-coordinate table and retained evidence: game repository `docs/wfc-artist-template.md`. The old Mixed Reach palette was preserved. Native metadata repair checkpoint: `snap_90863e52-32f7-4bde-a2f2-2ae7c948c2e2`.
