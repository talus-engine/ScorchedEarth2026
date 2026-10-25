# M10 — Scorched Terra: arcade overhaul

Status: **execution authorized and in progress.** This is the ordered task list requested after [M9 closeout](m9-closeout.md). Tasks 01–07 are the new priorities; the previous seven game-side tasks follow as 08–14. Existing engine carryover remains in the [backlog](backlog.md). Record newly demonstrated native gaps in the M10 engine update prompt.

The game becomes **Scorched Terra**. Indigo remains its world/template and persistence identity: changing the displayed title must preserve names, scores, cash, inventory and saves.

## Current checkpoint — 0.0.2535, engine follow-up accepted

E25–E35 landed, including scoped game integration. The installed binary hash and the installed script, terrain catalog, setup and shop files match the engine handoff/workspace. [Current results](m10-followup-results.md) and the [engine validation report](../../foxtrot/docs/m10-followup-validation.md) supersede the historical first-slice table below. Native aiming clears the demonstrated valley; zone sources use a continuous extent; native Back releases shop state; Advanced submits typed, scoped generation requests; native Options/Controls retain the game theme and backdrop. Zone random weights are restored. Wallet-only cash and the three-second shot/death sequence remain intact.

**Accepted aiming policy (2026-10-24): best estimate, not future-air simulation.** Use the native planner's current-geometry survey and nominal wind/damping model. `evolving-air-fields-not-predicted` is informational and does not reject an otherwise usable plan or block the milestone. Moving bodies, future pressure wakes, falling terrain and MIRV child impacts are not promised in advance. Known obstructions, unavailable geometry and unsupported physics still require explicit handling; “best guess” does not mean ignoring a wall or treating missing cells as empty. Do not reopen an engine patch merely because evolving air changes the eventual impact.

The completion pass implements bounded impact memory and persona-dependent error. Nearby observed misses bias later survey points for the same weapon/target/context; corrected proposals still pass through the native planner, and stale or distant observations are discarded. This is a limited correction policy, not a learned model of future air or guaranteed hit prediction. Broader difficulty calibration remains acceptance work.

Remaining game acceptance: full controller-only nested-menu/screen audit, larger-roster readability and bounded 2/4/8/16 CPU play across landscape families. Implementation and acceptance for the additional transition variants and tasks 08–14 are now tracked in the completion pass below. Full game-side M10 is not declared complete by the engine report alone.

## Game completion pass — 2026-10-24

The remaining-work execution is tracked in [m10-completion.md](m10-completion.md). Persona purchasing/native surveys/impact memory, controller combat bindings and explicit targets, best-of series/results, biome groups, arcade variants/comparisons and native audio are implemented. The four-CPU procedural-brush match completed on turn 8. Bounded 2/4/8/16-player and native menu acceptance are recorded separately; E36 navigation now passes the 2539 integration check; E37 layout still blocks completion of the native controller audit; the original unchecked items below must not be read as all unimplemented or as all accepted. Native carryover in the backlog stays disabled.

## Historical first-slice checkpoint

The first game-side slice is installed. See [M10 results](m10-results.md) for evidence and limits and the [M10 engine update prompt](engine-m10-patch-prompt.md) for native blockers.

| Task | Current state |
|---|---|
| 01 transitions | Opening, incoming-player, outgoing-score and victory/draw cards implemented; one natural four-turn CPU match completed all ten cards. Existing three-second shot/death sequence preserved. Additional visual variants remain polish. |
| 02 arcade menus | Shared pixel font/palette/hard borders installed across game-authored title, setup, Advanced, HUD, shop, pause, help and credits. Built-in engine options/load surfaces remain E26. |
| 03 landscapes | Existing WFC/brush controls moved under Advanced. Runtime native zone/maze generation is blocked on E27; no fake selectable modes or ineffective controls installed. |
| 04 title | AI logo generated, saved and installed; authored title/help/credits exist. Pre-world navigation/context acceptance needs E30. |
| 05 navigation | Native generic menu focus/controller flow needs E26. Existing mouse controls continue working. |
| 06 number effects | Native cash labels, two-decimal formatting and exact reward aggregation implemented. Rotation/stretch/fountain styles and matching native damage styling need E25. |
| 07 audit | Live title preview, setup, Advanced, HUD, armory, transitions and results inspected; full menu/controller/built-in surface audit remains open. |
| 09 personas | Five native faction identities, five skill/strategy profiles, 1,000 distinct staged voice lines and sixteen physical color-only variants authored. Native voice-type and encounter-allegiance contracts E28/E29 block persona behavior/voice activation. |

