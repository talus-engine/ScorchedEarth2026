# M8 — cash and the armory

## Engine release 0.0.2498 — 2026-10-22

The M8 native capabilities and E10 damage-text correction are installed and verified in the Apple Silicon macOS release. Engine commit: **8e0b0647104ca6cb797f400e2004b1c71810998a**. Installed `app.asar` SHA-256: `9f569ededc042f0c471eff83d5a55eac211c05a6f59ad817c24b99d0d711bb0b`. This is a local ad-hoc-signed release, not a notarized/public release.

Jetpack, digger, sand, magnet, shield and ricochet are enabled in the live M8 template through public authoring APIs. Jet fuel uses native held intent, capacity 12 seconds, empty initial charge and no automatic recovery. Excavation charges only accepted native work and excludes the foundation. Sand uses the shared seeded recipe evaluator at actual impacts. Shield absorption precedes health loss; magnetic fields spend finite power on actual shells and preserve their original owners. CPU aim explicitly recognizes unsupported field prediction and uses authored exploratory powers. Prices/rates remain in `Game/shop.json`; the field cannon remains free and unlimited.

The five-CPU replay finished on turn 42 with one survivor. All 166 projectiles, including death effects, detonated and ended exactly once; hit callbacks preceded end. There were no survivor residency violations in 13,230 simulation ticks, and every recorded camera frame was at 25%. The shield absorbed exactly 60 damage and the deflector spent exactly six power before depletion. Real movement, burrowing, paid ammunition, batteries and sand banks were exercised. The final installed build then completed a fresh two-CPU match on turn 5: 15 shells, 2,640 audited ticks, no survivor parking, and two sand banks of 8,156 and 8,649 particles.

Native diagnostics additionally cover ceiling/wall collisions, exhaustion/refill, streamed fuel and defense state, save/reopen, death cleanup, posthumous ownership, physical ricochet/fuse/body/lifetime paths and an independent remote impact. That remote impact created 738 actual SAND particles which settled on 512 STONE cells without moving the camera. An earlier remote pile retained all 735 SAND and 512 STONE cells after save/reopen. The combat foundation retained all 655,360 audited cells (160 chunks) before and after reopening.

Finished-result reload did not duplicate money, scores or purchases. A real manual purchase followed by next-round navigation in 26 ms retained the ammunition; seed 123, names, carried stock and the legitimate automatic CPU purchases reconciled. Native controller/defense consumption is reconciled against installed stock so reopening older bodies cannot create free supplies. Local checks also cover insufficient funds, empty stock, self damage, duplicate callbacks and payouts.

E10 is verified visually: actual CPU damage produces one rising/fading number, a death-triggered secondary shell produces its own number, paused 900/1800 ms explicit labels expire, and a visible 30-second label is cleared by save/reopen before its lifetime. The final release's actual 54-damage shot was captured at birth, midpoint and expiry. Indigo's redundant numeric `floatText` was removed; HUD hit details and stationary speech remain.

Evidence: [acceptance](evidence/m8-engine-2498/acceptance.json), [engine validation](evidence/m8-engine-2498/engine-validation.md), [five-CPU combat](evidence/m8-engine-2498/cpu8-combat.json), [final installed combat](evidence/m8-engine-2498/cpu-final-combat.json), [purchase/navigation](evidence/m8-engine-2498/cpu8-roundtrip.json), [remote impact](evidence/m8-engine-2498/remote-impact8.json), and [damage expiry](evidence/m8-engine-2498/e10-cpu-final-expired.jpg). Raw failure reports and diagnostic saves remain intact.

Engine checks: 1,122 unit files / 13,760 tests passed, one expected failure and 17 skipped; zero TypeScript errors; production build; packaged worker and loopback smoke. Current M5/M6/M7/M8 game checks, utility-accounting checks and strict generated-API type check pass. No human or paid-agent acceptance run is claimed.

The original pre-test preferences, names, scores, economy/stock and dialogue were restored byte-for-byte in durable storage, and the app was returned to its original title screen. No profile was cloned for M8. The old inactive M5 test profile was archived, all 3,951 regular files verified by SHA-256, and only then removed; its diagnostic saves remain in `/private/tmp/indigo-m5-engine/profile-preserved.tar.gz`. Free space returned to about 18 GiB.

E14, M6's large FIRE-brush acceptance and complete E16 physical-material acceptance remain open; unavailable nuke variants remain disabled. E9 transient projectile persistence remains outside this release: save at supported quiet boundaries. Deflectors currently support native rigid-body shells only. Remote world-plane particle simulation does not add remote air/heat/EM field solvers. Shields do not suppress knockback or status riders.

