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