Remaining checklist items describe the final intended scope; this checkpoint does not mark all of M10 complete. Tasks 08–14 remain after the arcade priorities, with persona content prepared ahead of its native integration.

## Ordered task list

### 01 — Animated arcade transitions

- [x] Build reusable match-opening, outgoing-turn, incoming-player and match-ending sequences, with several cosmetic variants.
- [x] Incoming-player card: approximately **1 second**, prominently showing the player's name and color. Start their playable turn timer after the card completes.
- [x] Outgoing-turn card: approximately **1 second**, showing the completed **turn number and score**, outgoing player and score change. Label cash separately from points.
- [x] Cover firing, passing, timeout and death during one's turn exactly once. A shot still ends player control immediately; show its score card after the volley, queued deaths and bounded aftermath have produced the result.
- [x] Preserve camera → tank dialogue → minimum **3 seconds** → shot/death effect. Cards must not shorten dialogue, interrupt death queues or conceal shots. Persistent chaos effects continue.
- [x] Use the presentation clock for animation, explicit input ownership, and safe cancellation on pause, menu changes, reload and session end. Animation callbacks must not duplicate turns or rewards.

Proposed scenes:

| Occasion | Scene | Timing/design |
|---|---|---|
| Match opening | **Terra ignition** | About 2.5 seconds: pixel mountains split, a shell crosses the horizon, the logo slams into a double frame, then seed/round and `BATTLE STATIONS` appear. Skippable after the initial reveal. |
| Incoming player | **Command cartridge** | 120 ms shutter opening, 650 ms readable name hold, 230 ms exit. Tank silhouette and chevrons streak behind the name. |
| Incoming-player variant | **Target acquired** | Radar brackets snap around the player's name; a stepped shadow kicks into place. Same one-second budget. |
| Outgoing turn | **Score impact** | `TURN 12 COMPLETE` punches into a striped frame; score rolls quickly to its final value, then holds. Same one-second budget, mostly reserved for reading. |
| Outgoing-turn variant | **After-action receipt** | A pixel score strip ejects from a mechanical frame; player, turn, points and cash gained occupy distinct rows. |
| Match ending | **Victory overdrive** | About 3 seconds: winning tank silhouette on a rising podium, pixel shell casings/confetti, champion name and final standings. Continue leads to the armory. |
| Draw | **Mutually assured nonsense** | A scorched frame, empty podium and `NO SURVIVORS`; score remains readable. |

Use layered pixel typography, stepped borders, hard offset shadows, restrained scanlines and brief color sweeps. Animate decoration around a mostly stationary reading area. Evaluate a native shader pass for distortion/wipes, first confirming that it affects the intended UI layer. CSS animation in authored menus is supported; missing generic presentation capabilities belong in the engine.

### 02 — One arcade style for every menu

- [x] Establish shared colors, spacing, borders, focus treatment and typography; apply them to setup, HUD, shop and all other player-facing screens.
- [x] Use the bundled **VCR OSD Mono** font at readable sizes, pixel-aligned positioning, crisp rectangular/double borders and hard shadows. Replace rounded cards, soft shadows and default browser widgets.
- [x] Starting palette: midnight `#10102A`, black `#080810`, cream `#FFF1C1`, cyan `#35D9FF`, magenta `#FF4FA3`, gold `#FFD447`, orange `#FF783C`, mint `#70F8A0`. Give selection, damage, money, warning and disabled states consistent roles.
- [ ] Restyle fields, selectors, lists, scrollbars, tabs, meters, errors, tooltips and disabled/empty states—not only outer panels.
- [x] Preserve entered/mixed case for names and phrases; reserve all caps for selected headings/callouts. Keep tank dialogue independent of nameplates and at least as large as the current 36 CSS-pixel text.
- [x] Provide reduced motion and avoid persistent flicker. Scores and instructions remain readable during animation.