The earlier 0.0.2497 investigation below is retained as historical evidence.


Implemented against installed Talus **0.0.2497**, engine commit `ff77aaf51d84716cab1df32a5ff4832c3b3ad325`, through public HTTP and scripting APIs. The engine checkout was read, not edited. [Research and prices/reward rules](m8-research.md) explain the Scorched Earth/Worms inspirations. M7 content is preserved in `fixtures/m7/`.

## Working game content

- Each remembered name gets a $600 starting wallet once. Cash rewards include firing and landing, self-damage, received damage, death, posthumous shells and utility use. Live round earnings are displayed separately and paid at the completed result, with a durable per-world receipt preventing repeat payouts.
- Opening and between-round stores show cash, stock, prices, disabled/unaffordable items and itemized round earnings. Unused money/ammo/repairs persist across worlds. Purchases use a displayed wallet revision to reject stale duplicate clicks.
- Four selectable guns: unlimited field cannon; heavy howitzer ($240/3, 120 peak damage); crumble cannon ($180/3, 65 damage, native pulverization into falling debris); excavator cannon ($120/3, broad terrain erase with zero blast damage). Each paid launch consumes one purchased shell.
- Repair batteries cost $90/two repairs and restore up to 30 hull without ending the turn. Full-health/empty-stock use consumes nothing. CPUs buy a small basket, use real engine healing, and revert to the free cannon after exhausting their selected ammunition.
- The next-round UI retains the roster and accepts a new map seed or blank randomness through the normal engine new-game path. Existing terrain, foundation, camera rules, death effects and stationary speech are preserved.

Match schema is now 8. No migration is injected into older worlds; start a new M8 game from the updated template. Wallet/stock data is installation-scoped under `indigo.economy`, alongside the existing remembered names and score data. Tests preserve the user's original M7 save separately.

## Live verification

All diagnostic matches use three CPUs and zero humans. UI actions go through real engine mouse/key input; native damage probes call `Entity.damage`, not synthetic event callbacks. No profile is cloned.

The first match (`c909c32a-e9cc-48cc-a679-56122eb73320`, seed 7) finishes on turn 8. [Opening state](evidence/m8-opening.json) verifies four carried native gun templates, correct equipped weapons and stock. Alpha buys another three howitzer shells through the store: cash drops $270 → $30, stock rises 3 → 6. An unaffordable button leaves the bank unchanged. Both free/paid gun selections operate through the HUD.

A controlled 40-HP injury before Begin sets up the CPU's first real battery repair (+30 HP); it does not earn pre-game cash. A native 10-HP self-hit during combat then earns **$60**: $20 hit + $30 dealt + $10 received. The [self-damage capture](evidence/m8-self-damage.json) also verifies one repair and one howitzer shell were consumed.

The [finished first round](evidence/m8-finished.json) contains eight primary launches: four heavy, one crumble and three excavator. Four repairs occur. Both deaths trigger ten posthumous shells; all 20 launches and landings earn their dead owners cash. Alpha earns $1,908, Bravo $854 and Charlie $818. These figures include the controlled self-hit; they are a validation fixture, not a balance benchmark. Per-player cash satisfies `600 + lifetime earned − lifetime spent`.

The [reopened result](evidence/m8-reopened.json) has exactly the same bank and scores, with no duplicate payout or repeated CPU shop basket. The real next-round button creates world `8ea08ff4-c0ca-4a76-a000-3024b01e5d91`, [round 2, seed 123](evidence/m8-round-two.json), with the same three names, full hull health, unchanged earnings history and carried stock. New CPU purchases deduct normally; no new $600 grant appears.

The [second completed round](evidence/m8-round-two-finished.json) also finishes on turn 8. Alpha fires its three crumble charges and then successfully fires the free field cannon on turn 8. Bravo fires an excavator shell; Charlie fires three howitzer shells. No script fault occurs. The observer was added late in this round, so its empty explosion log is **not** evidence of missing explosion callbacks; physical-effect evidence is collected separately with an observer installed before firing.

