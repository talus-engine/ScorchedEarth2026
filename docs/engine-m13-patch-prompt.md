# M13 — native articulated animation composition

The next Scorched Terra feature uses native layered entity components, joints,
animation clips/controllers and native locomotion/levitation/attack parameters.
The user explicitly clarified that tracks are **cosmetic animation**, roughly
matching character movement speed. No physical track traction, new vehicle
controller or dynamic living-character child bodies are requested.

## E57 — preserve local animated poses through joint anchoring

Source audit on the M12 candidate identifies an existing composition problem:

- `src/animation/EntityAnimator.ts` `applyPoses()` computes animated child
  translation from spawn position plus clip offsets and writes velocity.
- It then calls `anchorRiggedLimbs()`, which overwrites that translation with
  the first hinge's anchored position, discarding the clip offsets.
- `anchorRiggedLimbs()` uses the root transform for anchor A even when
  `hinge.bodyA` is an intermediate component.
- Clip `angle` is mirrored but otherwise world-oriented. There is no authored
  local-space mode for a component that must rotate with a tilted chassis.

These are source findings, not yet a live tank regression. Confirm with one
small native fixture before changing semantics. This must be fixed in the
native animation evaluator; do not ask the game to reposition parts per tick.

Provide a coherent, documented opt-in local/hierarchical pose contract if the
existing world-space behavior must stay compatible. Compose parent transform,
local joint pivot, neutral part pose, clip offsets/rotation and facing once.
Resolve actual joint parents in a deterministic order, handle invalid/cyclic
rigs explicitly, and make anchoring and clip evaluation share the final writer.
Preserve intentionally world-targeted aim/held-weapon behavior.

The concrete game case is a roughly 40-pixel tank: jointed wheels, 3×1-pixel
animated tread links circulating around them, and hinged jet pods that fold
when the native `levitating` parameter changes. The chassis may slope, flip,
park and restore. Rig parts should retain their pose relative to it. The game
will use body masks/layers and existing controller states, not a new renderer.

The exact live tank has no `aiType`/`isPlayer` at template or root. Its old
aim body is animated because `aimAtTarget`; generic added children otherwise
become dynamic under `EntitySpawner` even with `isKinematic`. Include a native
cosmetic-body ownership selection for controller-driven generic entities in
this contract. Do not require a fake NPC/aim flag or new patrol behavior.

Minimum confirmation: one tilted root, a nested hinged pod and a translating
3×1 link; show that clip motion survives anchoring, the pod follows its actual
parent, facing/aim stay correct, and park/restore retains the neutral geometry.
Use the user's minimal-check direction; no broad M12 theme/series replay.

## Existing features to reuse

- Native `speed`, `direction`, `grounded`, `levitating`, `attack`, `hurt`, `dead`.
- `particleAnimationLayers`, `frameTracks`, `frameLayerBindings`, `bodyMask`.
- Animation graph nodes and editor record save/import APIs.
- Existing per-weapon pixels and native `heldItemAnchor` / weapon equip body.
- Configured `gpt-image-2` image provider for generated pixel art; never expose
  its key. Keep model selection explicit and report only the model name.

No engine feature is requested just to give weapons different sprites or to
react to jetpack engagement; those contracts already exist.

## E58 — tiny generated parts sample the image border

`ChatGptEntityProvider.ts` `classifyToPixels()` uses
`floor(py * sourceHeight / targetHeight)` and the analogous X expression.
For a one-pixel-high part (the requested 3×1 tread link), this samples only
source row zero: normally the chroma-key border, not the generated subject.
This can turn a valid source image into an empty part. This is a source-level
finding; no paid image request has been used to reproduce an obvious sampler
edge case. Do not compensate by making the game tracks larger.

Use correct nearest-neighbor pixel-center mapping for the target sample grid
(or an explicitly documented native subject-crop policy if already available),
retain transparent/chroma handling, and check a small deterministic colored
center / keyed-border image reduced to 3×1 and 1×1. Return nonempty correct
center samples without changing target dimensions. Keep this fix in the native
entity image importer, so all tiny generated parts benefit.

Coordinate through ignored root `AGENT_CHAT.md`. Keep M12's pending bounded
package handoff separate, and return the exact new animation authoring schema
as soon as decided so game data can be prepared in parallel.
