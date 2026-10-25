# M5 engine release: 0.0.2497

Engine commit: `ff77aaf51d84716cab1df32a5ff4832c3b3ad325`.
Installed `/Applications/Talus.app` app.asar SHA-256:
`79c695fa6099d65f6470d3454a59997b8254651f0b4d2c21915dfa3e986596ba`.
Local Apple Silicon release; ad-hoc signed, not notarized or publicly published.

All 44 recorded acceptance checks pass. The actual packaged course clears
single-pixel obstacles and four-/ten-pixel steps, returns over them, and
stops at the forty-pixel wall. A fresh tank also crosses a 48-pixel-wide
one-pixel ledge. Different skin/step profiles work in either registration
order. A streamed actor restores its durable identity, skin and 100 HP.
The mixed stone/sand ramp passes both ways.

The game now requests real 0.25 zoom and updates its surviving-roster camera
frame every simulation tick. Shell/impact focus is constrained by that
frame. The M5 shell opts into bounded independent flight streaming. No M4
assets or terrain were repaired, deleted or kept wholly resident.
Two-, four- and sixteen-CPU combat runs finished with one survivor; every
observed surviving tank stayed live. The clean four-CPU run took ten turns,
the sixteen-CPU run thirty, and the installed two-CPU run three. High and
long shells left the camera ring, physically returned/impacted, and resolved
once. The full remote crater material census survives save/reopen exactly.
At 800×600 the HUD reports that the roster cannot all fit onscreen while
the simulation frame still retains every survivor.

The installed two-CPU replay also verified script reload, identity/health,
HUD, real menu input, and 25% zoom after save/reopen. Original names/settings
and scores were restored exactly. The installed app is left at a fresh
ready game, `b29dda01-c94c-4410-9d1f-a50ea1f51e94`, with Tony and Copper,
zero humans, thirty-second turns and seed 7.

Updated production files: `world/Scripts/match.ts`, `world/Menus/hud.html`,
`world/Game/arena.json`, `assets/m5-ids.json`, and `tools/install_m5.py`.
The diagnostic runner adds explicit `--course-offset-x` and `--stream`
options; these affect only its extra unscored test NPC. Reproduce the
installed course with a fresh short label:

```sh
python3 -u tools/probe_m5_movement.py --label fresh-label --version 5 --course-offset-x 1000 --stream
```

[Acceptance and hashes](evidence/m5-engine-2497-acceptance.json) and
[raw diagnostics/harness archive](evidence/m5-engine-2497-diagnostics.zip)
retain successful and invalid attempts. Invalid measurements included an
unloaded GPU window, a corpse occluding two terrain cells, a paused test,
and menu coordinates after an error row changed the layout. The corrected
checks and limitations are documented in the engine's
`docs/indigo-m5-engine-validation.md`.

All 153 pre-existing evidence files still match their original SHA-256
hashes. Existing saves and `fixtures/m4/` remain intact. In-flight transient
shell persistence is still outside this patch; off-grid loose GPU matter
remains held while rigid physics, carving and damage run.