### 03 — Native zone and maze landscapes, plus Advanced

- [x] Add **zone** and **maze** to the seeded random generation pool alongside WFC and brush terrain. Use actual native zone/maze definitions and layout tile types, rather than scripted approximations.
- [x] Make random generation the normal launch flow. Put generation-family weights/overrides under **Advanced** in the game setup panel, retaining reproducible WFC/brush configurations. **No top-level Zone/Maze buttons or choices.**
- [x] Author zone presets: **Dune sea** (sand over mixed soil), **Shattered highlands** (ridged stone/earth), **Bramble badlands** (living growth over rolling terrain), and **Crater country** (basins and broken ridgelines).
- [x] Author maze presets using native algorithms: **Bunker grid** (recursive division), **Rat run** (braid), **Cavern war** (cellular cave), and **Terrace siege** (platform). Adapt for side-view artillery with connected routes, firing lanes and hull clearance. Disable puzzle locks/keys unless supported by gameplay.
- [ ] Expose generation/preset weights, terrain amplitude/frequency, material mix, zone sizes/blends, maze cell/corridor/wall sizes, branch/loop density where supported, cave openness, brush sizes/density, and living/neural budgets. Show relevant controls, validate native limits, and provide defaults/reset and a reproducible configuration summary.
- [x] Record resolved seed, family/preset, generation version and effective parameters. Separate terrain, AI, phrase and cosmetic random streams. Resuming a save must not regenerate damaged terrain.
- [ ] Preserve the **50×5 tile-equivalent world**, mixed destructible terrain, **solid stone bottom row**, and tank placement inside the **25% zoom active ring**. Test seams, safe starts and persistence after camera travel.
- [ ] Verify game-mode regeneration with arbitrary seeds and Advanced parameters. Inspected authoring entry points require editor mode; if the runtime cannot support this lifecycle, request a generic engine feature before shipping the modes.

### 04 — Scorched Terra title screen and start flow

- [x] Generate original **AI title artwork** reading exactly `SCORCHED TERRA`: oversized late-1980s arcade lettering, steel/cyan upper faces, hot orange lower faces, deep hard shadows, pixel sparks and a cracked planetary horizon. Retain prompt/asset and inspect spelling and readability before installation.
- [x] Use the native authored `title` slot for an animated logo entrance, `PRESS START`, New Game, Continue, Options and Credits. Keep controls and secondary text as real styled UI, separate from the image.
- [ ] Implement title → setup/Advanced → opening armory → battlefield intro → match. Preserve continue/load, remembered roster/settings and return-from-game flows. Verify pre-world bindings across title submenus; no world scripts run on the title screen.
- [x] Update player-facing branding while retaining Indigo's template ID and persistent state keys. Opening the game must not spend money or start a CPU match before deployment is requested.

### 05 — Controller and keyboard menu navigation

- [ ] Support LRUD through bound keyboard keys, controller D-pad and left stick, plus confirm and cancel/back. Provide visible focus everywhere; preserve mouse use and pointer/controller handoff.
- [ ] Define directional focus for grids, categories, weapon lists, Advanced sections and dialogs. Skip hidden/disabled controls, scroll focus into view, and restore it on return.
- [ ] Support numeric adjustment, option cycling and text editing without stealing caret/typing keys. Provide controller-usable name/seed entry; honor remapping, stick deadzones and bounded repeat.
- [ ] Work **before world boot**, while paused, and in gameplay menus. Menu input must not leak into aiming, shooting, movement or passing. HUD navigation needs an explicit focus mode that returns cleanly to tank control.
- [ ] Audit native menu-host/input routing first. If absent, add generic engine focus/navigation rather than injected document scripts or synthetic mouse clicks.

### 06 — Damage and cash fountains

