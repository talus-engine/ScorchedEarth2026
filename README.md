# Scorched Terra — Indigo artillery game

**2026-10-25 checkpoint:** the user requested minimum confirmation and a commit. The broader theme/series/controller matrix is deferred. Engine 2572 is installed; ENGINE reports the changed Website subpath Continue/audio check passed. The focused distant-restore game replay remains pending. See the [commit checkpoint](docs/m12-commit-checkpoint.md) for the original scope and updated handoff.

**M13 tank art:** all 36 enabled weapons now have distinct tiny `gpt-image-2` sprites installed in Talus. The new chassis/jetpack art and native cosmetic rig builder are prepared. Animated tracks/wheels and folding jet pods await the [M13 native fixes](docs/engine-m13-patch-prompt.md); the rig is not yet installed. Tracks will remain cosmetic and use native movement-speed animation. See [M13 progress and remaining work](docs/m13-tank-piece.md).

**M12 game integration is installed; broader native acceptance is deferred.** Full pinned preset selection, dynamic noise brushes, native textured structures, safer deployment and pause/save flow are integrated. The latest game changes add CPU inventory/escape policy, a longer death-effect view, and the repaired square [WFC artist template](docs/wfc-artist-template.md). Ten authored landscape stories are activated. Fresh A1 now completes every generation pass, all five mechanisms and healthy tank deployment with the combined trestle, growth-size and detail-material corrections. The inspected central view shows improved plant scale/detail. Physical chains, remaining themes and broader visual acceptance remain open; the owned Website copy retains its earlier script. Older partial saves retain their original generation policies. See [current game validation](docs/m12-game-validation.md), [the task list](docs/post-m11-plan.md), and [M12 engine work](docs/engine-m12-patch-prompt.md).

A Scorched Earth style game authored in Talus through its public HTTP interface. **M9 is closed at the delivered scope on Talus 0.0.2530.** It adds a larger arsenal, three-second shot/death presentations, native world text, posture and mobility controls, optional brush-generated terrain, generated parallax and occasional rain. See the [M9 closeout](docs/m9-closeout.md), [equipment coverage](docs/m9-equipment.md), [research](docs/m9-research.md), and [remaining backlog](docs/backlog.md).

The catalogue accounts for all 33 weapons and 15 accessories from Scorched Earth 1.5, plus genre additions. **36 weapons and 12 utilities are enabled; 12 entries remain disabled in the backlog.** The new Free Riot Charge is unlimited, very small and non-damaging; it earns no combat cash. Nuke, MIRV, Death’s Head, napalm, rollers, dirt payloads, plasma, machine gun, flamethrower, shotgun, grenades and homing rockets join the existing arsenal. Riot Charge/Blast convert eligible terrain to SMOKE, Dirt Charge deposits DIRT, and Earth Disrupter fractures native terrain. Jet fuel, ground fuel, parachutes, burrowing, shields, magnetic defenses, repairs and cash/stock persistence are available. Auto Defense activates stocked fields; Lazy Boy consumes one charge only when the native aiming graph applies a solution.

Names, scores, cash, stock and shuffled dialogue decks persist between rounds. There are 500 shooting and 500 death phrases, with mixed capitalization. Native damage numbers rise and fade. Camera positioning and a minimum three-second presentation precede firing/death effects. **Dialogue is independent native world text at 36 CSS pixels with wrapping; tank names and health bars stay separate.** Native pose holds retain the physical hull during last words. The installed game policy then watches the released death effect for another 2.5 simulation seconds before moving to the next presentation.

## Playing

Publishing is not required for local play. In Talus, use **File → Play from Title**, then **New game → Deploy tanks → Begin match**. M11 engine acceptance covers this visible route, wider controller settings and in-app installer publishing. CPUs shop automatically after deployment; the opening armory waits for Begin match. The separately published app still contains its last exported snapshot until a new package is built.

Start Scorched Terra, choose 2–16 tanks, enter one name per line, and supply a seed or leave it blank for randomness. Advanced settings expose the seeded random pool, recipe weights and native parameters: **Terra Reach · WFC**, **Brush Reach**, five zone landscapes (including Verdant Reach) and four maze landscapes. All occupy a 50×5-tile-equivalent area with a solid-stone bottom row. Brush Reach requests native semantic/noise recipes, compatible neural detail passes and bounded selection across all captured living presets. Verdant Reach layers semantic/neural/living brushes over materialized native zones. Every zone recipe has a gently varying central combat basin and open sky. Brush/hybrid generation runs all detail and living sites, then uses light, irregular EMPTY-heavy semantic brushes on foreground matter above the original ground. It preserves living bodies and the bottom stone row; openings remain imperfect. Seeded pure-noise Spin and Size LFO are integrated. Story macro terrain, reservoirs and physical assemblies remain under visual/native acceptance; their activation is tracked in the current validation document.

The opening armory shows each pilot’s persistent wallet and supplies. New names get $600 once. CPUs buy automatically. Choose **Begin match** directly in the armory. After the result, open **Armory** to shop and deploy the next round. Opening the title does not spend cash or start combat.

