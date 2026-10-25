# M10 remaining game work — execution record

Execution against Talus 0.0.2535 on 2026-10-24. This document supplements the engine handoff and distinguishes implementation from acceptance. The game still uses the Indigo template and installed-state keys. Final native installation is recorded after the acceptance-driven corrections below.

## Implemented and installed

- Persona shopping uses real balances, existing inventory, preferred weapons/utilities and a savings reserve. Shopping receipts remain idempotent. Personas and unique physical color variants are assigned from a deterministic roster shuffle, separate from terrain, voice and death-effect randomness. Advanced can override skill without changing faction identity; the roster assignment seed follows the series.
- CPUs rank opponents by distance, health and nearby opponents; select owned weapons; survey observed support for excavation tactics; use bounded native `weapon.plan` requests with persona error and candidate limits; try a different owned weapon/target on refusal. A shared behavior graph accepts the surveyed solution, publishes aim, waits, and requests the existing staged shot. Human Lazy Boy continues using the native graph solver.
- Impact observations are bounded per persona and kept on the NPC blackboard. Small nearby misses bias the next surveyed point; distant obstruction hits prefer steep arcs. Ineffective weapons lose preference. Unsupported forecasts are explicit. Magnetic fields use clearly labelled exploratory high arcs, never a purported collision guarantee. Future air/pressure is not forecast.
- Fuel, digging and jet thrust respond to nearby opponents/obstructions instead of draining owned supplies every turn. No hidden ammo, damage or purchase bonuses.
- Human homing targets have HUD buttons and a T / controller-X cycle. Hotseat pad bindings cover movement, aim/power, fire, pass, flip, jet and burrowing; native Back/F6 owns HUD navigation. Keyboard and mouse remain supported.
- Best-of 1/3/5/7/9 series carry names, inventories, persona assignments and scoped generation settings through the shop. Wins determine the champion; equal wins at the round limit are a draw. Results show damage, shots with damage, kills and earnings, plus series standings. A single attack with several damaging children counts once for accuracy. Lifetime totals and series results use the same idempotent result transaction. Series history is capped at 50.
- Advanced can tour the ten landscapes and keep each for 1–9 rounds. Original typed generation requests and per-recipe parameters remain available; an incompatible recipe's global parameters are not applied to another recipe.
- Alternate incoming cards, receipt-style outgoing cards, turn cash deltas, wider/scrollable results and condensed long roster names extend the arcade presentation. Shop cards compare actual damage/blast/crater data. Five original native audio cues cover turn, fire, death effect, purchase and victory (64,220 bytes total).

## Verification

Strict TypeScript check and the M8 economy/utility, M9 combat/generation, M10 presentation and new completion regression suites pass. The new suite covers savings reserves, terrain support requests, informational air warnings, bounded miss feedback, stale solve cancellation, pause/resume of asynchronous surveys, fixed-speed downward bearings, MIRV fallback, honest magnetic guesses, series idempotency, scoped biome groups and deterministic unique palettes.

Live CPU acceptance is recorded in `docs/evidence/m10-completion/`. The first two-CPU WFC run reached 11 turns without a script fault or a living tank leaving the active ring. It exposed excessive planner work-budget refusals and ineffective napalm preference. The subsequent installed revision raises the bounded native survey to its standard 500,000-step / 1,000,000-cell limits and penalizes recently ineffective weapons. That first run did not finish and is tuning evidence, not match-completion acceptance.

## Remaining acceptance / native carryover

The four-CPU brush run completed on turn 8, with all 75 foundation/macro jobs, 50 detail passes and 50 living sites recorded. The results show three kills and 251 credited damage for the winner, and a first-round series win. All survivors remained live throughout observation. The eight-CPU zone run reached turn 9, and the sixteen-CPU maze run reached turn 8, including actual machine-gun volleys after the fixed-speed request correction. All sampled survivors stayed live, no script fault was observed, and every recorded completed shot/death speech lasted at least three simulation seconds. These larger runs were bounded observations, not completed matches. Full best-of-series completion and statistical balance remain acceptance work. All four installed account baselines were restored with exact raw equality after confirming original accounts were unchanged. Full arsenal balance and difficulty win rates need a larger bounded sample; a few matches cannot establish statistical calibration. E14/E16/E23/E24 equipment/death-effect carryover remains as documented in `backlog.md`; this change does not enable unaccepted native behavior. Physical DPR/narrow-window coverage and every equipment/terrain/save combination are not claimed by local regression tests.

