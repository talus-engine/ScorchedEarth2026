# M10 follow-up release — Talus 0.0.2535

**Game-side handoff accepted, 2026-10-24:** independently verified the installed app.asar hash and the installed script/catalog/setup/shop against this workspace. The M10, M9 combat/generation and M8 utility checks pass, as does strict TypeScript against the refreshed live declarations. Per the user's clarification, evolving air/pressure is accepted uncertainty: use a best-estimate trajectory, retain native current-obstruction checks, and develop observed-shot feedback in the CPU task. Air forecasting is not an outstanding engine requirement. This handoff check was read-only with respect to the running app and accounts; no new match, profile or build was created.

Installed engine source `0a1412f033705dc364188860ca858998833fd655`; candidate and installed app.asar SHA-256 `2327970d6870fa91850e7070e71850977c6d4ecc11ec9c353b44f4b79e4ed2c2`. The assistant installed this signed local arm64 release. E31–E35 engine contracts and scoped game integration are available. **Full game-side M10 and tactical/persona tasks 08–14 remain open.** Historical 2533 findings below remain evidence of that build.

- E34: CPUs use the native swept planner from the equipped weapon's actual muzzle, with target hull identity. MIRV requests carrier-to-apex clearance; ordinary weapons request impact clearance. No copied game solver or four-ground-probe heuristic remains. The actual seed-2533410 valley replay chose 83°, waited three simulation seconds after speech, split once into five children, completed six launches/ends with one ammo debit, and dealt 42.779 damage. All survivors stayed live at 25% in 151 observations. Native API probes verify low-wall/muzzle/body obstruction, opposite-direction wind, unavailable terrain, empty ammo, defense refusal and bounded work. Nominal trajectories explicitly warn that evolving air fields are not forecast; observed apex differs about 39 pixels vertically. Child impacts remain unplanned.
- E31: the actual 50-column dune source has surfaces y=587–717 at 150 samples and an intact sampled foundation. All four zone weights are restored to six. Static STONE crater save/reopen passes in both final packaged modes. The small actual DIRT cavity is **not an exact-empty-crater test**: a fresh native snapshot proves it fills physically before save while synchronous `world.cell` still shows its cached empty mirror. Raw failed/corrected observations are retained; there is no evidence here of source regeneration.
- E32: `menu.closed` releases shop ownership after native Back. Begin then starts the real match. No polling or synthetic button workaround is used.
- E33: native `<talus-terrain-settings>` replaces the static selection. Scoped recipe parameters and weights survive zone → maze → random switching; invalid height shows a themed error without a save. The shop carries the complete typed generation request into the next round, preserving weights and per-recipe parameters.
- E35: actual title → Options → Controls retains the title backdrop, pixel font, cyan borders and square midnight panels; Back restores focus. See screenshots in `evidence/m10-engine-2535/`.

Validation: 14,035 passing engine tests, 1,152 passing files, one expected failure and 17 skipped; zero TypeScript errors; production build; 110 packaged worker checks and 110 loopback checks; current local M10/game accounting checks. No profile copies or unbounded matches. The additional packaged overhang fixture was unsuitable because it overlapped existing terrain; blocked-overhang behavior has native regression coverage. A full controller-only nested-dialog audit, physical DPR matrix and complete 2/4/8/16 gameplay acceptance remain queued.

Fresh exact baseline restoration passed for all four installed account/settings/score/dialogue strings. Original saves and newer user progress were preserved. The app is at the authored title with no world running. Final diagnostic maze: `c4bd4d88-8ed7-4722-b270-b1855f73db39`; retained zone: `471a2e26-8147-42d4-aa0f-c7fcb617defc`. Wallet-only cash, native damage labels, three-second speech, faction identity, color-only tanks and the early-carrier MIRV repair remain intact.

Engine report: `/Users/tonygermaneri/gh/foxtrot/docs/m10-followup-validation.md`. Public examples: `docs/m10-followup-contracts.md` in the engine. Raw bounded results and fresh local account baseline are under `docs/evidence/m10-engine-2535/`; never replay the baseline over later progress.

---

# M10 integration on Talus 0.0.2533

The E25–E30 engine contracts landed. Game-side M10 remains open: live acceptance found terrain and menu blockers, plus the user-observed CPU aiming failure. The actionable handoff is [the follow-up engine prompt](engine-m10-followup-prompt.md). Earlier evidence in `evidence/m10/` is historical; this pass uses `evidence/m10-2533/`.

## Installed game changes

