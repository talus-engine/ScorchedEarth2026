# M2: seeded arena and match setup

**M2 accepted on installed 0.0.2496, 2026-10-22.** E6/E7 now pass all seven independent authority/reload checks in the actual Indigo save, alongside a fresh 14/14 terrain/roster audit. See [the updated engine work log](engine-work.md) and [reload evidence](evidence/m2-2496-verified-reload.json). The original 2495 findings below are historical. [M3 combat is now verified](m3-results.md); `fixtures/m2/` retains this milestone's files.

Verified 2026-10-22 on installed Talus **0.0.2495**, matching local engine `main` `aef4c32cf`. The local build is sufficient for development; the earlier remote-ref discrepancy does not invalidate these results.

**Arena and setup work. M2 remains open for engine hot-reload fixes E6/E7.** The game is left in a working deployed match with its HUD and six event handlers restored through a normal reopen. The editor availability and cross-world reload problems remain reproducible; reopening for continued inspection is not an engine fix.

## Implemented

- One biome, **Slate Reach**, covering 50×5 WFC tiles. Each tile is 4×4 chunks, or 256×256 pixels; arena bounds are `(0,0,12800,1280)`, with horizontal wrapping disabled.
- Twenty SVG-authored tiles: empty sky, full stone, and eighteen compatible surface shapes. Two sky rows, one connected surface row, and two solid foundation rows. Each surface has a central plateau for tank placement. All 250 anchors use the same biome.
- A custom main/setup menu for explicit or random seed, human/computer counts, names, and turn duration. The current configurable game cap is 16 players, with at least two required; this is not an engine limit.
- Durable spawned tank roster in global game state, with names, control role and initial aim/power on NPC blackboards. Installation-level preferences remember names and setup selections between matches.
- One cannon and explosive shell cloned from the accepted M1 assets. Production IDs are separate from the preserved M1 fixtures.
- HUD showing selected tank, angle, power, configured turn duration, seed, biome and count. Previous/Next tank buttons move the camera and restore the selected entity; New match opens remembered setup preferences.

The duration is currently a **configured value, not an active countdown**. This milestone deploys and inspects tanks. Timed turns, movement/aim/fire controls, AI graphs, Ink interactions, OOB elimination, victory and persistent scores are subsequent game work. Initial HUD aim values are fixed at 45°/70%; turn logic will publish selected blackboard values and reapply transient weapon aiming when controlling a restored tank.

## Verification

Four fresh deployed games and one save/reopen audit each passed all 14 terrain/roster checks. They cover every surface column, all 49 surface joins, empty sky, solid bottom, no terrain beyond the horizontal bounds, varied terrain, requested control counts, unique durable identities, tank placement/health, retained blackboards, cannon restoration, installed names and no reported script faults. These are sampled surface profiles, not full per-pixel terrain hashes; M1's full chunk-integrity proof remains separately preserved.

| Case | Seed | Humans / computers | Retained save |
| --- | --- | --- | --- |
| Initial deployment | 0 | 1 / 1 | `b6b67417-05fe-429d-a389-881a1202988e` |
| Repeated seed, larger roster | 0 | 2 / 2 | `a0eba9e7-156e-49e6-972f-5f442b52ec81` |
| Different seed | 1 | 0 / 2 | `f45ab2a5-173d-4951-9971-316a9b1e207f` |
| Blank/random seed, then reopen | 1792658647906 | 2 / 0 | `95db4a54-184a-4cfd-9156-89d0cc25a717` |

The two seed-zero games produce identical terrain profiles despite different rosters. Seed one produces a different profile; blank seed selects a fresh numerical seed and different profile. The normalized comparison excludes tile-center samples because `findSurface` can see a live tank's body there. Current audit samples are outside its footprint. See [seed comparison](evidence/m2-seed-comparison.json) for hashes and exact checks.

The four-player UI test deployed Tony, Ada, Copper and Slate, remembered those names on reopening setup, and moved from Tony to Ada through the actual Next tank button. See [remembered menu](evidence/m2-names-menu.png), [deployed HUD](evidence/m2-four-ready.png), and [button result](evidence/m2-next-tank.json). The random game's exact roster, setup, sampled terrain, installed preferences and cannon inventories survive save/reopen; no duplicate tank IDs were introduced. See [lifecycle evidence](evidence/m2-lifecycle.json).

TypeScript checking against the installed `talus.d.ts` passed with zero errors. Python authoring/audit helpers compile. An initial audit assumed stored entities exposed live weapon state; that harness assumption was corrected by visiting each tank before reading its weapon. The partial `m2-seed0-first.json` is retained as an interrupted trace, not an acceptance report. A separate invalid UI launch caused by the bridge's failed Cmd+A selection was correctly rejected by the game's roster validation.

The first game's 14 data checks pass even with zero script handlers after E6/E7; **no reported script fault is not proof of functioning gameplay**. Later fresh games and normal reopen have six registered handlers. The controlled defect reproduction explicitly checks this distinction.

## Engine handoff

[The focused patch prompt](engine-m2-patch-prompt.md) records E6, where editor availability becomes true in a game, and E7, where writing a different world's script reloads the active game. A controlled unchanged-source template write returned `reloaded: null`, yet active handlers dropped from six to zero and the UI became `{}`. The roster remained intact. Source locations, preserved evidence and release acceptance are included. Secondary input-tool, activity-agent and save-timing observations have separate certainty labels.

No engine source was changed for M2. No game-side mode guard bypass, terrain repair or whole-arena residency workaround was added. The final [working screen](evidence/m2-final-screen.png) and [handler status](evidence/m2-final-status.json) were captured after normal reopening.

## Files and next work

`tools/install_m2.py` authors the arena through HTTP/editor operations and installs `world/Game/arena.json`, `world/Scripts/match.ts` and the two menus. It backs up the previous template layout; the accepted M1 save `2c5632cb-1eea-47d4-aed1-b38c0ffa7331` remains preserved. `tools/audit_m2.py --label <new-label>` checks the currently deployed match and refuses to overwrite an existing report. `tools/launch_m2.py` is a diagnostic UI driver tied to the observed window/menu geometry, not part of shipped game logic.

After the engine release, verify other-world writes leave the active match alone and current-world reload rebuilds UI/handlers while retaining the roster. Then add the tick-driven turn state machine: focus/restore tank, timed positioning/aiming, fire once, follow projectile, wait for damage and settling, resolve elimination, advance or finish. Behavior graphs and Ink can then drive computer turns and match flow around those same durable state transitions.
