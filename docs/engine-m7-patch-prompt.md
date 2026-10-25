# M7 engine patch prompt — E10 floating damage text

Fix and release **E10**, the still-open M4 damage-text lifecycle defect. This is the cause of the numbers remaining on the battlefield. It is separate from the new Indigo speech bubbles, which are authored game UI and deliberately stay fixed on screen while being read.

Project: `/Users/tonygermaneri/gh/indigo`. Engine: `/Users/tonygermaneri/gh/foxtrot`. Investigated installed Talus **0.0.2497**, engine commit `ff77aaf51d84716cab1df32a5ff4832c3b3ad325`. Preserve other work in that checkout, including the unrelated untracked `docs/plans/simulator-navigation-overview.md`. Read its AGENTS.md. No engine source was changed for M7.

Tony is the engine author and explicitly requires fixing engine defects rather than game-side substitutes. Implement a reusable transient-text lifecycle, document it, make a new release, and validate it in the installed app. Keep the existing M6 material work in [its handoff](engine-m6-patch-prompt.md); this prompt neither closes nor replaces E14–E16.

## Reproduction and confirmed source path

Use public `talus.ui.floatText({x, y}, 'E10 M7 900ms', {ms:900, size:1.2, color:'#ffffff'})` at a visible tank position. Leave the simulation running past the requested lifetime. The label remains: no rise, fade or expiry. The M7 CPU replay retains timings in `docs/evidence/m7-dialogue-fixed.json` and a post-expiry screenshot `m7-dialogue-fixed-m7-e10-expired.jpg`, taken after 1.517 simulation seconds and 3.041 host seconds. Its immediate birth screenshot preceded delivery to the page. Use the subsequent **visible-birth probe** `docs/evidence/m7-e10-visible.json` and its `-visible.jpg`, `-midpoint.jpg`, and `-expired.jpg` screenshots to compare actual displayed positions. `tools/probe_m7_floaters.py --world <diagnostic-save> --label <fresh-label>` reproduces that probe and restores the user's session.

The older independently timed M4 reproduction remains in `docs/evidence/m4-floaters-verified.json`. M7's initial pre-correction speech replay also reproduced E10 in `m7-dialogue.json`; its `wall` fields came from the script VM's simulation clock, not the host wall clock. Use the final replay's Python-host timestamps for wall-time comparisons.

The supplementary visible-birth probe shows the same requested 900 ms label displayed at simulation ages 0.133, 0.417 and **1.933 seconds** (3.880 host seconds at the final capture), while unpaused. The label remains opaque. Account for the captured camera origin when comparing world-anchored positions; the restored winner settles slightly during the probe.

Confirmed source in the investigated checkout:

- `src/menus/scriptUiState.ts:166`: the `ui.floatText` page request calls the **page realm** `damageFloaters.spawnText`.
- `src/state/DamageFloaters.ts`: plain singleton entries start at age zero. `tick(dt)` advances/removes them. The cap is 64. Script text is marked `always`; ordinary damage respects Show Damage.
- `src/app/composables/useOverlayDraws.ts:324`: the page draws the store using `y + vy * age` and `1 - age/lifetime`. This path does not advance age.
- `src/simulation/DamageManager.ts:83`: the only caller of `damageFloaters.tick` runs in simulation. Ordinary numeric spawn at line 273 and reset at line 538 likewise use that realm's singleton. In worker mode it is not the displayed store.

This is an ownership/clock split. Adding a second arbitrary tick or a game HUD replacement is not an adequate fix. Trace the actual packaged worker path and the loopback path, including ordinary native damage, so a correction does not create missing, duplicated or double-aged labels.

## Required behavior

1. Give transient text one presentation owner and clock. Route native damage and explicit script text to it through supported bounded events/DTOs. No Vue reactive per-frame cascades, per-label timers, game-specific branches, or worker/page global assumptions.
2. Labels rise visibly, fade, and disappear at their requested lifetime. Define pause behavior; presentation-time aging while paused is preferred, consistent with `tick.frame`. Camera tracking must not reset age. Check actual readability at 25% zoom: scaling world-space velocity down to a few screen pixels is insufficient for useful floating feedback.
3. Clear transient text on world teardown/reload, and do not persist it in saves. A label cannot survive into another world or return after a camera trip. Unregister session listeners on disposal.
4. Retain the bound on active labels and the Show Damage distinction: ordinary damage can be hidden; explicit script text remains explicit. Honor size/color/lifetime arguments, zero/invalid input handling, and avoid drawing a given native event twice.
5. On the game side after native damage presentation is verified, remove the redundant custom numeric `floatText` in Indigo's primary `projectile.hit` handler if it duplicates the native number. Keep `lastHit` event details in the HUD. Verify native numbers also cover secondary chaos-shell damage. Chaos-effect names use explicit text and must also expire. Do not remove the numbers merely to hide the bug.

## Acceptance and release

- Unit tests for aging, rise/fade, expiration, pause policy, bounds, teardown and ordinary/explicit visibility settings.
- Worker and loopback integration tests demonstrate one display owner and one aging pass, with native damage crossing into the visible store once.
- In the installed app, record an actual damaging CPU shot at 25% zoom, a rapid chain reaction, and explicit 900 ms and 1800 ms labels. Capture birth, a rising/fading midpoint and disappearance, with host timestamps. Moving the camera must not restart or duplicate them. Repeat while paused according to the documented policy.
- Save/reopen and change worlds without resurrecting labels. Preserve camera framing, terrain, identities, score attribution and completed-match scoring.
- The new tank speech remains fixed on screen for 4.5 seconds when firing and 5.5 seconds for last words, fades over its final 0.6 seconds, survives wreck removal and expires while paused. Camera movement must not move those speech bubbles. They are distinct from upward-moving numeric damage feedback.
- Run the engine's required tests, type check, production and packaged checks. Record release version, commit, installed artifact hash and evidence. Use CPU-only diagnostic saves; preserve user names/scores. Do not clone E2E profiles: the disk has about 22 GiB free.

After installing the release, rerun the targeted Indigo checks and visually verify the real numbers before closing E10. M7's local source checks are `python3 tools/build_quips.py`, `node tools/check_m7.cjs`, `node tools/check_m6.cjs`, and the strict project type check. `tools/verify_m7.py` exercises the actual public HTTP game flow; start from a loaded user game and use a fresh `--label`. It captures that current session for restoration. Only use its explicit `--baseline` option when deliberately starting from the editor with a fresh baseline from the same work session.
