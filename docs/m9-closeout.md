# M9 closeout

**M9 is closed at the delivered scope, following Tony's instruction that M9 is complete.** The remaining original-request items are retained in the [backlog](backlog.md); closing the milestone does not claim those features are implemented.

Installed release: **Talus 0.0.2530**, source commit `7c55ffbb125891b5be680bce1100e1c085d3e49a`. Independently checked app.asar SHA-256: `503b8e83576ae88107b13dcc85e14d090b4834c611eb62d4f8e1632c8bce1e6e`, matching the packaged acceptance report. The engine repository also contains the subsequent evidence-only commit `9cf7fe231`.

## Delivered

- Independent native world text for dialogue: 36 CSS pixels, 720-pixel wrapping, separate from unchanged tank names/health bars. Camera positioning and a minimum three-simulation-second interval precede shooting and death effects. Native holds retain the actual hull during queued last words.
- Native passive posture and voluntary R/HUD righting, used by CPUs too. Initial placement is bounded and best effort. The final policy does not require terrain seating or flatness to deploy, move or fire. Aim is relative to the world horizon even on a tilted hull.
- **35 enabled weapons and 12 utilities**, including the original M9 arsenal plus Riot Charge/Blast, Dirt Charge, Earth Disrupter, Parachute and Fuel Tank. Riot wedges convert eligible terrain to actual SMOKE; Dirt Charge fills empty cells; Earth Disrupter fractures matter into native bodies and bounded loose debris. Disabled items cannot be purchased.
- Finite native propulsion, levitation, excavation, fall braking, shields and magnetic defenses, with persistent wallets and supplies. Auto Defense and Lazy Boy remain game policy over native components.
- WFC and Brush Reach generation coexist. Current Brush Reach code requests native semantic/noise recipes, neural detail passes and bounded living oak/bramble sites, preserving the foundation and combat exclusions. Broader procedural acceptance remains separately listed in the backlog.
- Engine-generated parallax and weighted clear/rain weather. The horizontal-tiling renderer fix is included in the installed source. Native material collision filters avoid treating every loose liquid particle as solid terrain.
- Five enabled death effects, retained projectile ownership and bounded attack/aftermath waits. Native and game save barriers prevent unsupported saves during active volleys and jobs. Indigo tanks no longer drop their inventory as stray weapon pickups on death.

## Evidence and limits

The [2530 acceptance](evidence/m9-terrain-2530/acceptance-2530.json) records a four-CPU game finishing naturally on turn 20: 120 launches and 120 unique ends, zero survivor residency violations over 12,114 observed ticks at 25% zoom, all twelve paid terrain operations completed, and all 327,680 central foundation cells preserved. Completed-match bank, roster and foundation survived save/reopen. The native Earth operations retained 4,683 selected cells as 4,463 body cells and 220 loose cells.

The release report records 13,935 engine tests, one expected failure and 17 skipped; zero TypeScript errors; production build; and packaged worker/loopback checks. These are retained engine-agent results, not a new execution of that full suite during closeout.

Earlier scoped acceptance covers [world aim and best-effort placement](evidence/m9-world-aim-2516/aim-best-effort-2516-acceptance.json), [death inventory policy](evidence/m9-death-loot-2527/acceptance-2527.json), [ground fuel](evidence/m9-engine-candidates/ground-cpu-acceptance.json), [parachutes](evidence/m9-engine-candidates/parachute-cpu-acceptance.json), and [contact filtering](evidence/m9-engine-candidates/matter-cpu-acceptance.json). Historical failures and the original M9 diagnostic runs remain in [M9 results](m9-results.md).

Closeout checks passed: `node tools/check_m9.cjs`, `node tools/check_m9_generation.cjs`, and `node tools/check_m8_utilities.cjs`. The older utility fixture lacked the newly required native-controller methods; it was updated and now checks ground-work debits, older-state reconciliation, parachute consumption/refusal, motor cancellation and the existing M8 utility contracts. No production game code was changed during closeout.

The HTTP bridge was offline (connection refused), so no fresh live readback or CPU replay is claimed for this closeout. Package identity, workspace content, local checks and retained acceptance were verified. No app navigation, account restoration, profile cloning or new purchases were performed. The latest engine-agent [restoration report](evidence/m9-terrain-2530/restoration-after-terrain-2530.json) records exact serialized restoration of its fresh baseline.

The explicit carryover is twelve disabled equipment entries, nine disabled death variants, optional mid-flight persistence, the retained hard-seating investigation, broader procedural acceptance and temporary-file lifecycle cleanup. These are future work, not silently accepted features. No next milestone has been started.
