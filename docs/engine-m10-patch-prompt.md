# M10 engine update — Scorched Terra

> Historical first-slice handoff. E25–E30 landed in Talus 0.0.2533. See [current integration results](m10-followup-results.md) and [new acceptance findings E31–E35](engine-m10-followup-prompt.md). The status below records the earlier build.

Status: **open; game-side execution in progress.** Implement generic Talus capabilities, then supply a new local release and packaged acceptance evidence. Do not hard-code Scorched Terra names, persona IDs, text, colors, menus or terrain sizes in engine code. Preserve M9 behavior and the separate [M9 carryover](backlog.md).

Game repository: `/Users/tonygermaneri/gh/indigo`. Engine repository: `/Users/tonygermaneri/gh/foxtrot`. Authoritative task list: [M10 plan](m10-plan.md). Five persona definitions are staged in `world/Game/personas.json`, with 1,000 unique persona lines in `world/Game/persona-voices.json`. Existing runtime remains free-for-all and retains its current AI until the faction integration is accepted. Sixteen color-only tank variants are authored through the native template API; their readback preserves all element IDs, geometry, physics, health and inventory.

## E25 — Native arcade transient-text animation and styling

Public `talus.ui.floatText` currently accepts color, lifetime and size. `src/app/composables/useOverlayDraws.ts` draws fixed vertical rise; rotation, nonuniform scale and ballistic fountain parameters are not available. M10 game code already aggregates actual cash awards per tank over 250 ms and emits native mint `+$20.00` labels. Do not change economy accounting to implement presentation.

Provide reusable native transient-text styles usable by automatic damage numbers and explicit scripted labels. Support outline/hard shadow, screen-pixel size, modest seeded initial rotation/angular motion, a high arcing trajectory with horizontal spread, squash/stretch envelope, fade and lifetime. Distinct damage/cash styles must coexist without duplicate default damage labels. Keep randomness cosmetic and separate from world/combat RNG. Support renderer-frame animation, including pause behavior already promised by floatText, and meaningful behavior when the camera moves, a body dies, parks or disappears.

Acceptance: 25% zoom and multiple DPRs; damage and money recognizable by shape/size/prefix as well as color; dense machine-gun/MIRV/100-shell chaos stays bounded; expired labels disappear; session reload/disposal clears labels; no label updates at low simulation-script frequency; all aggregate cash display sums match authoritative award receipts. Preserve existing floatText callers.

## E26 — Generic authored-menu navigation and game-facing theme coverage

`MenuOverlay.vue` delegates pointer clicks; menu HTML is intentionally sanitized and cannot contain scripts. Existing input bindings/gamepad plumbing serve gameplay, but an authored-menu directional focus contract was not found. Supply native focus/navigation across authored title/setup/shop/pause/options menus and HUD focus mode. It must work before a world/script host exists and while paused.

Requirements: rebindable LRUD, D-pad and stick deadzones/repeat; confirm/cancel/back; predictable list/grid neighbors; disabled/hidden skipping; focus restoration; scroll-into-view; mouse/gamepad handoff; numeric controls, selects, tabs/details and controller-usable text/name/seed entry. Do not intercept text caret keys while editing. Suppress gameplay actions while a menu owns input. Support per-control declarative overrides without injected DOM scripts.

Expose a supported way to skin game-facing built-in Options/Controls, load/continue, confirmations and errors with the game's font/colors/hard borders. Keep editor chrome separate. The game has a shared arcade stylesheet and new title/pause/help/credits menus; do not replace their content with hard-coded native menus.

Acceptance: navigate every game flow without mouse from pre-world title through setup/Advanced, shop, battle HUD, pause and results; verify remapped keyboard plus virtual gamepad; no accidental shot/pass/purchase on focus transfer; click controls still work. Large rosters and long names remain legible.

## E27 — Runtime native zone/maze generation from seeded recipes

Native layout tile types, zone terrain and maze algorithms exist. `editor.layout` calls in `src/scripting/api/runtime/editor.ts` and `editor.maze` in `editorPipelines.ts` require editor mode. A live game-mode probe captured both refusals in `docs/evidence/m10/runtime-generation-refusal.json`. We will not generate imitation mazes with rectangles or switch a running match into editor mode.

Provide a supported game lifecycle to choose and instantiate registered native zone/maze recipes using the new-match seed and validated user parameters. Authored recipes/palettes belong to the template; game instances and destruction belong to that save. Generation must support progress/completion/refusal, bounded work and repeatable results independent of camera visit order. Do not require live external AI/network calls for every new match.

Game requirements: weighted random choice among existing WFC, brush, zone and maze families; native zone presets for dunes, ridges, brambles and basins; native maze algorithms such as recursive division, braid, cellular cave and platform. Expose legitimate algorithm parameters, bounds and material mappings through public APIs/schema so Advanced UI can validate controls. Preserve a protected stone bottom row and designated spawn clearances within the 50×5 tile-equivalent arena. Do not overwrite generated/destructed content on resume.

