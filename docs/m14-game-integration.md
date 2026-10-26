# M14 game integration

## Staged in Indigo on 0.0.2576

- Full 512×256 source-colored logo at `Menus/Assets/earth-2026-logo.png`.
- Four disjoint material masks including seeded WOOD stripes; exact source RGBA reconstruction.
- Pure game-owned `Game/title-logo-pattern.js` and `Game/title-logo.json` settings.
- Public API binary/text readback, saved original template, exact unchanged
  account strings and camera/pause state. No WFC or terrain edits.
- All 17 roster rig proposals built locally from freshly read native templates;
  current gameplay tanks are unchanged pending movement acceptance.

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
pending. These two title files are **not installed yet**.

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

1. Connect the title to native colored-particle import and execute the game
   script once per entry. Preserve source colors, one simulation layer and
   fresh independent seed selection. Remove the duplicate static HTML logo.
2. Inspect native fire/water emission, methane and wood burning; reenter once
   to confirm a different material pattern. Check title controls and margins.
3. Use ENGINE's completed prototype movement/collision acceptance. Install the reviewed rig
   across the 17 base/persona templates, preserving each current palette and
   gameplay fields. Inspect representative weapons and one firing sequence.
4. Run a bounded game smoke, then export fresh macOS and Website packages from
   the original template. Keep the stable application ID and use a new release
   version; do not package the stale Website working copy as current content.
   Verify the real output title/icon and one ordinary launch/navigation flow.

ENGINE has the quiet UI/GPU/API/install window returned at 05:55:21 UTC for
candidate 2583 acceptance. GAME has no native jobs running and remains
source-only until explicit return. No completed game rollout or updated
published artifact is claimed yet. Scoped SQLite map-cache recovery remains
separate engine work; the original file store has not been restored or reset.

The older broad theme/mechanism/series acceptance matrix remains deferred under
the user's minimum-confirmation instruction; it is not a gate for this pass.