All diagnostics use distinct `M10C` accounts. Restore only the fresh exact four-key baseline captured for this execution, after checking original accounts have not changed. No E2E profile clones or builds are created.

## Acceptance-driven corrections

The zone run exercised all five personas and duplicate-persona combat through turn 9, without a script fault or parked survivor. Its low-skill fixed-speed gun exposed a game request issue: artillery elevation enumeration misses downward shots. Fixed-speed guns now submit a direct bearing to the same native swept planner; collision checks remain native. Skill tolerance allows bounded rookie misses without rejecting every imperfect shot.

Navigation testing also caught a game-side async pause race: a completed/refused survey could advance to a turn card after pause, invalidating a previously quiet save boundary. Survey and CPU continuations now wait for simulation resume; a regression proves they cannot publish a decision while paused. One separate native `ParticleCaptureInvalidated` save attempt succeeded on retry; the failure log is retained, without calling it a reproducible release blocker.

## Native screen audit result

Title → Options/back restores the authored backdrop and focus. Controller setup navigation reaches name/seed fields; native text entry renders; Advanced expands and series selection cycles with D-pad input. Opening armory, four-player results and the full sixteen-player roster were visually reviewed. Native Options tabs fail controller access, Back from text entry loses the source-field focus, and the native saved-game root has no working Back path to the title. Inner native widgets still need some arcade styling. These are E36/E37 in [the engine completion prompt](engine-m10-completion-prompt.md), with screenshots and source locations. No game-side focus hack was added. The physical DPR/narrow-window matrix and complete controller-only nested flow remain blocked/unverified.

## Final state

Nine implementation/config/menu files match their installed template contents (`final-verification.json`). Exact raw equality of the four captured installed-state keys was rechecked after the menu audit. The four saved games created by this execution were removed through the native load/delete UI; pre-existing saves remain. The app is on the authored title with no world running. The native load/confirmation screens retain the theme and backdrop, but their root Load/Settings panel cannot return via Back. The new Saved games title button is disabled until E36 fixes that route; Continue remains available. No profiles or builds were created.

Remaining work is explicit: E36/E37 native menu fixes, retained disabled equipment/death-effect contracts, full series/controller/DPR acceptance, and broader arsenal/difficulty calibration. The implemented CPU/economy changes are an initial measured tuning pass, not a claim of statistically balanced personas or exhaustive weapon coverage.

## 2026-10-24 follow-up: screenshot layout audit

The user requested actual screenshots to catch cramped margins and overflowing inputs. Captures and viewport/menu metadata are in [the layout evidence index](evidence/m10-layout-2026-10-24/index.json). Each captured screen state was visually inspected. Talus restarted during the audit; the installed package reported 0.0.2537 during inspection, then 0.0.2538 at the final metadata capture. The running executable's identity was not independently pinned. Filename suffix `2537` labels the post-restart phase rather than proving an exact running build. No match was created, no binding/field/preference change was submitted, and the app was left on the authored title. The publisher remains a requested engine feature, not an implemented or photographed screen.

| Screen/state | Visual finding at 1600×968 DIP |
|---|---|
| Title | Panel, logo, buttons and footer fit within visible margins. Resize probes remained at the same dimensions; they do not count as narrow-window evidence. |
| Options → Controls | **Fails in the inspected live state.** Rightmost Pad buttons are clipped and body content obscures part of the tabs. Reproduced after the app restart; exact running-build identity is unpinned. Earlier top/bottom/remap captures show the same cramped table. |
| Key remapping | Cancel remains visible, but underlying table clipping persists. Cancel was used without changing a binding. |
| Options → Audio, Display, World | No visible horizontal overflow in inspected pre-restart states. Display dropdown stays within the panel. This is not a full interaction or small-window acceptance. |
| Options → Debug | Post-restart screenshot fits, including the footer. No destructive controls were activated. |
| Setup | Fields, focus outline and footer fit. The names textarea is scrollable; no roster was submitted. |
| Advanced expanded | Inspected top, middle and end. Fields wrap within the right column, and scrolling reaches all footer buttons. The long form leaves substantial unused space in the left column; no claim of complete design polish. |
| Native seed keyboard | Post-restart keyboard keys and Cancel/Done fit within screen margins. Cancel restores the seed field; no seed was entered. |