- **A / D:** move the current tank.
- **R / Flip upright:** ask the native controller to right the current tank; movement and firing stay available.
- **Left / Right:** change weapon angle.
- **Up / Down:** change power.
- **W:** hold jet thrust while purchased fuel remains.
- **Q / E:** burrow left/right using purchased digger fuel.
- **Space:** fire, following the three-second presentation.
- **Enter:** pass. An expired turn timer also advances play.

The HUD selects owned guns, including the unlimited Free Riot Charge, and activates repairs, fields and Lazy Boy. Humans share the keyboard. Validation uses CPU-only games. After two failed CPU passes, bounded movement/escape attempts run; if no legal action exists, a visible blocked pause offers retry or save/exit. The existing game event log records purchases, considered weapons, refusals, casts and stock changes.

Tanks spawn upright and make a best-effort native righting attempt for at most one simulation second. A blocked or tilted tank still deploys; the game does not level terrain or require a flat posture. R / Flip upright remains voluntary, and CPUs choose the same action when tilted and continue aiming if it is blocked. Slopes, rolling and ongoing ground motion do not prevent a turn or shot.

Tanks start inside a central 960-pixel strip. The updated camera policy keeps 25% default zoom, scrolls smoothly between tanks and permits offscreen flight and normal tank parking/restoration. The full generated map becomes the play boundary. This policy is installed using M12 E52/E53; the all-survivors frame is removed. Native game motion and shot/death timing have passed a bounded check; actual game-shooter parking remains an acceptance item. Native independent flight regions handle remote shells. Complete volleys and material jobs resolve before a bounded one-to-three-second settle wait. Powders can keep moving. Out-of-bounds tanks die; one remaining survivor wins after outstanding death effects and the aftermath wait.

## Backlog

Underground projectiles, beams and per-shot accessories remain disabled. Broader neural/living acceptance and the retained hard-seating investigation remain tracked separately; E45 repair, E48/E49 fixes and E50 full-footprint WFC artist saving have landed. Native world text, voluntary righting, death holds, fall braking and ground-fuel accounting are implemented; the horizontal-parallax renderer fix is included. See the [current backlog](docs/backlog.md). The original [engine prompt](docs/engine-m9-patch-prompt.md) is historical and includes requirements since completed or revised.

Five death effects are enabled, including a physically verified large FIRE brush. Nine transmutation/material/emitter variants remain disabled. Native and game save barriers protect unsupported mid-flight/job saves; completed-match persistence is validated. Closing M9 does not mark the backlog implemented.

## Authoring and verification

Runtime source is in `world/`; generated IDs and editable assets are in `assets/`. `fixtures/m2/` through `fixtures/m8/` preserve historical milestones. M9 uses match schema 9 and requires fresh games; older saves retain their content.

Use [the Talus mount ↔ Git workflow](docs/talus-git-flow.md) to capture and install reviewed files through the public API. Native template/device changes have bounded M12 installers and retained readback evidence. Historical milestone installers can overwrite later content; do not rerun them as a general update command.

Current local checks include:

```sh
node tools/check_m12_generation.cjs
node tools/check_m12_macro.cjs
node tools/check_m12_mechanisms.cjs
node tools/check_m12_trestles.cjs
node tools/check_m12_growth_scale.cjs
node tools/check_m12_placement.cjs
node tools/check_m12_deployment.cjs
node tools/check_m12_safe_exit.cjs
node tools/check_m12_cpu_inventory.cjs
node tools/check_m12_escape.cjs
node tools/check_m9.cjs
```

Strict TypeScript uses the installed engine's generated declarations. Native tests need fresh diagnostic names and an exact account baseline; restore only that run's baseline and preserve failure saves. No E2E profile clone is needed. [M12 validation](docs/m12-game-validation.md) separates local checks, installed changes, observed defects and remaining acceptance.

Historical results: [M8 native release acceptance](docs/evidence/m8-engine-2498/acceptance.json), [M8 game/economy](docs/m8-results.md), [M3](docs/m3-results.md), [M2](docs/m2-results.md), [M1](docs/m1-results.md), and the [engine work log](docs/engine-work.md).

Aim uses the world horizon: 90° is straight up even on a tilted hull. The engine stabilizes the turret direction; players and CPUs do not subtract the tank angle.

Current plans: [post-M11 game work](docs/post-m11-plan.md), [M12 engine prompt](docs/engine-m12-patch-prompt.md). Engine and game agents coordinate exclusive UI/session ownership through the gitignored root `AGENT_CHAT.md`. The accepted native isolated scene now drives the original title. E54 growth admission is accepted on 2571; game mechanism replay, full story/CPU acceptance, Website/browser validation and final packages remain open.

The project-owned snapshot in `world/Game/Presets/` retains 166 noise presets, 97 semantic recipes, 18 growth presets, four neural models with weights and 37 vectors. Catalog `procedural-m11` carries 1,188 scoped resources, including 642 image payloads. Full selection is integrated; copying and preflighting a preset does not prove its output in every context.
