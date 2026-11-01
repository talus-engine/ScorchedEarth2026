# Validation

Use Node.js 24 or newer and install dependencies with `npm ci`.
All authoring helpers and tests run in Node; no separate image or database
runtime is required.

With the configured project open in Talus, obtain the native declarations:

```sh
node tools/project.cjs types
npm run check
npm run audit
```

`npm test` runs the same test suite without the declaration/type check and does
not need a running editor. It includes file-sync conflict/refusal checks, bridge
and export contracts, shared CSS embedding, and WFC geometry/pixel equivalence.
The WFC builder is exercised in a temporary directory; tests never repaint the
native palette or overwrite the tracked bootstrap.

`TALUS_TYPES` can point directly at a generated `Scripts/talus.d.ts`. The behavior
suite loads the actual native CommonJS libraries in isolated VMs. It checks
payouts, finite stock, timing, CPU learning, camera interruption, residency,
terrain requests, supported deployment and save barriers. These doubles test
game policy; they do not prove GPU particle behavior.
Round-transition cases cover exactly-once requests, paid shopping, native
refusal, typed terrain settings, human choice and pause/save fences. Attachment
cases cover charge retention, stale poses, crossing triggers and held shots;
CPU recovery cases require actual changed positions before replanning.

For native solver and Rapier/WASM checks, set `TALUS_ENGINE_ROOT` to a built Talus
checkout with its dependencies installed:

```sh
TALUS_ENGINE_ROOT=/path/to/engine npm run test:native
```

The native tests cover 100 WFC seeds and artillery trajectories, fixed-speed
elevation, terrain envelopes, measured-impact correction and retained successful
solutions. They run without opening a profile or renderer.

After changing native data or presentation, check the actual editor/game: title,
setup, armory, HUD, pause and settings at the intended viewport size. Start a
CPU-only match and observe deployment, dialogue, a real shot and the next turn.
Use a fresh match when validating template edits: a saved world retains its own
authored file snapshot.
Verify the editor guide remains hidden in play. Save/export captures native art
and bindings that file-only tests cannot inspect.

`tools/audit.cjs` checks the maintained tree, module imports, configuration/file
references, synchronized shared styles, source naming and guide visibility. It
also opens a temporary read-only copy of the exported archive, checks SQLite
integrity, compares every authored file and the native UI policy, verifies the
Title world binding, and rejects installed player data.
Generated working reports stay under ignored `.build/`.

## Engine compatibility

Check the running bundle’s `Contents/Resources/publisher/release.json` before
validating or publishing. A local build and an installed application can contain
different engine builds. Refresh native declarations from that same build.

Use an empty temporary profile when checking archive imports; imports merge
shared library records as well as project data. Keep the existing profile closed
and use the temporary profile’s bridge token. Import the complete three-world
archive so the Title scene and project-owned terrain resources are included.

Exercise root → Title → root editor switching. Wait until `worldId` and
`templateId` identify the requested world and `engineBooted` is true before
reading or editing it. Root authoring helpers must refuse a child world or an
unfinished switch. Initial boot readiness covers the screen and its padding;
the rest of the terrain ring streams afterward. Inspect generation progress
and probe residency separately from the loading screen.

Zoom is canvas pixels per world pixel. The game uses 1–2, so a 1600-pixel-wide
canvas shows 1600 world pixels between turns and 800 during a close-up. Verify
`talus.camera.view.viewport` as well as its numeric zoom, and wait for native
tracking readiness before speech. A camera viewport is not a guarantee that
every visible particle or entity belongs to the live simulation ring.

Check the animated Title scene, typed roster submission, a CPU shot through
impact and the next turn, and one decorated maze with its background and props.
Keep semantic and living strokes in this check. Capture errors and screenshots
under `.build/`, then export and audit the complete template with the same
bundle and profile. Close the test app and remove its disposable profile after
export; retain authored source and the portable archive.
