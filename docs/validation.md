# Validation

Install Node dependencies with `npm install`. Python authoring tools require
Python 3 and Pillow (`python3 -m pip install -r requirements.txt`).

With the configured project open in Talus, obtain the native declarations:

```sh
python3 tools/project.py types
npm run check
python3 -m unittest discover -s tests -p 'test_sync.py'
python3 tests/test_wfc.py
npm run audit
```

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

`tools/audit.py` checks the maintained tree, module imports, configuration/file
references, synchronized shared styles, source naming and guide visibility. It
also opens a temporary read-only copy of the exported archive, checks SQLite
integrity, compares every authored file and the native UI policy, verifies the
Title world binding, and rejects installed player data.
Generated working reports stay under ignored `.build/`.
