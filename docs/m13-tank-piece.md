# M13 — Scorched Terra tank piece

## Current checkpoint — 2026-10-25

Generated **41 reusable parts** on Talus 0.0.2572 through its native
`generate_entity` API with the Image Provider control confirmed as
`gpt-image-2`: all 36 enabled weapons plus chassis, turret, wheel, jet pod and
flame. Seven source-board receipts, exact prompts, native pixel records and
lossless native-size PNGs are retained under `assets/m13/`.

All 36 weapon sprites are installed into their existing template IDs. Each
native readback matches the authored pixels and preserves every non-art field,
including item data, projectile mods, ammunition behavior and prices. The
generated RGB remains independent of the existing solid material. See the
[art sheet](../assets/m13/contact-sheet.png) and
[installation receipt](../assets/m13/weapon-install.json).

The revised rig builder uses existing native support: two rigid track modules,
four hinged wheels and two hinged jet pods. Each module displays twelve 3×1
tread links through native frame animation. Wheel and pod motion uses native
hinge-motor clips. Decorative bodies have `maskBits: 0` and no gravity: they
remain real jointed rigid bodies without terrain contact or propulsion.
The rig is **prepared, not installed**. There is no established engine blocker.
The 3×1 tread image remains to be generated/imported through a supported native
route. The original tank and floating character controller remain in use.

Confirmation so far: all generated art inspected as a contact sheet; all 36
weapon patches read back with gameplay fields preserved; Python tools compile.
Eight weapon bodies were briefly spawned in the paused editor and removed;
the capture did not provide a clear rendered-art result, so final native visual
acceptance is still pending. The editor has no remaining diagnostic entities,
is paused, and its view was restored. No game/account diagnostic or WFC painting
was performed. No new published package has been exported.

The premature E57/E58 handoff has been put on hold in `AGENT_CHAT.md`. Those
source observations are not release requirements. ENGINE currently holds the
editor/API lease for its separate WFC work; GAME will prototype after handoff.

The prepared installer validates and saves the native clips/controller before
attaching them, backs up each template and compares non-art fields after saving.
`tools/review_m13_rig.py` supplies separate one-second movement/thrust stages in
one no-match diagnostic save. It captures a fresh account baseline and compares
all four raw keys when returning to the original editor. It has not been run.

## Native implementation

Use Talus's native animated multi-part entity. **Tracks and wheels are rigid
bodies connected by joints.** Animate their motion approximately with movement
speed. They do not provide traction or propulsion; the existing floating
character controller continues to move the tank. Use existing native body,
joint and animation features. Preserve the user's minimal confirmation workflow.

Art comes from the engine's configured `gpt-image-2` API. Reuse repeated parts
instead of generating every tread instance separately. Keep native-size art:
3×1 tread links, approximately 5×5 wheels, 5×7 jet pods and small weapon bodies.
Use an approximately 40×24 assembled silhouette. Preserve per-persona color
variants using color changes independent of element assignments.

Native animation layers:

- Locomotion: idle/slow/run blend from `speed`, with a circulating tread pattern
  and wheel rotation. The full-speed belt animation travels about 55px/s;
  the four wheel motors turn at 27.5 radians/s for the generated 4px wheels.
- Jetpack: folded/deployed transitions from actual native `levitating`, masked
  to the two pods; local rotation and a native flame sprite layer during thrust.
- Weapon: existing world-relative turret aim and native equipped-item sprite.
  Every enabled weapon receives distinct small generated art while retaining
  its template ID, projectile behavior, inventory and prices.

Read authoring guidance in the engine's `ANIMATION_PROTOCOL`, Casting, Costume
Designer and Image Generation specialist blocks, and the animation provider
rig prompt. Use native frame import/binding and animation records. Do not add
a script-rendered tank or script-owned pose update loop.

First author one owned prototype using existing native body/joint animation,
including the current hinge-motor animation path where appropriate. Do not
require a new engine schema. Only a concrete failed native case can justify
reopening [the retained investigation notes](engine-m13-patch-prompt.md).

Generate/import `tread-link`, build and check the native prototype,
then apply the rig to the base and 16 persona variants with their existing
colors. Preserve each current template's non-art gameplay fields. The exact
pre-M13 base is retained in `assets/m13/before/tank-base.json`; fetch current
records before installation so newer authoring changes are not overwritten.

Minimal finish check: inspect the native tank at a readable zoom; move left and
right, stop, thrust/release, switch representative weapon shapes and shoot once.
Confirm correct part scales and attachment on a slope. Preserve one screenshot
and a compact installation manifest, then commit. No broad gameplay matrix.
