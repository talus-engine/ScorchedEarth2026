# M13 — E58 tiny-image reproduction; E57 remains withdrawn

**2026-10-26:** E58 is now reproduced by a real 3×1 native generation on
0.0.2575. See the exact request/response at the end of this document. Only the
tiny-image sampling fix has been reopened; no animation engine work is requested.

**Earlier correction, 2026-10-25:** E57/E58 were withdrawn as game prerequisites. ENGINE
has been told to hold this work. Neither observation below has been shown to
block a native tank prototype. They do not establish missing animation support
and are not release requirements.

Tracks and wheels must remain **rigid bodies connected by joints**. Cosmetic
means that their motion does not propel the tank: the existing floating
character controller continues to drive it. Use existing native bodies,
joints, animation layers and controller parameters first.

The earlier sprite-host/local-pose design was an implementation choice, not a
user requirement. The current animator already has a dynamic-body branch that
drives hinge motors from clip `motorSpeed`, separate from its animated-part
pose branch. GAME must demonstrate a small native prototype before requesting
engine changes. Any later request needs a concrete reproduction and an account
of why existing supported authoring cannot achieve the required behavior.

## E57 — unverified pose-composition concern

The source audit inspected the animated-part branch of
`src/animation/EntityAnimator.ts`:

- `applyPoses()` writes animated child translation from spawn and clip offsets.
- Subsequent `anchorRiggedLimbs()` writes translation from joint anchors.
- That anchoring path uses the root transform rather than an intermediate
  `hinge.bodyA` parent; the inspected pose angle is world-oriented.

These observations concern a particular pose path. They do not prove that
existing rigid-body joint animation, sprite layers or the required tank are
blocked. The proposed new local-pose/ownership contract is withdrawn pending a
native demonstration. Generic dynamic children are not inherently a defect;
they are relevant to the user's requested rigid bodies on joints.

## E58 — unverified tiny-image import concern

The inspected `ChatGptEntityProvider.ts` resampling loop uses
`floor(py * sourceHeight / targetHeight)` and the analogous X expression.
For a one-pixel-high output this selects source row zero. A chroma-key border
there could produce an empty part. No 3×1 generation/import failure has yet
been demonstrated. This is an image-import concern, not an animation feature.
The first step is to use the existing native generation/import facilities for
the requested tiny art and retain the actual result.

## Scope and coordination

Continue using native `speed`, `direction`, `levitating`, body/joint data,
clips/controllers and sprite layers; preserve existing floating propulsion.
Use the configured `gpt-image-2` provider without exposing its key. Existing
weapon art remains installed. No engine change is currently established as
necessary for the rig. `AGENT_CHAT.md` tracks the separate engine UI lease and
the next opportunity for the native prototype.
# Reproduced follow-up: E58 only — 2026-10-26

On installed 0.0.2575, the actual native `generate_entity` call returned a
3×1 part with an empty `pixels` array. Source template:
`ec28be8e-59ff-4b9c-8dec-3dc29e76f173`.
Exact request and response: `assets/m13/prompts/1e864ee79a34.json`,
`assets/m13/boards/1e864ee79a34.json` and its `-source.json` companion.
The prompt explicitly requested three full-height steel bands with zero margins.

`ChatGptEntityProvider.classifyToPixels` samples `floor(py * sh / H)`;
for H=1 that always samples the source's top border. Correct nearest-neighbor
sampling to source pixel centers, bounded to the source dimensions, and add a
small regression for 3×1/1×3 parts surrounded by the provider's chroma background.
Do not add a new animation or sprite-host contract. E57 remains withdrawn.
This concrete image issue was sent to ENGINE through `AGENT_CHAT.md`.

