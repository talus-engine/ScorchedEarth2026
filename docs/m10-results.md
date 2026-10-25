# M10 — first game-side slice

> Historical first-slice handoff. E25–E30 landed in Talus 0.0.2533. See [current integration results](m10-followup-results.md) and [new acceptance findings E31–E34](engine-m10-followup-prompt.md). The status below records the earlier build.

**M10 is in progress, with native blockers documented in the [engine update prompt](engine-m10-patch-prompt.md).** The [ordered plan](m10-plan.md) distinguishes this installed slice from the remaining arcade and CPU work.

## Installed

- Scorched Terra AI title artwork, authored title/help/credits/pause screens, and a shared arcade skin for setup, Advanced, HUD and armory. VCR OSD Mono, cyan/gold/magenta/mint colors, crisp borders, hard shadows, visible keyboard focus styling and reduced-motion CSS replace the old rounded system-font cards.
- Match opening, incoming-player name, outgoing turn/score and victory/draw cards. Turn cards use one presentation second; opening uses 2.5 and ending 3. Cards yield to staged tank last words, suspend while paused and do not consume playable turn time. Result waits for the user to open the armory instead of covering the victory presentation with an automatic shop.
- Cash labels aggregate actual reward receipts over 250 ms per tank and use mint `+$20.00` text. Cosmetic display does not change payouts. Native rise/fade is in use; fountain trajectories, rotation and squash/stretch await E25.
- Sixteen native tank template variants, with different body/turret/accent/track palettes. New rosters select these variants; old saved tank identities are retained. Native readback verifies all 956 particles per tank retain element IDs and positions, plus unchanged body/joint/controller/stats/loadout fields.
- Five native faction identities and five staged persona profiles: Lucky Fuses, Burrow Union, Heavy Weather, Gravity Office and Cascade Institute. Each profile has skill, shopping preferences, risk/planning parameters and a voice description. Their AI/voice assignment is deliberately not active before E28/E29.
- 1,000 unique staged persona lines: 100 taunts and 100 last words for each persona, comprising 200 new signature lines and 800 curated existing lines. CPU pools do not overlap. The authored registry includes seven example shout types and is designed for n registered types; taunt/death are not the intended engine limit.

## Validation

The [CPU acceptance](evidence/m10/acceptance.json) records world `77ac4c24-82b8-4aa8-a6b1-f5cc0d61537c`, seed `1792816183776`, two CPUs/no humans, and a natural finish on turn 4 with M10 Ember winning. All ten cards completed, including exactly four outgoing score cards. Native presentation durations were within 50 ms of their targets; all observed shot/death presentations met the three-simulation-second minimum; no game script error was reported and the final save boundary was allowed.

A separate [wall-time probe](evidence/m10/frame-clock-probe.json) measured 2.0167 presentation seconds over 2.056 seconds of wall time. Simulation advanced one second during that interval; it is a different clock. The presentation sequence uses the documented native frame clock, with no rate-compensation workaround.

Passed checks: strict TypeScript against the installed API; M9 combat/presentation and generation tests; M8 utility accounting; M10 tests for cash aggregation without duplicate awards, pause/death interruption, full readable card restart, timer isolation, score-card idempotency and cancellation. Catalogue checks verify five personas, valid equipment references and 1,000 unique persona lines.

Screens inspected: [title preview](evidence/m10/title-preview.jpg), [setup](evidence/m10/setup.jpg), [Advanced](evidence/m10/advanced.jpg), [armory](evidence/m10/armory.jpg), [opening](evidence/m10/opening.jpg), [score card](evidence/m10/score-card.jpg), [result](evidence/m10/finished.jpg), [pause](evidence/m10/pause.jpg), [help](evidence/m10/controls.jpg), [credits](evidence/m10/credits.jpg) and the [final colored tanks/HUD](evidence/m10/palettes-live.jpg). The title image was reviewed in an authored-menu preview, not accepted as a fully working pre-world flow. Some earlier screenshots precede the final HUD branding and monetary-format fixes.

The final [palette deployment](evidence/m10/live-palette-roster.json) reached ready with two CPUs, no errors, unique orange/mint colors and actual native template IDs equal to the roster's requested variants. All sixteen authored variants passed [native color-only readback](evidence/m10/color-only-variants.json).

## Native blockers and remaining work

- **E25:** generic native transient-text animation/styles for damage and cash fountains.
- **E26:** controller/LRUD menu navigation, pre-world text entry, input ownership and theme coverage of engine-owned game panels.
- **E27:** runtime native zone/maze generation. The live [game-mode probe](evidence/m10/runtime-generation-refusal.json) refused the editor-only entry points.
- **E28:** n authored faction shout types and line selection for staged presentation. The live [unsaved normalization probe](evidence/m10/shout-type-probe.json) dropped all three supplied custom types.
- **E29:** encounter-specific hostility so repeated persona factions remain opponents in free-for-all.
- **E30:** public pre-world title opening and context/binding preservation through submenus.

Only current WFC/brush controls are exposed in Advanced. The zone/maze presets and algorithm controls need the native runtime contract; no imitation generator was installed. Full controller/screen acceptance, advanced AI tactics, balance/series/audio work and sustained multi-roster acceptance remain pending. Existing M9 engine backlog is retained separately.

## Assets and reproduction

The built-in imagegen tool created [the PNG master](../world/Art/scorched-terra-title.png) from [this prompt](../assets/m10-title-prompt.txt). A WebP delivery copy is embedded in the title HTML within the native file-size limit. The master stays in the project.

`tools/build_m10_ui.py` embeds the shared `world/Menus/arcade.css` in sanitized markup-only menus. `tools/build_m10_voices.py` regenerates the static curated persona corpus. `tools/install_m10_palettes.py` authors/verifies native color-only variants; `tools/install_m10.py` installs content through the HTTP bridge while Indigo is open in the editor. Do not run installers against an active match. `tools/observe_m10.py` collects bounded CPU evidence without creating a profile clone.

The [restoration report](evidence/m10/restoration.json) verifies exact serialized restoration of the fresh pre-test names/settings, economy/inventory, scores and dialogue keys in durable storage. Original player records were checked for unrelated changes before restoration. All installed M10 template files match workspace hashes. The app is left in a fresh **undeployed setup** so CPU shopping cannot spend restored balances. No E2E profile clone or engine build was created. Do not replay these baseline files after subsequent player progress.