A third, uninjured three-CPU match (`b6bebd14-d3f4-4d76-97f9-ad452e43d5f0`, seed 7) finishes on turn 10. Its [native explosion receipts](evidence/m8-effects-finished.json) show three howitzer blasts (120 damage, radius-70 erase), two crumble blasts (65 damage, radius-80 powder mode), three excavator blasts (zero damage, radius-95 erase), two free shells, and twenty secondary death shells. The two crumble blasts process 2,471 and 2,279 terrain particles; the first two excavator blasts erase 2,846 and 1,698 cells. All **128 sampled frames** retain 25% zoom and every surviving hull within live simulation bounds. The [finished view](evidence/m8-effects-finished.jpg) records the changed terrain. All three rounds' earnings, spending, receipts and final balances reconcile.

## Dialogue correction requested during M8

Tony observed recurring phrase sequences. Inspection confirms the previous per-world deck was shuffled, but seeded from the terrain seed: replaying seed 7 reproduced the same opening sequence (`shooting-369`, `shooting-251`, `shooting-341`, …). Different map seeds produced different orders, so the problem was repeated seeded shuffles rather than sequential catalog traversal.

Dialogue now has an installation-wide deck in `indigo.dialogue`, initially seeded from the unique world ID. Firing and death each retain their own 500-line bag; draws persist immediately. New games and reopened old saves continue that deck instead of resetting it from the map seed. Exhaustion reshuffles without an immediate repeat. It remains independent of combat randomness, and speech positions/lifetimes are unchanged. Local tests cover same-seed new worlds and reload continuation as well as a full nonrepeating deck.

Two fresh CPU worlds using seed 7 verify the correction through actual primary shots: [first game](evidence/m8-dialogue-1.json) draws `shooting-199`; [second game](evidence/m8-dialogue-2.json) draws `shooting-050`. The second game's pre-shot deck equals the first game's saved post-shot deck, and its firing bag shrinks by exactly one. These are first-shot diagnostics, not additional completed-match claims.

## Automated checks and limits

`node tools/check_m8.cjs` evaluates the actual match source and covers self/any-target damage, blocked hits, duplicate death/launch/landing/end events, 100 posthumous shots, bounded live-shot receipt memory, payout idempotence including stale saves, funds/revision validation, stock, equip selection, partial/full-health repair, CPU shop receipts, case-insensitive independent wallets and names such as `__proto__`/`constructor`. The M5 layout, M6 chaos, M7 speech checks and strict TypeScript check also pass.

The all-CPU live tests exercise the store and selector in ready state. Human movement/held aim rewards and in-turn human controls are policy-checked/source-reviewed, not a new live human-play acceptance run. Mid-flight save/reopen remains blocked on the existing E9 projectile persistence issue; completed-result persistence is the verified boundary.

## Pre-patch engine status on 0.0.2497 (historical)

M8's full requested equipment set is **not complete**. Jetpack fuel (E17), burrowing (E18), sand noise/flood charges (E15), magnetic deflectors and shields (E19), and fused Bouncers (E20) are staged and unpurchasable. The [M8 patch prompt](engine-m8-patch-prompt.md) gives source findings, API contracts, integration steps and physical acceptance criteria.

Damage numbers still do not rise or expire: Tony reconfirmed E10 during this work. Include the [M7 damage-text repair](engine-m7-patch-prompt.md) in the next release. E14–E16 death-material/emitter work remains open. No game-side levitation, tunneling, field or damage-floater substitute was introduced.

## User state and preview

`docs/evidence/m8-start.json` is this session's fresh baseline, including the original M7 ready-world ID, Tony/Copper names, settings and empty scores. `tools/prepare_m8_preview.py` stops diagnostics before restoring the original installation accounts, removes diagnostic cash accounts, and creates/saves/reopens a fresh M8 ready game for those two CPUs. Each gets the legitimate one-time $600 grant and makes its normal opening purchase. The original M7 world is preserved. The new dialogue deck retains already-seen phrase indices, contains no diagnostic player names, and continues into the preview.

Final ready-state and shop imagery are retained in [preview evidence](evidence/m8-preview-ready.json) and the [armory screenshot](evidence/m8-preview-ready.jpg). No browser/E2E profile was copied. Free disk space remained about 22 GiB during the checks.

The first preview-preparation attempt failed safely: the UI input driver appended values, and setup rejected a 2030-second turn before deploying. Account restoration attempted during editor startup also did not survive the following navigation; its precise binding/write timing was not isolated. [Retry evidence](evidence/m8-preview-retry.json) retains those observations. The corrected preparation uses the fully booted original ready world, verifies account writes in the installed-state database before navigation, and uses the already-populated names/count/time fields. This diagnostic readiness/input issue is not presented as a demonstrated gameplay wallet-loss defect.