- [x] Give damage numbers crisp pixel edges, an outline/hard shadow, randomized modest rotation, brief squash/stretch and a taller arcing fountain trajectory. Launch from the hit position, then detach and remain readable while tanks/camera move.
- [x] Per the later user correction, money awards animate beside the HUD wallet, not over tanks. Use actual accepted rewards, mint styling, a dollar sign and two decimal places, aggregating bursts without changing totals.
- [x] Keep payouts authoritative and exactly once. Cosmetic grouping of rapid machine-gun/chaos awards may combine labels, preserving the sum; displaying a marker never awards money.
- [x] Preserve the current economy during this visual task: whole-dollar awards display as `$20.00`. If later balancing introduces fractional rewards, migrate wallets, prices, purchases, saves and calculations consistently to integer cents.
- [ ] Bound concurrent labels, stagger/merge dense bursts, and clean up on expiry/session end. Test pause, 25% zoom, zoom changes, off-screen sources and destroyed hulls.
- [x] Extend native transient text for rotation, nonuniform scaling, trajectories and outlines/shadows. Current `floatText` exposes only color, lifetime and size. Avoid low-rate script animation of world text and duplicate native/game damage labels.

### 07 — Complete arcade screen audit

- [ ] Review title, continue/load, setup, Advanced, name/seed editing, generation/loading, opening armory, HUD, weapon/utility selection, pause/options/controls, confirmations/errors, transitions, tank speech/nameplates, damage/cash, results, standings and between-round shop.
- [ ] Inspect first-use, focus, hover, selected, disabled, empty, validation-error and narrow-window states, longest permitted names, all roster sizes and controller-only menu completion.
- [ ] Capture a bounded screenshot set and short animation evidence. Remove default web controls, rounded containers, system fonts and inconsistent shadows, including embedded engine panels.
- [ ] Verify shader/overlay ordering, contrast and frame pacing in the packaged app. Log engine-owned surfaces that cannot be themed as engine requirements.
- [ ] Scope the skin to every surface reached by a Scorched Terra player; Talus editor/tooling chrome stays outside the game-skin review.

## Previous seven tasks — after the arcade overhaul

These retain the previously proposed order. Split their remaining scope into later milestones as appropriate; M10 does not promise the entire queue in one release.

### 08 — Complete player controls

- [x] Implement explicit homing-target selection, weapon/utility feedback and shared-keyboard/controller combat bindings. Build on task 05. Full physical-controller and narrow-window acceptance remains separate.

### 09 — Tactical CPU decisions

- [x] Replace fixed shopping rotations with budget/inventory-aware choices; improve weapon, target, movement, digging, defense and utility choices for terrain and opponents.
- [x] Create five real faction-backed personas, with faction behavior graphs and per-NPC blackboards. Keep persona identity separate from player name, wallet, match combatant identity and cosmetic variant.

| Persona / faction | Default skill | Tank colors | Shopping and combat identity |
|---|---|---|---|
| **Buck “Lucky” Fuse / Lucky Fuses** | Rookie | Tangerine body, cream turret, dark tracks | Cheap shells and opportunistic machine-gun fire; overconfident, broad but bounded aim error, limited memory, occasional risky close shots. Still takes legal turns and can finish a match. |
| **Molly “Mole” Morgan / Burrow Union** | Easy | Mint body, earth-brown turret, yellow accents | Buys excavation fuel and available digging/terrain-clearing weapons; opens firing lanes and tunnels toward useful positions. Learns from blocked shots; prefers achievable local plans. Disabled Digger/Sandhog weapons stay unavailable pending native support. |
| **Captain Kiloton / Heavy Weather** | Regular | Crimson body, gold turret, charcoal tracks | Saves for heavy missiles, Nukes and MIRVs; values blast radius, clustered targets and ammunition efficiency. Uses repair/defense when necessary instead of spending the entire wallet on one bomb. |
| **Vera “Faultline” Voss / Gravity Office** | Hard | Violet body, ice-blue turret, white hazard marks | Buys Crumble, riot/terrain-clearing weapons and Earth Disrupter; attacks actual supporting terrain to cause falls, removes perches and avoids digging useless shafts beneath an already unsupported target. Re-evaluates after terrain changes. |
| **Dr. Domino / Cascade Institute** | Expert | Electric-cyan body, magenta turret, black/cream accents | Looks for chains involving nearby tanks, explosive/flammable matter and collapse opportunities. Combines appropriate weapons across turns, predicts collateral risk, adapts to defenses and reserves escape/repair resources. Uses observed information, not future chaos rolls. |