E37 now explicitly requests a roughly 1,000px Settings panel, centered tab group when space permits, continuous bottom rule and a clear active-tab indicator, plus responsive binding rows. This audit does not accept narrower/shorter windows or multiple display scale factors: native drag attempts did not change the 1600×968 viewport. It also does not newly cover pause, live HUD, armory/results, every long-label/error state or publishing states. Those remain explicit screenshot gates in the engine prompt; existing older game screenshots are not substitutes for this matrix. No engine source, game source or installed assets were changed during this inspection.

## Final game-side pass — Talus 0.0.2539

The opening armory now has a **Begin match** action that closes it and enters the existing intro/turn sequence directly. A regression verifies that stale/repeated actions cannot start a closed armory or duplicate the intro. The HUD's Begin match remains available after returning to the battlefield. Both changed files (`Scripts/match.ts`, `Menus/shop.html`) are installed and read back exactly; the installed title's Saved games action is enabled. The actual title → setup/Advanced → deployment → opening armory → Begin match → first CPU shot route passed with visible mouse controls, a supplied seed, four unique CPU names and best-of-three selected. The initial title was opened over HTTP, so this does **not** accept the missing editor Play from Title entry (E38).

The existing M8 utility/economy, M9 combat/generation, M10 presentation and completion checks pass, as does strict TypeScript validation. `tools/accept_m10_series.py` adds a bounded observer with an explicitly named evidence directory, exclusive fresh baseline capture, unique diagnostic-name prefix, observed-world ledger and guarded exact restoration. It does not create matches or reuse a historical baseline; launch and next-round actions go through the UI. This execution uses the `M10F Oct24 ` prefix and `docs/evidence/m10-final-2026-10-24/`.

The engine agent released the app before these input tests. The installed 2539 `app.asar` hash is `e362b0fd05fe237c8932afe912bcf255682454b67d57841fe585594176a60843`, matching its release evidence. E36 integration passes: native gamepad directional input reaches Controls, keyboard Tab reaches Fire cannon remapping, controller confirm opens it, Back restores focus to that binding, and subsequent Back returns to title. Saved games → native Load list → Back → root → Back → title also passes. These tests changed no bindings or pre-existing saves. They use the real packaged menu owner with virtual controller input, not physical-controller hardware.

Opening-armory, setup and pause screenshots were inspected at 1600×968 DIP. Inputs, visible buttons and footer margins fit. Pausing during a shot telegraph held the simulation clock and events unchanged, then resumed. The CPU best-of-three results and restoration are recorded below. Full narrow/short-window and DPR coverage is still unaccepted. E37's wider native Settings layout, E38 and E39 remain engine work.


## Engine menu candidate 2540 — final acceptance pending

The engine implemented the E36 native composite-tab, keyboard return, loader Back,
accessible save-action and remap-latch changes, plus E37's scoped inner-control
skin. Actual title/setup/loader and paused routes passed on intermediate
candidates; the selector audit prompted 2539, and a contained-prompt bookmark
regression prompted 2540. Saved games was enabled only after its native return
path passed. The current game content and later layout work are preserved.

The assistant installed 2539 (`cb013f1bc`, app.asar
`e362b0fd05fe237c8932afe912bcf255682454b67d57841fe585594176a60843`).
The signed 2540 candidate is source `224033d21deee1c84d92e4a9f1f45e3ff495d104`,
app.asar `bf92795c5757f662277a4bd838034a7ffe0d321ccd0c155f5b90eb4ed2978cba`.
Its worker run passed 118/119: all new menu paths passed, but a remapped-key
probe observed Help opening unexpectedly. The cause remains unestablished.
A separate installed game became active, so installation and the final actual
replay were deferred; its active save barrier was not bypassed.

The engine's sole diagnostic remains `0bb8884c-ff1c-4d23-bd0c-9dcbca52b395`
(two CPUs, ready, zero shots). Its four account strings were restored exactly
before the newer session began. No historical restoration was attempted over
that newer session. [Engine report](../../foxtrot/docs/m10-native-menu-validation.md)
and [retained raw evidence](evidence/m10-engine-menu-2540/README.md).
A new exact baseline and an exclusive input window are required for the final
installed replay. E36/E37 are not yet declared fully accepted. Wider Settings
layout, E38/E39 and retained equipment/save carryover remain separate.

