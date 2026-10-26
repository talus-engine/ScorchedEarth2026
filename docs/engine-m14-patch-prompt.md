# M14 — native title particles and controller collision filtering

Two concrete cases on Talus **0.0.2575**, source
`d35ac9a245f031d568afe2854f01bce9a455bc2c`. E57/E58 remain withdrawn;
do not implement a new animation ownership model or tiny-image generator.
Finish the separate WFC reroll release first. Coordinate UI ownership through
the ignored root `AGENT_CHAT.md`.

## 1. Imported colored particles and emitters in `menu:title`

The user wants the generated **Scorched Earth 2026** logo to be real particles
in the isolated title scene, retaining imported RGB independently of element:

- Top quarter: project element `TERRA_FIRE_SOURCE` (225), a FIRE emitter.
- Next quarter: `METHANE` (33), ordinary gas, not a methane emitter.
- Bottom half: `TERRA_WATER_SOURCE` (223), a WATER emitter.

Prepared 512×256 transparent band images and placement (64,20) in the existing
640×384 scene are listed in
[`assets/m13/title-particle-logo.json`](../assets/m13/title-particle-logo.json).
`tools/prepare_m13_title_particles.py` copies nearest-sampled source RGBA without
recoloring; reassembling all three bands is byte-exact. Transparent pixels must
remain empty. Assets live under `world/Menus/Assets/earth-2026-logo-*.png`.
The current HTML logo is a temporary visible title, not a claimed particle implementation.

Confirmed limitations, including ENGINE's 2026-10-26 00:55 response:

- `MenuSceneStamp` supports rectangle/circle only; no imported RGBA raster.
- Public `engine_menu_scene` validation rejects `stamp.color` as unsupported.
- It rejects `TERRA_FIRE_SOURCE` because spawner simulation is unsupported.
- `MenuSceneDomain` does not install the spawner host and rejects CA behaviors,
  including reachable reaction products. Ordinary world import is a different
  domain and cannot implement the isolated title scene.

Raw public refusals: [source validation](evidence/m13-native/title-source-validation.json),
[color validation](evidence/m13-native/title-pixel-color-validation.json).

Extend the existing scene definition and public authoring API with a bounded
image-to-particle route using world-owned files. Preserve source pixel colors
while assigning an element separately. Reuse native spawner semantics within
the isolated scene; do not run a second full game world or let menu particles
interact with gameplay. Support native methane/fire reactions. Preserve pause,
loop/reset, teardown, export and Website resource resolution. Expose the schema
in generated docs and validation, with explicit image/particle/work budgets.
Avoid a per-logo schema or thousands of custom colored element definitions.

Minimal acceptance: import these three assets, sample several known pixels
before stepping to show unchanged RGB and correct element IDs, then show fire
and water emission plus methane simulation. Close/reopen/reset the scene and
confirm isolation and bounded work. GAME will then replace the HTML logo with
the actual native particle scene using the published contract.

## 2. CCT collides with its own decorative jointed bodies

The user's tracks/wheels are real rigid bodies on joints, animated with native
clips; they neither propel the tank nor need terrain contact. The existing
floating CCT remains the movement controller. Native rendering, hinge motors,
levitation-driven pod articulation and horizontal weapon aim already work.

Owned installed prototype: `df65c209-6090-469e-8f83-6936f09491ed`.
Original tank: `b6653dd5-74e8-416b-beac-4a1a7d325cc7`.
Exact authored template, clips/controller and proposal are under
`assets/m13/{templates/tanks,animations,rigs}/` with that prototype ID.
Decorative bodies use `maskBits: 0`, zero gravity and native joints.

Native same-world comparison on one flat platform, no match scripts:

| Case | Result after 60 ticks at speed 55 |
| --- | --- |
| Original tank | x499.5 → 554.2169; 54.7116 ground-drive distance; fuel spent |
| Jointed prototype | x649.5 → 649.5; distance 0; no ground fuel spent |
| Prototype with **all** animation layer colliders disabled | x749.5 → 749.5; distance 0 |

Both prototype cases falsely report grounded while suspended above the platform
at y445.6805; the original settles at y484.9999. All drive calls were accepted.
Levitation consumes fuel and articulates pods but does not translate the hull.
The temporary collision-layer edit was reverted and read back exactly.

Evidence: [comparison](evidence/m13-native/drive-comparison.json),
[all layer colliders disabled](evidence/m13-native/drive-without-layer-colliders.json),
[body inventory](evidence/m13-native/bodies.json),
[native screenshot](evidence/m13-native/drive-comparison.jpg),
[thrust](evidence/m13-native/thrust-action.json).
`tools/review_m13_rig.py` supplies guarded no-match setup/platform/spawn/movement
stages. Fresh raw account equality is checked on return; never restore an older
account snapshot. No roster template has received this rig yet.

Source points to `crates/talus-core/src/physics.rs`, `tc_phys_cct_move` around
line1250: its shape-query filter excludes only the root rigid body and applies
the semisolid predicate. It does not apply the same-entity/decorative collision
policy. `ColliderBuilder.ts` maskBits controls solver groups; the query ignores
them. Disabling animation shell collision does not remove real child-body
colliders. This is a source-backed diagnosis; confirm the specific collider
hit before changing the filter.

Make the native character query honor existing collision ownership/filtering
semantics. Same-entity decorative bodies must not block the controller; ordinary
terrain and other collidable entities still must. Keep semisolid, step/slope,
wall, fall and collision-audio behavior. No fake NPC flags, script-owned poses,
colliders moved away from their sprites or new locomotion system.

Minimal acceptance: original and prototype both fall onto the platform and move
left/right; prototype levitates and settles; joints and native animation remain
attached. Check one real obstacle and another collidable entity to guard against
globally disabling collision. Return an installed build and public contract
only if it changed. GAME will then install the existing rig across the roster.