- [x] Implement skill profiles for bounded aim/power error, candidate budgets and impact memory; native surveys account for current terrain and nominal wind/drag. All CPUs use actual inventory, money, fuel and the same physical rules, without hidden combat bonuses. Advanced can override skill independently of personality. Empirical difficulty ordering and broader tactical evaluation remain in task 14.
- [x] Replace the fixed shopping rotation with scored, affordable purchases tied to persona plans, current terrain, stock and opponents. Fall back to available equipment when a desired item is disabled, unaffordable or inappropriate.
- [x] Store target, tactic, estimated benefit/risk, previous impacts and cancellation state on the NPC blackboard; retain match-level turn ownership and economy in global state. Use behavior graphs for shared planning/action stages with persona parameters, rather than five copied turn loops.
- [x] Preserve free-for-all rules for 2–16 tanks, including repeated personas. Same-persona tanks must still fight one another. The accepted native encounter/combatant policy overrides doctrine-level friendliness for this free-for-all. Persona factions represent identity/doctrine; an encounter determines who competes.
- [x] Give every tank a distinct deterministic body/turret/accent palette, including duplicate personas and human tanks. Use native **color replacement only**, preserving element IDs, mass, geometry, collision and health. Check zoomed-out readability, fragments, streaming, saved colors and contrast; add stripe/numeral accents where supported.
- [x] Add persona selection or seeded random assignment per CPU and show skill/faction in setup, shop and turn cards. Remember assignments/settings across rounds without changing persistent player identities.

**Extensible faction voices:**

- [x] Support **n authored shout types**, identified by stable keys, with labels and optional presentation metadata. `taunt` and `death` are example enum values, not a closed engine union; future examples include `hit`, `miss`, `buy`, `victory` and `chain_reaction`. Type definitions, validation, faction editors, public APIs, serialization and graph nodes must preserve arbitrary registered types through round-trip/save/export.
- [x] Author 100 unique taunts and 100 unique death lines per persona (1,000 persona lines total), retaining the existing general pool for humans. These are authored in `Game/persona-voices.json` and installed in the native faction pools. Additional types can have smaller pools; do not require every faction to define every type.
- [x] Use independent, persistent shuffled bags per persona/type, with no immediate repeat and no ordered-deck restart on a new map. Define explicit missing-type fallback/silence; never silently turn a `death` request into `taunt` or `ally_down`. Cosmetic RNG must not affect combat/terrain.
- [x] Route requested lines through the existing independent tank text and three-second shot/death sequence. Native ambient shouts must not duplicate or interrupt staged lines. A type does not inherently pause gameplay; presentation is chosen by the requesting sequence.

| Persona | Example `taunt` | Example `death` |
|---|---|---|
| Buck | “I have a permit for most of this.” | “That was my good tank!” |
| Molly | “Your foundations are under review.” | “Bury me somewhere I haven't dug.” |
| Kiloton | “I ordered the large.” | “Tell the crater I loved it.” |
| Vera | “Gravity has accepted my proposal.” | “I object to this sudden demotion.” |
| Domino | “One spark. Several consequences.” | “This was not the control group.” |

### 10 — Balance arsenal and economy

- [ ] Tune the 35 enabled weapons, 12 utilities, death-effect probabilities, prices and rewards using CPU results. Preserve cash for every configured action, including shots, landings, damage to anyone, self-damage and dying. Keep disabled equipment unavailable until native behavior is accepted.

### 11 — Expand terrain and biome content

- [ ] Extend task 03's families, validate many seeds/spawn sites, and switch biomes between rounds or groups. Carry forward broader neural/living-brush acceptance.

### 12 — Series and richer results

- [x] Implement best-of-N/series progression, standings, champion, and damage/accuracy/earnings summaries using the arcade results presentation and persistent player identities. Idempotent result accounting passes local regression; full multi-round live acceptance remains in task 14.

