# M13 — Scorched Earth 2026 tank piece and branding

## Installed and confirmed — 2026-10-25 local / October 26 UTC

All **36 enabled weapons** have distinct tiny native `gpt-image-2` sprites in
their existing template IDs. Readback preserves non-art gameplay fields. Five
reusable tank parts were also generated; source boards/prompts/pixels are
retained under `assets/m13/`. The 3×1 tread is now three directly authored steel
colors, as requested. **E57/E58 are withdrawn; no image sampling or new animation
system is required.** See the [art sheet](../assets/m13/contact-sheet.png).

The owned prototype `df65c209-6090-469e-8f83-6936f09491ed` is installed with two
rigid track modules, four hinged wheels and two hinged jet pods. Native sprite
frames animate twelve tread links per track, with native hinge-motor clips for
wheels/pods. Six clips and one controller validated and read back. Native
`speed` and `levitating` parameters drive the animation; no scripted pose loop.
The existing floating character controller remains responsible for propulsion.
Decorative bodies have `maskBits:0` and zero gravity.

The prototype renders correctly at a readable zoom. Levitation changes pod
angles from (+.45,−.45) to (−.45,+.45), showing flame sprites. Native aim(0,.7)
renders a horizontal right-facing weapon. Deployment now explicitly aims right
for the left half of the roster, left for the right half; corresponding angle
blackboards start at 0/180. The deployment source was type-checked; a full new
match was not run for this small change.

The game name is **Scorched Earth 2026** throughout current menus, publishing
metadata, title artwork and icon. Existing internal IDs/paths remain stable.
The generated replacement title was inspected in the actual title screen;
large image installation uses bounded public API writes with native byte-length
and hash readback. See [title screenshot](evidence/m13-native/title-renamed.jpg)
and [installation receipt](../assets/m13/branding-install.json).

Before branding installation, native File → Export captured the full original
Indigo project, including 4,565 chunk snapshots. The 25.8MB archive is retained
locally, ignored by Git, with SHA256 and SQLite quick-check verified. See
[backup location and manifest](../backups/README.md). WFC painting was preserved.

## Concrete remaining work

**Controller movement:** in one isolated no-match world, the original tank
moved 54.7 pixels in 60 ticks. The rig moved zero and falsely reported grounded
above the platform. Disabling every animation-layer collider also produced zero
movement. Levitation consumes fuel/articulates the pods but cannot move the root.
ENGINE confirmed the CCT hit its own decorative child colliders. The installed
0.0.2581 now contains the corrected native filters; actual movement, thrust,
support, wall and other-tank collision acceptance passed on 0.0.2578 with the
same WASM. This is fixed engine behavior. All 17 base/persona templates now
have the accepted native rig, with 119 validated animation records and exact
template readback. Gameplay fields and accounts were preserved. The packaged
CPU match remains the final game-side observation.
See [A/B results](evidence/m13-native/drive-comparison.json),
[collision-toggle result](evidence/m13-native/drive-without-layer-colliders.json)
and [comparison image](evidence/m13-native/drive-comparison.jpg).

**Particle title:** the revised four transparent material masks preserve sampled
source RGBA exactly: top quarter FIRE emitter, next quarter METHANE gas, bottom
half WATER emitter, crossed by seeded irregular WOOD stripes that burn. The
full logo and four-mask wood revision are now installed/read back on 0.0.2576,
along with the game-owned pattern script and settings. Material/placement data is in
[the manifest](../assets/m13/title-particle-logo.json). These are one particle
layer, not additional simulation layers. Particle Emitter is native element153
(`PARTICLE_SPAWNER` internally); our sources configure that same element.
They are not active particle content yet. The installed 0.0.2581 now supports
the required colored image import and native emitter behavior.
The game-owned [randomization script](title-logo-script.md) now produces a fresh
stripe pattern by default, with explicit-seed replay. Local authoring is working;
automatic per-title-entry execution is wired in the installed title scene
through the released `particleImages/materialScript` contract. The static HTML
duplicate is removed. The durable title child under Indigo and live visual
acceptance await the hierarchy build; prepared source and script are installed.

Two bounded diagnostics returned to the original Indigo editor with all four
installed account strings unchanged; no account restoration was performed.
The temporary prototype layer toggle was restored exactly. Native screenshots
and compact receipts are under `docs/evidence/m13-native/`; full diagnostic
baselines remain ignored under `artifacts/m13/`.

Next: finish the durable title-child binding and inspect the native title,
then build the requested unsigned macOS 0.3.0 package. Watch a CPU match with
the installed rigs and inspect representative weapon shapes and one shot.
Existing published binaries still contain their previous exported content.
Website packaging follows later. No broad E2E matrix or profile clone is required.
