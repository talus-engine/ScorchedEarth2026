# Scorched Terra backlog after M9

Current work is tracked in [the post-M11 game plan](post-m11-plan.md), with website publishing and isolated simulated menu scenes appended as items 8–9. The [M12 engine prompt](engine-m12-patch-prompt.md) covers these new contracts, WFC integrity repair, powder support (E48) and drain category filtering (E49). [M12 game validation](m12-game-validation.md) records installed policy and pending acceptance. The older disabled features below remain separate carryover.

M9 was closed by the user at the [delivered 0.0.2530 scope](m9-closeout.md). These original-request items remain unimplemented or need further acceptance. The requested **arcade overhaul comes first in the [M10 task list](m10-plan.md)**, followed by the seven previously proposed game-side tasks. The engine carryover below remains open.

## Equipment still disabled

| Native contract | Equipment |
|---|---|
| E23 — beams and underground projectiles | Laser; Baby Digger; Digger; Heavy Digger; Baby Sandhog; Sandhog; Heavy Sandhog |
| E24 — consumable next-shot modifiers | Heat Guidance; Ballistic Guidance; Horz Guidance; Vert Guidance; Contact Trigger |

Keep these entries non-purchasable until actual native behavior and finite inventory consumption are validated. Existing homing rockets and the Lazy Boy aiming aid do not substitute for attach-to-next-shot accessories. The [historical engine prompt](engine-m9-patch-prompt.md) retains the intended generic contracts.

## Death effects still disabled

- **E14:** actual color-preserving dynamite/acid hull conversion, ignition, and the dynamite finale of Last Laugh.
- **Remaining E16 acceptance:** Furnace, Thermite, Oil, Volcano, Cryo and Sprinkler. Verify sustained emitters and physical material interactions, not just particle counts. Retain the successful native FIRE-brush evidence and the limitations of remote heat/air/EM simulation.

The authoritative enabled flags remain in `world/Game/chaos.json`: five effects enabled, nine disabled.

## Retained investigations and future capabilities

- **E9:** full persistence of in-flight native projectiles/casts and descendants. The shipped game uses explicit save barriers and supported quiet save boundaries.
- **E21 hard seating:** retain the captured native failure for engine investigation. The shipped policy deliberately uses bounded best-effort righting and does not call terrain seating or gate movement/firing on flatness.
- **E22 broader procedural acceptance:** current game code includes native neural passes and living oak/bramble jobs. Complete the broader source/seed/visitation/persistence matrix and any additional lazy generation or guided mountain-source work before claiming every original terrain-generation requirement accepted.
- **Temporary asset files:** investigate repeated `.com.talus.editor.*` extraction/copy accumulation. The earlier cleanup removed 93,495 stale files, with large samples identical to `manifests/assets.json`. See [disk evidence](evidence/disk-cleanup-2026-10-23.json). The responsible lifecycle path was not established by that audit.
- **Historical observations:** preserve the earlier Nuke-specific dead-hull fall-through and rain-associated early MIRV contact evidence. Subsequent native holds/contact filters are shipped; those changes alone do not prove each original observation's root cause.

Use fresh account baselines for future diagnostics. Do not replay historical restoration scripts over later player progress. Keep profiles and evidence bounded.