### 13 — Remaining sound, art and interface polish

- [x] Implement native turn/fire/death/purchase/victory audio, equipment comparisons and larger-roster HUD refinement using the arcade theme/title assets. Distinct illustrated icons per equipment item and the full layout matrix remain polish work.

### 14 — Sustained CPU-only acceptance

- [ ] Bounded multi-round matches across WFC/brush/zone/maze, several seeds and 2/4/8/16 tanks; all enabled equipment, economy persistence, terrain visitation and supported save/reopen boundaries.
- [ ] Exercise each persona and skill, repeated-persona free-for-all fights, budget-constrained shopping, blocked/no-op terrain tactics and sparse opportunity maps. Measure tactics chosen, hit rate, survival, spending and stalled turns; calibrate difficulty statistically rather than assuming expert wins every seed. Verify each tank's palette preserves materials and each voice uses the right shuffled type pool.
- [ ] Use virtual input for controller/menu checks without human combatants. Capture fresh account baselines and restore only those exact diagnostic baselines. Avoid E2E profile clones and unbounded builds/screenshots.

## Engine boundaries and acceptance gates

Source inspection on 2026-10-23 found authored title/menu slots, CSS menus, VCR OSD Mono, independent world text, input-action bindings and native zone/maze types. The bridge is reachable but reports `engineBooted: false`. These are source/API findings, not live M10 acceptance.

| Area | Finding | Next gate |
|---|---|---|
| Transient text | Public `floatText` supports color/ms/size; drawing uses fixed vertical rise. | Extend generic native animation/style controls; verify frame-rate motion and bounded lifetime/count. |
| Menu navigation | Authored host delegates clicks; document scripts are stripped. Gameplay gamepad bindings exist. | Verify full UI routing; add generic focus/actions if missing, including pre-world title/text entry. |
| Zone/maze lifecycle | Native types/algorithms exist; `editor.layout` and `editor.maze` are editor-gated. | Prove runtime seeded recipe selection/parameter application; patch engine if absent. No editor calls from running matches or fixed pre-rendered maze substitute. |
| Title flow | Native title slot works before world boot. | Verify installed-state bindings and seed/settings submission through nested menus into launch. |
| Transitions/shaders | CSS and banner/fade APIs exist; inspection did not establish completion events or UI shader compositing. | Prototype lifecycle/timing/compositing; request a native contract for demonstrated gaps. |

Track findings in [engine work](engine-work.md). Reproduce blockers, formulate generic engine contracts and acceptance criteria, land the engine release, then finish dependent game work. Do not script around missing engine features.

M10 closes when tasks 01–07 work in the running game, every screen has been reviewed, timing/navigation are accepted, seeded native zone/maze generation is proven in game mode, and damage/cash effects animate without changing reward totals. Tasks 08–14 remain visibly queued afterward.

## Additional authoring requests — 2026-10-24

- [ ] E38: discoverable editor **Play from Title** action and complete UI-only launch acceptance.
- [ ] E39: installed Talus **Publish Game…** wizard → exported `.talus` → bundled publishing CLI → actual installer with native reveal/launch. See [the engine follow-up](engine-m10-completion-prompt.md) for source findings, fields, toolchain and disk-lifetime requirements.
- [ ] E37 expanded: capture and visually inspect every relevant menu state, especially key bindings, at normal/narrow/short window sizes; fix input overflow, cramped margins, inaccessible scrolling/actions and confirm before/after screenshots. Include the publisher once implemented. Do not treat successful navigation or markup checks as layout acceptance.

## Latest follow-through

The direct opening-armory Begin match action is installed and accepted. A completed four-CPU round and exact completed-save replay passed; a full series remains unaccepted after the E40 terrain-request defect and now-fixed residual planner-budget fault. The original accounts were restored exactly. See the final section of `m10-completion.md`.

Later user requests—Spin/Size LFO, native zone/semantic/neural/living hybrids, connected zone combat space, Git capture, 1.5× Settings, loading presentation, then WFC connector-marker extents—are ordered in [the next task list](m11-generation-and-source-control.md).
