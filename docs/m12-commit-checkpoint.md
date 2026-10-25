# M12 working checkpoint — 2026-10-25

The user requested minimal working confirmation followed by a commit. This checkpoint reuses retained evidence; the broader [acceptance matrix](m12-next-acceptance.md) is deferred, not a pre-commit gate. It does **not** claim M12 complete or the new engine candidate accepted.

## Reviewed content and identities

- Original Indigo has the scoped game script installed, read back, saved and clean. It includes camera/residency integration, CPU policy, full preset selection, story generation, versioned detail/growth sizing and trestle clearance. Older partial generation plans retain their original policies.
- `world/Scripts/match.ts`: `fb427b01e411246aa6429d382593b839c9aa213fce3e33d5e1cdb42efac5227f`.
- `world/Game/generation.json`: `98c274a4f298dc957f8216bcf2f4767c2f03a14708d086443d22d262f041ddd8`.
- `world/Game/landscape-stories.json`: `5e95a5263cb74668f897d317fccf892c809c5dd9f4f2f7d1679d19cd36b333a8`.
- `world/Menus/title.html`: `42c5f749b61a20f43d766ce66ec95d6e1e3db68f91849672f9bb4b8ed0110794`.
- `world/Menus/Scenes/title.json`: `d2babae944b93239fe1f52e1c1049b9e8d3d0855b19122e42e94b7116a23d0a6`.
- Owned Website copy still uses script `f51cc90744eb9253a69c2f8c70247a74ce30f2f751dd0db1e6f52bf2b914a7eb`; browser evidence below does not validate the newer story corrections.
- Game evidence used installed Talus **0.0.2571**, source `d106e61254ef193b0fe5c5a2a76d8f321ae15606`, asar SHA-256 `85c92f7e350725d590177b31d5a40bee0458461a6df19be43e5e680dabc5d525`.
- Silent powder defaults/configuration are applied: 36 powder materials, 112 audio bindings removed in defaults and original/owned configurations. Other audio and physical/visual properties remain intact; historical immutable saves were not rewritten. No extra gameplay revalidation was requested.

## Working evidence reused

| Check | Result and boundary |
| --- | --- |
| CPU game | [Four-CPU WFC round](evidence/m12-turn-camera/acceptance-summary.json) finished unattended at turn 6, Alpha winning, without fault, Resume retry or forced combat. Earlier paid Heavy/Napalm and free-escape evidence is retained. This is not a multi-round series. |
| Camera/dialogue | The same 3,570-frame run shows continuous turn 2/3 pans, arrival before speech, 3.0167-second dialogue and 2.5167-second death watch, with no all-roster frame constraint. All survivors in this run were live. |
| Title/Settings | [Original simulated title](evidence/m12-camera-policy-final/original-title.jpg) renders accepted fire/background assets. [Settings review](evidence/m12-menu-layout/engine-2570/review.json) covers 960×540 and 1280×600 layouts with rightmost bindings focused and labels/Done visible. No physical gamepad was attached. |
| Full A1 generation | [Fresh U summary](evidence/m12-story-a1-trestles/generation-summary.json) reaches ready with two 100-HP tanks: 171 macro, 50 noise, 50 semantic, 17 neural, 25 structures, 50 growth, seven clearance and five complete mechanisms (14/7/7/7/7). [Central capture](evidence/m12-story-a1-trestles/central-tank-scale.jpg) shows improved plant scale/detail. Physical chains and all-theme visuals are not accepted. |
| Root Website | ENGINE's retained [2571 browser result](engine-m12-patch-prompt.md#e46--website-build-target) completed a paid-weapon two-CPU round and reopened the same world at `/`. Its normal finished-stage shop purchase was saved. Subpath/update persistence remains a separate failing gate. |
| Source checks | Existing focused generation, legacy-resume, placement, trestle, camera/lifecycle and economy checks passed; strict packaged2571 TypeScript passed. The coordinator's final 32 authored-JSON syntax check passed and its credentials-pattern scan found no matches. No new gameplay run was added for this checkpoint. |

All diagnostic ledgers are closed with exact baseline restoration. User WFC artwork is preserved. ENGINE owns the quiet app; no game observer is running.

## Known limitations and deferred work

- **E56 native restoration readiness:** [Distant V](evidence/m12-distant-game/acceptance-summary.json) proves actual park/restore, stored-shooter landing credit and a serialized-opponent geometry read, but no hit/kill. Turn 3 faults because native live/camera readiness precedes blackboard preparation. No delay, fabricated brain or readiness bypass was added. Corrected installed replay remains pending.
- **E46/E55 candidate:** Website `/games/terra/` Continue returned a root-path transition 404, and worker weather/weapon audio needed native routing. Source fixes exist; changed subpath/account/audio browser checks remain pending. Root Website success does not close these gates.
- **Engine handoff, 22:56:45 UTC:** ENGINE accepted the reduced scope and explicitly authorized checkpointing reviewed game source now. Candidate **0.0.2572 / `eb3a1c72c`** is committed/pushed; ENGINE reports 14,259 tests with zero failures, zero TypeScript errors and successful production/player builds. Signing/package smoke and the short changed-boundary browser check are still in progress. These are reported engine results, not installed game acceptance.
- Defer the ten-theme sweep, A2/A3 and physical mechanism chains, seed/hybrid comparisons, best-of-three shopping/biome series, further controller coverage and final desktop/Website artifact rollout. The attempted spillway probe [never ran](evidence/m12-story-a1-trestles/spillway-probe-status.json): a harness wait-call error occurred before sampling or excavation, so it has no physical result.
- Existing disabled capabilities and unsupported full mid-volley persistence remain unchanged. Commit the working checkpoint with these limits visible; revisit the matrix as follow-up work.


## Later engine handoff — 23:11–23:14 UTC

ENGINE returned the original quiet editor with signed local 0.0.2572 installed
(source `eb3a1c72c84c62bd3ab95e4984a33fe8389444e2`; not notarized). Its bounded
Website 0.2.3 check under `/games/terra/` now reopens the same save, preserving
94/0 HP, $368, Missile 1, Nuke 2 and standings. It reports all 642 images and
1,188 resources verified, all 36 powder overrides silent, and nonzero browser
mixer output with no page/console errors. Perceptual weather audio and fresh
cold-title recovery remain unestablished. Original account JSON strings matched
the fresh engine baseline without restoration writes. These are ENGINE-reported
results; the GAME distant-restore replay is still pending. The new M13 tank-art
work does not reopen the broad M12 acceptance matrix.
