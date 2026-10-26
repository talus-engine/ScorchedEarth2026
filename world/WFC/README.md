# Paint the terrain palette

Each source tile is a square 256×256 pixels (4×4 native chunks). The connector
labels and their rectangles are editing aids, not tile outlines.

Surface origins occupy chunk Y8, X0 through X68. Foundation origins occupy Y12
at X0, X4, X8 and X12. Sky is at (0,0); bedrock is at (0,16). Consult
`template.json` for individual `originAnchor` coordinates and `artist-sheet.svg`
for the palette reference. The live layout can omit or relocate scaffold slots.

The small gate markers bracket the filled bridge span. North/south fractions
run left to right; east/west fractions run top to bottom. h64, h128 and h192 begin
ground at those pixel heights. Preserve the eight-pixel silhouette collars and
two-pixel material rims so neighboring tiles connect. Their rims use the same
noise samples. Interiors are free to paint. Keep the bedrock row solid stone.

Native painted origins are the source of truth. `bootstrap.svg` is a starting
palette produced by the repository's `tools/build_wfc_template.cjs`; importing
it replaces painted artwork. It is not needed when editing the existing art.

Save in Talus, then export the complete project to capture native pixels,
connectors and layout. A copy of the file mount alone cannot capture them.
