# Authoring and source control

Download **Scorched Earth 2026** from Talus's Featured Templates, or manually
import the published archive, and open its root editor.
The archive contains the complete project: terrain, entity records, scoped
resource bytes, files and the Title child world. `project.json` records the root
and child IDs. When adopting a duplicated project, update both IDs in
`project.json` from the native project-world list. `TALUS_PROJECT_ID` temporarily
overrides the root ID for bridge commands; archive validation uses the tracked
project identities.

The root world is the battlefield and library owner. The `Title` child is bound
to `menu:title`; the title menu displays it full-screen behind its controls.
The root `Menus/Scenes/title.json` and `Game/title-logo-pattern.js` define the
entry-seeded logo and decorative planes. Use the project world switcher to edit
Title. Its geometry and scene binding travel in the complete archive.

## Files and native assets

`world/` mirrors authored root-world files. Child worlds and rasterization samples
are excluded from this root file sync and preserved by complete project exports. Talus exposes its file mount through
`engine_describe_context`; the bridge helper reads the local token privately.
Use `TALUS_BRIDGE_URL` and `TALUS_TOKEN_FILE` for another bridge location.
Before reading declarations, capturing files or installing records, the tools
require the configured root world to be fully loaded in editor mode. World
switches can finish without reloading the page; the requested template alone
does not identify the active world. File operations also require its live mount.

A symlink records only a target path in Git. Capture real files instead:

```sh
node tools/talus_sync.cjs status
node tools/talus_sync.cjs capture
# Edit files in world/, then inspect the diff.
node tools/talus_sync.cjs install
```

The first identical capture establishes `.build/sync/baseline.json`. Conflicting
edits or a missing side refuse; resolve them explicitly. The sync tool does not
automatically delete live files. Do not point it at another project's mount.
Binary imports use native asset tools or `talus.files.writeBytes`.

Terrain, WFC pixels, joints and native records are not fully represented by the
file mount. Save in Talus and export the complete project after editing them.
`tools/records.cjs capture` reads the configured roster, weapon/mod and creature
templates, their animation libraries, and biome lighting into `assets/native/`.
`install` validates changes,
saves through native authoring APIs and checks entity readback. Import the full
archive before installing these records; they use durable native IDs.

## Common edits

- Rules, turn length and deployment: `Game/arena.json`, `Scripts/lib/menus.ts`.
- Cash, prices, ammunition and weapons: `Game/shop.json`.
- CPU personas, factions, tactics and voices: `Game/personas.json` and
  `Game/persona-voices.json`.
- Terrain families and parameters: `Game/terrain-recipes.json`.
  Editor brush resources: `Game/Presets/`.
- Menus: `Menus/*.html`; shared styling: `Menus/arcade.css`. Run
  `node tools/menus.cjs` to embed the shared theme into self-contained menus.
- Title material stripes: `Game/title-logo-pattern.js`; source art:
  `assets/art/title-logo.png`. The pattern changes material indices only.
- Native tank parts and weapon art: `assets/native/`, `assets/sprites/` and the
  engine's template/animation editors.

After syncing an edited `Game/input.json`, run `node tools/project.cjs ui` to install its
bindings and UI policy through the native `gameUi` record. The game selects
`quitSavePolicy: discard` so Quit and app close never wait for a game save.
The separate Save & title command explicitly requests a required save.

Use the native **Menu Editor** to preview an HTML file beside its source. Open
it from the editor tools or the IDE's preview action. Set the viewport and mock
model, then use private events or blackboards to exercise reactive bindings.
Preview purchases, rebindings and game actions do not touch the live world or
player accounts. Save source explicitly; reusable scenarios can be saved under
`Menus/Previews/`. Previewing a menu does not replace a real gameplay check.

`Game/Presets/` holds complete editable source records. After changing them, run
`node tools/project.cjs catalog`. This captures native dependencies into a
project-owned immutable catalog and updates the configured hash. Existing games
retain their own pinned resources and generation progress.

The editor-only guide is defined by `world/Guide.md` and `Game/guide.json`.
`Scripts/guide.ts` handles its read-only links. Install its annotation with
`node tools/project.cjs guide` after installing the files.
