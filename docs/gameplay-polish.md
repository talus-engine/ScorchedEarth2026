# Battle presentation, CPU exploration and sky supplies

Implemented and installed into the Indigo editor project on 2026-10-26. Unsigned 0.3.1 now contains these updates; the app was not launched during this publication. No new engine capability is required for these four changes.

- **HUD:** two compact bars, horizontal roster, wallet popups beside the wallet, and expandable Equipment / Intel panels. Existing aim, power, fire, pass, target, defense and armory actions remain. Native menu navigation already supports the details/summary controls.
- **Transitions:** broad parallel pixel treads, animated belt links and square dirt spray. The assembly drives across the screen. Existing one-second turn introduction/end-score timing and longer round/victory cards are preserved.
- **CPU exploration:** each faction has a seeded curiosity probability, duration and preference. Lucky wanders; Mole and Domino favor supplies; Kiloton and Faultline favor higher ground. Short native controller drives reserve three seconds for firing, stop on cancellation, and recheck nearby ground, walls, map edges and opponents. CPUs buy drive fuel when affordable. Fuel use still comes exclusively from native telemetry. Terrain probes are local estimates, not predictions of evolving air or distant simulation.
- **Supplies:** 70% chance at round opening, 18% at subsequent turn boundaries, up to four unclaimed crates. The dedicated saved RNG is separate from terrain, dialogue, AI and death effects. Ammo, fuel, jet fuel, batteries, digging supplies and parachutes arrive in real wood/iron rigid bodies. Combat input and the turn clock wait while the camera scrolls to the drop and follows its fall; particle/body simulation continues. Observation ends after landing or six simulation seconds, then the camera returns to the next tank. Nearby live tanks collect supplies; a single installed write records both inventory and the claim, protecting against old-save duplication. Destroyed/out-of-bounds crates are lost.

Configuration: `world/Game/supply-drops.json`, each strategy's `exploration` in `world/Game/personas.json`. No changes to the title artwork, world raster painting or tank rigs.

## Evidence and remaining acceptance

- Strict TypeScript check against the captured source API declarations: zero errors.
- `node tools/check_gameplay_polish.cjs`: exploratory motion, cliff/wall/edge refusal, cancellation stop, native fuel authority, independent RNG, body arrival/camera following, turn-clock hold, residency, bounded waiting/counts and duplicate-claim protection pass. These are policy checks with native contract doubles.
- Retained CPU purchase/planning/inventory and safe-exit checks pass.
- Seven [offline layout captures](evidence/gameplay-polish/layout.json) cover CPU/human HUD, opened equipment with final control focused, and tread transition at 1440×868 and 960×540. Images visually inspected; no controls clip the viewport. Bars occupy about 150px/142px combined respectively. These are HTML fixtures using the engine's pixel font, not native runtime screenshots.
- [Public API install receipt](evidence/gameplay-polish/install.json): all five source files matched their prior Git versions before writing, all new content read back exactly, root saved, editor script reports no faults. No running-player files or accounts changed.

Still to do at the next coordinated quiet window: observe a real exploratory drive and crate landing/pickup in a CPU match, verify native controller navigation through the compact HUD, then include this project snapshot in the next unsigned package with the engine's cold-title/loading fix. Unsigned 0.3.1 contains these changes on engine2585; native gameplay validation and the engine fixes remain pending.

## Unsigned 0.3.1 delivery

[Build receipt](evidence/gameplay-polish/unsigned-build.json): macOS arm64 app, DMG and ZIP completed using installed engine2585. Snapshot/DMG/ZIP hashes and the six changed gameplay/title source files verified; deep/strict ad-hoc signature verification passes. No notarization and no runtime acceptance claimed. Native publishing used user-assisted folder/Publish buttons. Candidate2587 startup fixes and the later serialization fix are not included.

The engine [README publishing section](../../foxtrot/README.md#command-line-publishing) still documents CLI publishing. The installed CLI's `--help` was verified on2585; the wizard invokes this same entry point. A repeat build of an existing publish-stamped snapshot can run without opening the app:

```sh
ELECTRON_RUN_AS_NODE=1 /Applications/Talus.app/Contents/MacOS/Talus \
  /Applications/Talus.app/Contents/Resources/publisher/tools/publish/cli.mjs \
  --in /absolute/path/to/source.talus \
  --out /absolute/path/to/an/existing/output-folder \
  --runtime /Applications/Talus.app/Contents/Resources/publisher/runtime \
  --toolchain /Applications/Talus.app/Contents/Resources/publisher/release.json \
  --events
```

Use an output folder without that version's package; the CLI refuses overwrites. The snapshot and bundled runtime must be from the same engine release. Fresh snapshots currently require the editor export route. Tony explicitly requested a supported unmounted-database/profile→`.talus` method; the full headless export contract and acceptance requirements were sent to ENGINE in `AGENT_CHAT.md`.