Acceptance: several seeds per family; same seed/config/version gives same terrain; different seeds vary; connected playable side-view routes and clearance; unload/revisit does not lose chunks; save/reopen preserves craters and foundation; mixed powders stay supported; 25% active-ring combat and off-screen native flight still work. Include scoped game-side integration examples and declared parameter bounds.

## E28 — Extensible faction shout types, selection and staged delivery

**User requirement: n authored shout types. `taunt` and `death` are examples, not a closed engine enum.** Current `FactionManager.ts` has a fixed `ShoutCategory` union and `SHOUT_CATEGORIES`; normalization drops unrecognized categories. An unsaved live `records.create('faction', …)` probe supplied `taunt`, `death` and `custom_probe`; its returned `defaultPools` was empty (see `docs/evidence/m10/shout-type-probe.json`). Do not add just two new hard-coded cases, or store last words under `ally_down`.

Provide a stable authored type registry (IDs/labels and optional metadata) and faction/rank pools keyed by those types. Keep old built-in types usable. Editors, validation, database transport, import/export, HTTP/MCP, script API and behavior graph selectors must preserve arbitrary registered IDs. Add explicit missing-pool fallback/silence; absence of one type must not prevent a faction defining other types.

Provide a public way to select a line from the effective faction/rank/type pool without automatically displaying it. A staged shot/death sequence needs one owner: center camera, select/display independent world text, wait at least three simulation seconds, then fire/release the death effect. Ambient NPC shouts must not double-display or interrupt these staged lines. Type identity must not imply a fixed presentation or pause policy.

Game-owned persistent shuffle state should be supported through ordinary installed state/blackboards and stable line IDs, with no immediate repeats and no restart at every terrain seed. The engine must not secretly consume combat RNG. Existing emotion/rank distinctions remain useful but must not limit the number of authored types.

Acceptance: author at least three new types, including `taunt`, `death` and an unrelated custom ID; save/export/import/reopen with all pools and IDs intact; request lines through script and graph; rank/default fallback behaves explicitly; no cross-persona voice leakage; staged death keeps its visible hull and exact existing sequence; previous faction shouts remain compatible.

## E29 — Faction identity alongside encounter-specific allegiance

Five personas use real factions for doctrine, voice and behavior graphs. A 16-tank match necessarily repeats personas. `FactionManager.isHostile(a,a)` currently returns false and `isFriendly(a,a)` true regardless of relation entries. Two instances of the same persona must still compete in free-for-all.

Provide a generic native encounter/combatant allegiance policy distinct from durable faction identity. It should support free-for-all and explicit teams, with documented precedence over faction relations inside the encounter and normal faction behavior outside it. Propagate to relevant perception, behavior queries, target eligibility and friendly-fire handling consistently; preserve projectile owner credit across parking/death. Do not fake five personas with many unrelated faction copies or bypass native hostility in a game-specific targeting script.

Acceptance: 2/4/8/16 combatants, repeated persona factions, humans and CPUs, no accidental alliances in free-for-all; explicit same-team participants behave as configured; self-damage still follows weapon/game policy; save/reopen and durable projectile ownership preserve identity. Faction behavior/voice selection continues to use the persona faction.

## E30 — Pre-world title routing, bindings and automation

The authored `title` slot exists and the generated game title renders correctly in a menu preview. `engine_set_mode({mode:'menu',template:...})` ignores the template in its menu branch and opens Talus Home, so it does not expose the authored pre-world title. Provide a documented HTTP/MCP way to open/preview a template's actual title without booting a game or creating a save.

`MenuOverlay.vue` binds installed state only for `req.slot === 'title'`; `show-menu` changes the slot to `custom` while retaining worldKey. Preserve the template's pre-world bindings and navigation context through authored submenus and back. Continue availability, remembered names/options and launch seed must survive that route. Published builds should open the title as intended; returning to the game menu must use the correct template.

Acceptance: title → help/credits/options → title; title → new setup → seeded game; continue when saves exist; no save/no-purchase side effects from browsing; all flows through native navigation and automation, no private imports/evaluate calls from the external agent.

## Integration and delivery

Inspect current game-side code before changing it; this prompt does not authorize reverting to old M9 policies. Native color replacement exists: prefer the existing color-only authoring path, preserving element IDs/mass/collision, and report a concrete missing API only if it cannot serve instance/palette needs. Generic terrain analysis needed for CPU support-removal or chain-reaction planning should similarly use existing public observations first, with bounded native additions only for demonstrated gaps.

Keep strict TypeScript clean and run meaningful targeted engine tests plus packaged worker/HTTP checks. Use the existing profile carefully, fresh exact account baselines, and bounded evidence. **Do not clone E2E profiles or accumulate build bundles.** Supply version/source/package provenance, public API declarations/examples, reproducible acceptance and remaining limits. Game-side M10 will resume against the new release; do not claim all fourteen queued tasks complete merely because these engine contracts land.
