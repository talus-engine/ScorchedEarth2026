# Indigo M1 — verification of build 0.0.2494

**22 of 23 distinct replay checks pass. M1 remains blocked by one terrain-integrity failure.** Engine source is `adf204861`; the installed app matches the local packaged artifact. The engine agent's separate candidate validation recorded 48 passing checks.

| Check | Actual Indigo result |
| --- | --- |
| Corrected WFC import and normal x=400 start | Passed; live WFC area and full starting ground |
| Long-range shot with shooter unloading | Passed |
| Target restoration, two damaging hits, death, one survivor | Passed |
| Durable projectile owner, damage source and killer | Passed with shooter stored |
| Hit callbacks and hit-before-end ordering | Passed for both damaging shots |
| High arc and four impact settle watches | Passed |
| Three camera-only returns to home ground | Passed, complete material-cell comparison |
| Survivor identity, 100 HP, inventory and blackboard after save/reopen | Passed |
| Target remains dead after save/reopen | Passed |
| Home ground and intentional craters after save/reopen | Passed, exact audited material cells |
| Untouched corridor near x=3200 | **Failed: one entire 64×64 chunk is absent** |

The missing chunk is `(50,10)`, pixels x=3200–3263, y=640–703. All 4,096 expected stone cells are absent; neighboring audited chunks remain full. Impacts were near x=4594–4686, with carve radius 48, so they do not explain the distant square hole. It persists after reopening. The corridor was first audited after the shots; the exact moment of loss remains unobserved.

A fresh same-template/same-seed game has full stone in the affected region and keeps it through three camera-only trips without shots. Reopening the combat save restores the hole. This rules out a permanently empty authored tile; the remaining runtime cause needs investigation.

- Combat save: `5c0bd082-1ae1-4301-b719-fadeb0d7715a`.
- No-shot control: `9b903c72-7b0b-4407-ba1f-1dfbe2314662`.
- Template: `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`; seed 1729 in both.
- The app is left in the combat save, camera centered on the hole at `(3200,640)`.

See the [focused follow-up](engine-patch-followup.md), [23-check summary](evidence/m1-2494-summary.json), [complete replay](evidence/m1-2494-replay.json), [control](evidence/m1-2494-fresh-terrain-control.json), and [screenshot](evidence/m1-2494-missing-chunk.png). [Pre-patch results](m1-prepatch-results.md) remain preserved.

The replay runner's navigation-readiness interruptions were corrected and remaining checks resumed; they are not counted as engine regressions. No terrain workaround or new engine source patch was applied. Menus, full 50×5 map, AI graphs, Ink flow and production scoring remain later game work.
