# Indigo M1 results — 2026-10-21

The two-tank physical demonstration reached a kill and one survivor. **M1 acceptance is blocked by engine defects**, with disappearing terrain the release blocker. No engine fix is running or released.

| Check | Observed result |
| --- | --- |
| Spawn two tanks with cannon inventories and NPC blackboards | Passed on generated ground at x=3200; normal x=400 start fails |
| Camera follows a long-range shell while shooter unloads | Passed; flights exceeded 4,000 pixels |
| Target restores before collision | Passed |
| Direct hit and health reduction | Passed; first damaging hit dealt 60.6066, leaving 39.3934 HP |
| Death and one surviving roster member | Passed; second damaging hit killed target |
| Crater carving and local settle watch | Six completed shots; all settled in 24–30 ticks |
| High arc above the terrain rectangle | Passed; sampled as high as y=-1219.49 |
| Steep shot clears the pit | Passed on shot 6 |
| Entity identity, health, inventory, names, blackboard markers across streaming | Passed; shooter retained 100 HP and cannon, target retained death state |
| Untouched terrain survives streaming | **Failed: square chunks disappear, shooter drops 64 pixels** |
| Durable projectile owner and damage/kill credit | **Failed when shooter parks** |
| Projectile hit callbacks for deferred explosions | **Failed on both damaging shots** |
| Script execution | No engine-reported script faults |

The first two shots calibrated the landing point; shots 3 and 4 used 99% power at 30 degrees elevation and hit. Shot 5 tested 60 degrees; shot 6 repeated that elevation from the newly formed pit. The camera-only round trip between those last tests retained the pit, and Tony reported additional missing terrain. This is a diagnostic location, not a workaround adopted for the final game.

The final diagnostic save remains loaded with the camera returned to the survivor. Its ID is `13af8ed1-c493-4ff9-9253-5db2dd8b1b2d`; seed is 1729. The shooter is alive at approximately `(3199.5,689.99)`; the target is dead and stored. No production winner/score UI has been implemented or credited from the broken kill source.

See the [engine patch prompt](engine-patch-prompt.md), [engine work log](engine-work.md), [machine-readable observations](evidence/m1-observations.json), and [complete event trace](evidence/m1-completion.json). Camera residency was exercised live; save/reopen combat persistence, live-ID reuse, menus, AI behavior graphs, Ink flow, and the full 50×5 map remain later validation/work.
