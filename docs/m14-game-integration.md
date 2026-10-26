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

## Finish after ENGINE returns the confirmed interface/build

1. Connect the title to native colored-particle import and execute the game
   script once per entry. Preserve source colors, one simulation layer and
   fresh independent seed selection. Remove the duplicate static HTML logo.
2. Inspect native fire/water emission, methane and wood burning; reenter once
   to confirm a different material pattern. Check title controls and margins.
3. Recheck the jointed prototype moving left/right, stopping and levitating;
   verify weapon aim and native part animation. Install the same reviewed rig
   across the 17 base/persona templates, preserving each current palette and
   gameplay fields. Inspect representative weapons and one firing sequence.
4. Run a bounded game smoke, then export fresh macOS and Website packages from
   the original template. Keep the stable application ID and use a new release
   version; do not package the stale Website working copy as current content.
   Verify the real output title/icon and one ordinary launch/navigation flow.

ENGINE owns the UI/GPU/API lease after the 01:40:18 UTC handoff. Source-only game
work continues until its explicit return. The proposed scene contract is now
being implemented; installation waits for its validated schema and build.
ENGINE reproduced the CCT's same-entity body-1 hit and is verifying the fix.
No M14 completion or updated published artifact is claimed yet.

The older broad theme/mechanism/series acceptance matrix remains deferred under
the user's minimum-confirmation instruction; it is not a gate for this pass.