- Native damage style: 36 CSS-pixel text, hard outline/shadow, upward ballistic motion, rotation and tall initial stretch, with bounded native expiry. It styles the existing automatic label, avoiding duplicate damage numbers.
- **Latest user change:** cash now appears beside the displayed HUD wallet, never over a tank. Rapid accepted rewards combine into one mint badge. It expires after 1.5 presentation seconds and clears when the displayed player changes. Other wallets retain their complete authoritative earnings without world-space popups. Whole-dollar rewards still display two decimals; no economy migration or payout changes.
- Arcade theme and navigation configuration for the native game menus; title New Game opens pre-world setup without creating a save. Help/credits use native Back. Actual title → setup preserves remembered names/settings before world boot.
- Ten source selections: existing WFC/semantic-neural-living brush modes, four native zone presets and four native maze presets. All pass native recipe validation. Random currently includes WFC, brushes and mazes. Zones are disabled in the menu and have zero random weight until E31 is fixed. Native mazes have an open sky, a combat clearance corridor and a solid 256-pixel stone foundation. Detailed parameters are authored in the native catalog, but the full Advanced parameter/weight UI needs E33.
- Five actual faction identities, all 1,000 persona lines attached to native pools, arbitrary registered type selection, independent persisted shuffle bags, staged speech ownership and free-for-all encounter membership. Six live CPUs include every persona and two Lucky Fuses tanks; the repeated-faction pair is natively hostile with damage allowed. Personality-specific tactical shopping, aim skill budgets and support/chain-reaction planning remain queued; identity and voice activation alone do not complete those strategies.
- MIRV early-impact correction: a carrier ending before apex releases its five warheads once, instead of discarding the payload. Apex/end races do not double-split, children do not recursively split, and one shell still costs one ammunition unit. This is a game-side behavior repair, separate from the native aim blocker.

## Evidence and limits

The installed binary matches [the engine handoff hash](evidence/m10-2533/provenance.json). [All ten recipes validate](evidence/m10-2533/recipe-validation.json). [Title](evidence/m10-2533/title.jpg) and [pre-world setup](evidence/m10-2533/setup.jpg) were inspected. [Native faction pool readback](evidence/m10-2533/faction-pools.json) and [six-CPU runtime identity/encounter readback](evidence/m10-2533/persona-live.json) confirm native integration.

The two-CPU native bunker match deployed and ran ten turns without a script fault, but repeatedly hit terrain and was stopped as a failed gameplay acceptance. It is **not** a successful completed match. The [wall repro](evidence/m10-2533/cpu-wall-repro.json) and [turn trace](evidence/m10-2533/maze-before-fix.json) support E34. A separate [six-CPU run](evidence/m10-2533/six-cpu-final.json) reached turn 7 with no script fault and exercised all five native taunt pools, two native death pools, a normal MIRV apex split and child impacts. It was bounded diagnostics, not a completed-match or statistical skill test. The [wallet capture](evidence/m10-2533/wallet-popup.jpg) shows the new HUD badge and a native damage label; [expiry readback](evidence/m10-2533/wallet-expiry.json) confirms cleanup. Final CSS reserves a row below the wallet to avoid covering the tactic line shown in that capture. Early-impact MIRV behavior has regression coverage; this pass’s captured natural MIRV used its normal apex path.

Native `Aim_Ballistic` chooses a mathematical solution without sweeping the actual path; the game has no replacement solver.

Zone deployment reached the foundation rather than its intended surface. [Surface readback](evidence/m10-2533/zone-ready.json) and native source inspection identify chunk-relative surface coordinates as E31. No substitute scripted hills were added.

[Controller Back repro](evidence/m10-2533/menu-back-repro.json): armory visibly closes, explicit Begin activation follows, but the match stays ready because the script's menu ownership was never released. The authored mouse close works. E32 requests a generic lifecycle event/action. Full controller-only completion and the final all-screen audit remain open. A settled [native Options capture](evidence/m10-2533/options-theme-context-loss.jpg) also shows the game theme/title context being lost while that dialog is open (E35); the theme file is installed but that route is not visually accepted.

Passed local checks: strict TypeScript against the live 0.0.2533 declarations; M9 shot/death timing, MIRV apex and early-impact ownership, child lifetime and terrain payload tests; M9 generation ordering/resume/refusal checks; M8 utility accounting; M10 wallet aggregation/expiry/turn ownership, transition timing/interruption, generic persona type selection, pool isolation, shuffle boundaries and persisted continuation. Live terrain/CPU failures are recorded separately from these passing checks.

No engine source edits, builds or profile clones were made. Evidence is bounded. Diagnostics use dedicated `M10 …` player names and a freshly captured exact account baseline; session restoration must verify original player accounts before writing anything. Do not run historical restore scripts after user progress.

## Next work

1. Land E34 terrain-aware aiming and E31 world-scale zone surfaces.
2. Land E32 menu cancellation lifecycle, E33 pre-world parameter/weight controls and E35 game theme/context retention in native dialogs.
3. Integrate those APIs, restore zone random weights after acceptance, and finish the full arcade/controller/terrain screen audit.
4. Continue the ordered tasks 08–14, including persona-specific decisions, equipment balance, series, sound/art and bounded 2/4/8/16 CPU acceptance. M10 engine completion did not close this queue.

## Session closeout

[Exact restoration](evidence/m10-2533/restoration.json) confirms the four original serialized account/settings/score/dialogue values and verifies 16 installed template files. Original player records were unchanged before restoration. The app is left at the actual Scorched Terra title with no world booted; diagnostic CPU spending is stopped. No profile clone or engine build was created.
