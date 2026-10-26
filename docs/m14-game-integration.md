# M14 game integration

## Staged in Indigo on 0.0.2576

- Full 512×256 source-colored logo at `Menus/Assets/earth-2026-logo.png`.
- Four disjoint material masks including seeded WOOD stripes; exact source RGBA reconstruction.
- Pure game-owned `Game/title-logo-pattern.js` and `Game/title-logo.json` settings.
- Public API binary/text readback, saved original template, exact unchanged
  account strings and camera/pause state. No WFC or terrain edits.
- All 17 roster rig proposals were built locally from freshly read native templates.

Staging receipt: [native readback](evidence/m14-game/staging.json).
The complete level backup remains in `backups/` with its verified manifest.

## Prepared locally

`Menus/Scenes/title.json` now uses the engine agent's proposed `particleImages`
contract with `materialScript.seed: "entry"`. The source-colored image is the
only logo; the scene keeps its three parallax backgrounds and containing stone
floor/walls. Old decorative tank, sand and flame stamps are removed so they do
not obscure the logo. The scene resets after 18 seconds using the same visit's
pattern; leaving and reentering requests a fresh pattern.

`Menus/title.html` replaces the static image with an accessible native scene
hero above the existing controls. All six navigation buttons retain their
native actions. Shared CSS keeps the scene at full opacity and gives it a
bounded responsive height; native screenshots and margin inspection remain
pending. These two title files were installed during the short 2581 window below.

## Installed game rollout on 2581

All 17 base/persona tank templates now use the accepted native rig. The public
authoring APIs validated and saved 119 animation records; each template patch
was read back exactly, preserving its non-art fields and persona palette.
The full before/after records and proposals are retained in `assets/m13/`.

The prepared title JSON/HTML, shared CSS and unsigned 0.3.0 publishing settings
are installed and read back. Native scene validation accepts the image and
material script. Indigo was saved and Talus quit normally. The four freshly
captured account strings are unchanged; no account restoration, WFC/terrain
edit, match or publishing action occurred in this window.
See [rollout receipt](evidence/m14-game/rollout.json).

The durable Title child and live visual acceptance remain for the new hierarchy
build. ENGINE has the returned quiet lease and knows the prepared source is now
installed; it will initialize the child from this source.

## Engine fixes accepted

The installed 0.0.2581 includes the CCT and native particle-image fixes. ENGINE
accepted the actual jointed prototype on 0.0.2578; subsequent builds retain the
same WASM. The unchanged rig settled onto support, drove about 54 pixels in
each direction, rose about 106 pixels under thrust, landed after release,
stopped at a wall and contacted/pushed another tank. Parts remained attached.
The diagnostic closed with all four installed account strings unchanged.
The report is `foxtrot/docs/m14-cct-validation.md`; this accepts movement and
collision behavior, not the still-pending roster rollout or CPU match.

The native `particleImages/materialScript` schema is released. The title-scene
editor is a separate feature: candidate 0.0.2583 adds child worlds within one
project and uses the existing editor to edit a bounded menu scene. At the
05:55:21 UTC handoff, it was awaiting installed acceptance.

## Finish after the current app handoff

1. Install the prepared scene source, then create/update a durable menu-scene
   child world under Indigo using the new project hierarchy. Bind it to
   `menu:title` and the existing title menu's scene view. Initialize from the
   current colored-logo source, not the old decorative stamp scene; retain the
   document ID and root/scene binding in the install receipt. Preserve source
   colors, one simulation layer and the game script's fresh seed per entry.
   Remove the duplicate static HTML logo.
2. Inspect native fire/water emission, methane and wood burning; reenter once
   to confirm a different material pattern. Check title controls and margins.
3. The reviewed rig is installed across all 17 base/persona templates. Inspect
   representative weapons and one firing sequence in the CPU game; ENGINE's
   prototype movement/collision acceptance already covers the controller fix.
4. Per the latest user request, export a fresh **unsigned macOS ARM64 0.3.0**
   build from the updated original project, without notarization. Keep the
   stable application ID `com.talus.m11-2552`. Launch that packaged game and
   watch a CPU-only match with the new tanks; verify its title/icon and ordinary
   start flow. Website packaging remains subsequent work; the old Website
   working copy is not the current release source.

ENGINE has the quiet UI/GPU/API/install window returned after the short 2581
installation, for the corrected hierarchy candidate's acceptance. GAME has no
native jobs running and remains source-only until explicit return. Tank
installation is complete; title-child binding, visual/game checks and the
updated published artifact remain pending. Scoped SQLite map-cache recovery
remains separate engine work; the original file store has not been restored or reset.

The older broad theme/mechanism/series acceptance matrix remains deferred under
the user's minimum-confirmation instruction; it is not a gate for this pass.

## Final title and unsigned delivery (2585)

All 17 tanks are installed. The durable `Title` child is
`fee4549f-c9ff-418d-8051-5cc9c7b3f557` under Indigo, bound to `menu:title`.
ENGINE accepted that child on 2585 with 131 exact material/color samples.

The user's final title changes are installed in the root source: full viewport,
no containing border, existing-size menu controls over the simulation. Native
**Atomic Realm Mine** and **Mine Background** tile-brush presets supply the
foreground particles and rear raster plane. Both were painted with
`world_raster_place_autotiles`, sampled through the public raster API, and retained
as project PNGs. Temporary authoring layers were removed; no WFC art was changed.

The logo keeps its original pixel colors. WOOD surrounds randomized DYNAMITE
stripes confined to its center; small peripheral native Particle Emitter patches
emit fire, water and methane. The title-specific emitter materials are softer
and combustible. A 90-second loop allows the burn to complete. Twenty initial
material/RGB samples matched exactly. After two seconds, fire was present and
all dynamite remained intact; after 72.9 seconds, no WOOD or DYNAMITE remained,
and FIRE, WATER and METHANE were observed. Native screenshots confirm the scene
fills the 1600×968 window and all six menu controls fit.

See [title evidence](evidence/m14-game/title/title-particles.json),
[initial screen](evidence/m14-game/title/title-initial.jpg),
[tile brush receipt](evidence/m14-game/title/tile-brush.json), and
[installation](evidence/m14-game/title/final-install.json).

**Editor follow-up:** 2585 does not expose refresh-from-source for the retained
Title working copy after external scene/script edits. ENGINE is adding that
explicit operation, preserving its document ID and refusing unsaved painted
changes. Runtime playback and package preflight read the updated root files;
do not Save the old Title editor over the new source. This does not block the
requested player build. The broad test matrix remains deferred.