### Final live outcome

Round one completed naturally on turn 7 with Alpha winning. All living tanks stayed live in every sample; all ten completed shot/death presentations lasted at least three simulation seconds. The results, live HUD and between-round armory were photographed and visually inspected without horizontal clipping at 1600×968 DIP. Reopening the completed save restored the same winner/series standings with **exact equality of all four installed-state keys**, proving no duplicate payout or purchase in that replay.

Round two preserved the four names/personas and series ID, but its explicit Brush request was replaced by a native cached random terrain draft and became Bunker grid. This is E40, with exact params and source ownership findings in the engine prompt. It also exposed a game-side planner bug on turn 6: one or two remaining candidates could make `angleStep` exceed the native 30° maximum. The game now clamps spacing to 2–30°, retaining the residual candidate limit. Both residual-budget regressions and strict TypeScript pass; the correction is installed and read back exactly (`planner-fix-installation.json`). The interrupted series is **not accepted as completed**, and the corrected planner has not yet completed a fresh live series.

The fresh diagnostic baseline was restored with exact raw equality, after verifying original accounts were unchanged (`restoration.json`). The two diagnostic saves are retained as E40/planner reproductions: `04621717-2bbb-4958-bddc-d64eb8bee652` (13:21, completed round) and `fc1ca2cc-3ee0-42f8-84f1-381d320fbdf1` (13:28, stopped round). No pre-existing save was deleted. The deletion confirmation was cancelled. No E2E profile or packaged build was created. Additional generation changes requested afterward are tracked separately in `m11-generation-and-source-control.md`; their staged files should not be confused with the installed planner-only hash.

Remaining native work is E37 (Settings 1.5× current width), E38 (editor Play from Title), E39 (installer wizard), E40 (terrain draft ownership), E41 (runtime seeded noise Spin/Size LFO), E42 (authored/hidden loading presentation), plus the retained disabled-equipment backlog. Full series, broad statistical balancing and the complete viewport/hardware matrix remain unaccepted.


## Engine native menus accepted on 0.0.2541

This supersedes the pending 2540 checkpoint above for the requested E36 navigation
and original E37 inner-control skin. The assistant installed signed arm64 Talus
**0.0.2541**, runtime source `4cf2e21c4924c4a7f293922e6cb1e2278fc50b0c`,
app.asar SHA-256 `79713e412541e3c6d1a32fdb20f4bcfb7236e684280a6809e43215146b070e88`.
Candidate and installed hashes match. Worker and loopback both pass 119/119;
the actual Scorched Terra public-HTTP replay passes 31/31. It covers native tabs,
key/pad remap Back and focus, seed/name/number Done/Cancel/Back, Advanced draft,
selector popup, and Saved games list/root/title return. The same native Controls
route passes after reopening the paused two-CPU ready diagnostic, with both tanks
live at zoom 0.25, turn zero and no shots. The Saved games button stays enabled.

A fresh exact four-key baseline was captured after preserving the paused editor
through `talus.editor.save()`. It was restored exactly after this replay; every
one of the 193 other save records is unchanged. The sole engine-created save
`0bb8884c-ff1c-4d23-bd0c-9dcbca52b395` was reused and retained. The app was returned
to the authored title. No profile clone or paid activity-agent call was used.
Earlier failures and the harness readiness retry remain recorded rather than
being presented as passing runs.

[Engine report](../../foxtrot/docs/m10-native-menu-validation.md),
[raw final evidence](evidence/m10-engine-menu-2541/README.md).
The newer wider Settings/layout and DPR matrix, E38/E39, retained equipment and
quiet-save carryover remain open. This is not full game-side M10 acceptance.


2541 repository gate: pushed `ea52d3b893b7e9c362d7f8a42cd24e07dfd4c885`; full suite **14,051 passed** across **1,154 passing files**, with one expected failure and 17 skipped tests (six skipped files); production build and zero-error type-check passed. [Raw push gate](evidence/m10-engine-menu-2541/pre-push.log). Installed hash was rechecked after push and still matches the accepted 2541 bundle.
