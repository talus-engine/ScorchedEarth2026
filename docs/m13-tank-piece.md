# M13 — Scorched Terra tank piece

## Current checkpoint — 2026-10-25

Talus 0.0.2572 is installed. Generated **41 reusable parts** through its native
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

The cosmetic rig builder is prepared locally: 22 tread links, four wheels,
hinged jet pods, seven clips and native animation layers. **It is not installed.**
The original tank/controller remains in use until E57 provides its native
pose/ownership contract and E58 allows the exact 3×1 tread art. No substitute
track image or scripted pose loop has been added. `build_m13_rig.py` refuses
missing art and marks output as blocked without the confirmed engine contract.

Confirmation so far: all generated art inspected as a contact sheet; all 36
weapon patches read back with gameplay fields preserved; Python tools compile.
Eight weapon bodies were briefly spawned in the paused editor and removed;
the capture did not provide a clear rendered-art result, so final native visual
acceptance is still pending. The editor has no remaining diagnostic entities,
is paused, and its view was restored. No game/account diagnostic or WFC painting
was performed. No new published package has been exported.

ENGINE received E57/E58 and the generic-entity cosmetic-body requirement in
`AGENT_CHAT.md`. The editor/API lease has been returned for native work.

## Native implementation

Use Talus's native animated multi-part entity. Tracks are visual only; existing
character movement, terrain stepping, fuel, health and combat remain owned by
their native systems. Preserve the user's minimal confirmation workflow.

Art comes from the engine's configured `gpt-image-2` API. Reuse repeated parts
instead of generating every tread instance separately. Keep native-size art:
3×1 tread links, approximately 5×5 wheels, 5×7 jet pods and small weapon bodies.
Use an approximately 40×24 assembled silhouette. Preserve per-persona color
variants using color changes independent of element assignments.

Native animation layers:

- Locomotion: idle/run blend from `speed`, with circulating tread-link poses
  and wheel rotation. Clip duration is tuned to the existing 55px/s controller.
- Jetpack: folded/deployed transitions from actual native `levitating`, masked
  to the two pods; local rotation and a native flame sprite layer during thrust.
- Weapon: existing world-relative turret aim and native equipped-item sprite.
  Every enabled weapon receives distinct small generated art while retaining
  its template ID, projectile behavior, inventory and prices.
- Action: small native recoil/hurt poses where they do not conflict with aim.

Read authoring guidance in the engine's `ANIMATION_PROTOCOL`, Casting, Costume
Designer and Image Generation specialist blocks, and the animation provider
rig prompt. Use native frame import/binding and animation records. Do not add
a script-rendered tank or script-owned pose update loop.

The current source composition issue is handed to ENGINE in
[M13 E57](engine-m13-patch-prompt.md). Full mechanical track physics is expressly
outside scope. Keep working on art/rig data while the engine resolves it.

After the engine handoff: generate `tread-link` through the corrected native
importer, record the confirmed E57 schema, build and install one owned prototype,
then apply the rig to the base and 16 persona variants with their existing
colors. Preserve each current template's non-art gameplay fields. The exact
pre-M13 base is retained in `assets/m13/before/tank-base.json`; fetch current
records before installation so newer authoring changes are not overwritten.

Minimal finish check: inspect the native tank at a readable zoom; move left and
right, stop, thrust/release, switch representative weapon shapes and shoot once.
Confirm correct part scales and attachment on a slope. Preserve one screenshot
and a compact installation manifest, then commit. No broad gameplay matrix.
