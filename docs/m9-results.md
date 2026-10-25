# M9 — arsenal, presentation, environment and brush terrain

**Current status: M9 is closed at the delivered 0.0.2530 scope by user instruction.** See the [closeout](m9-closeout.md) for current features and verification, and the [backlog](backlog.md) for carryover. The reports below are chronological history; their earlier open/blocked statements describe those builds.

## Historical initial delivery — 0.0.2498

Initial status: playable subset, pending engine work. Tested with Talus 0.0.2498, commit `8e0b0647104ca6cb797f400e2004b1c71810998a`; installed app.asar SHA-256 `9f569ededc042f0c471eff83d5a55eac211c05a6f59ad817c24b99d0d711bb0b`. No engine source was changed for M9.

## Implemented

- The initial timing implementation uses native `Name: “dialogue”` labels, restoring the name afterward. Camera centering precedes the sentence. Firing and death effects wait at least three simulation seconds; simultaneous deaths queue. Pausing also pauses that interval. **The user's latest correction requires independent arbitrary world text at least 4× larger, not speech inside the nameplate. That presentation remains unaccepted pending E27.** The independently shuffled, persistent 500-shot/500-death phrase decks remain in use.
- 59 catalogue entries account for all 33 weapons and 15 accessories in Scorched Earth 1.5 plus Indigo/genre additions. **31 weapons and 10 utilities are enabled; 18 entries are disabled and cannot take money.** See the [coverage table](m9-equipment.md) and [research](m9-research.md). Nuclear shells, MIRV, Death's Head, rollers, napalm, dirt weapons, plasma, machine gun, flamethrower, shotgun, grenades and homing rockets are included. Some original items are explicitly documented adaptations rather than exact original mechanics.
- Attacks track all native projectiles, descendants, burst emissions and material jobs. One purchased magazine/charge pays for the full trigger. Every actual projectile retains the cash policy. The turn advances after the whole attack and a bounded settle wait.
- Native M8 jetpack, burrowing, sand deposition, shields, magnetic defenses and rising/fading damage text remain enabled. Auto Defense activates stocked native fields once per round. Lazy Boy uses the existing native ballistic graph; one charge is consumed only when a solution is applied. A human still decides when to fire.
- A fifth random death effect places a real, randomly sized FIRE brush (radius 96–240). The other four supported effects use native shell volleys. Nine material/transmutation/attached-emitter effects remain disabled.
- The optional **Brush Reach** arena is generated in a separate 50×5-tile-equivalent rectangle. It builds a full 256-pixel STONE bottom row, mixed substrate, connected native noise surfaces and 64–128-pixel semantic detail stamps. Existing WFC mode remains available. A seed drives each mode; blank seed requests randomness.
- **Indigo — Distant Thunder** was generated using the engine's background API: three PNG layers with distinct native parallax factors. Native weather selects clear/rain with weights 90/10 and periodically rerolls. It is not a per-round rain guarantee. A renderer defect currently repeats the horizontal layers vertically; see E26 below.

## Native validation

The two-CPU Brush Reach duel (seed 9023, normal 100 HP) completed on turn 2, with a MIRV split, direct Nuke hit and delayed ten-shell death effect. The recorded shooting and death delays were 3.016667 simulation seconds. Every survivor remained live and inside the 25% active ring in all 166 sampled frames. All 50 columns had generated surface and foundation samples; surface heights ranged from 552 to 733. The complete post-combat profile and installed bank were unchanged after save/reopen.

Evidence: [combat](evidence/m9-brush-combat.json), [battlefield](evidence/m9-brush-battlefield.jpg), [50-column profile](evidence/m9-brush-profile.json), [save/reopen](evidence/m9-brush-roundtrip.json). MIRV child horizontal momentum was subsequently corrected; a policy regression and the later native Death's Head path cover that shared change.

An eight-CPU arsenal fixture used **explicitly granted ammunition and 10,000 HP**, allowing more weapon families to run. It is a behavior diagnostic, not a balance or earnings test. It exercised 12-bullet machine-gun attacks, 180-particle flame streams, seven-child Funky Bombs, nine-child Death's Heads, three Leap Frog hops, actual dirt/oil/sand deposits, plasma and nine-pellet shotgun fire. All 1,340 retained early frame samples kept survivors live and within the active ring. The game eventually finished on turn 78, winner M9 Smoke, without a script fault.

Evidence: [fixture](evidence/m9-arsenal-fixture.json), [first pass](evidence/m9-arsenal-first-pass.json), [second pass](evidence/m9-arsenal-second-pass.json), [completed result](evidence/m9-arsenal-complete.json). The bounded observer rolled over during a prolonged tool/bridge interruption: there is **no claim of uninterrupted frame-level coverage for all 78 turns**, or independent physical acceptance of every catalogue variant. Grenade and homing were assigned in a later pass, but no separate full variant acceptance is claimed from that assignment alone.

Native material probes placed 28,807 FIRE cells at radius 96 and 176,921 at radius 240, with default fire temperature approximately 900 K. A 256-cell WOOD fixture fell to 24 WOOD cells after 180 ticks, producing embers, smoke, soot and fire. An actual in-match death presentation waited 3.016667 seconds, then completed a radius-240 job placing 157,372 FIRE cells. Its wreck had fallen below the arena before emission; E21 still blocks reliable visible staging. Remote world-plane simulation does not imply remote heat/air/EM simulation.

Evidence: [materials](evidence/m9-material-probe.json), [large FIRE brush](evidence/m9-large-fire-240.json), [in-match FIRE receipt](evidence/m9-nuke-after-bridge-timeout.json). LAVA initialized at 1400 K and nitrogen at 70 K. The acid probe did not dissolve its 512-cell STONE target in the observed interval; complete corrosion/cooling behavior remains unaccepted.

The bridge timed out during the integrated death-nuke probe, and the subsequent native UI tool itself returned after an unusually long delay. The engine continued to completion and retained a successful FIRE receipt. This is recorded as an observability interruption, **not a confirmed nuke-induced engine hang**.

Local checks pass: `node tools/check_m9.cjs`, `node tools/check_m8_utilities.cjs`, and strict TypeScript validation against the installed generated API. These cover camera/label/three-second ordering, queued deaths, interrupted-shot cancellation, complete multi-projectile attack lifetime, one-magazine debits, shuffled dialogue, native-resource reconciliation, Auto Defense, and Lazy Boy success/refusal accounting. The utility test additionally verifies that idle turn changes do not cancel unrelated material payloads, while an active excavation is cancelled.

A final two-CPU native graph probe applied a Lazy Boy solution and reduced its explicitly granted stock from two charges to one. [Native state](evidence/m9-autoaim.json), [accounting](evidence/m9-autoaim-accounting.json). The first driver attempt clicked through before the hot-reloaded menu stabilized; it timed out in the ready phase without a script error. Waiting for the new UI and clicking the actual menu completed the check.

## Engine work required

The [M9 engine completion prompt](engine-m9-patch-prompt.md) contains the contracts, reproduction evidence and acceptance requirements:

- **E21:** passive slope posture, self-righting, horizontal terrain seating, and a native finite death-pose hold. The current dead hull can fall during its last words; the script does not teleport or freeze it as a substitute.
- **E22:** runtime neural/living growth (including living bramble), polygon/ridge-guided brush sources, shape operations and structural collapse. Current Brush Reach uses real semantic recipes; it is not the completed neural/living generator.
- **E23–E25:** native underground projectiles, cutting beams, consumable next-shot modifiers, fall protection and ground-fuel accounting. The 18 unavailable catalogue entries remain blocked.
- **E26:** confirmed horizontal parallax layers incorrectly tile vertically. The generated art is retained for an engine renderer fix.
- **E27, priority:** arbitrary retained world text on the native layer, separate from the nameplate, with 36-screen-pixel dialogue, wrapping and explicit lifetime. The 2498 APIs do not expose this; no HTML/damage-text workaround was added.
- **Carried E14/E16/E9:** color-preserving wreck transmutation and remaining physical material effects; transient projectile/cast persistence. Save/reopen is accepted at tested quiet/completed boundaries, not mid-volley.

A premature MIRV contact during visible rain is retained as an investigation, not yet a confirmed engine defect. The existing living-tank framing policy was corrected after a diagnostic included an off-world wreck in its mandatory frame; that game-side correction does not resolve the native wreck behavior.

## Installation and preservation

The live template is `d9fa0363-0172-a96e-9b10-0b0c3d9a1f58`. Its current source is in `world/`; pre-M9 content is preserved in `fixtures/m8/`. Original game saves are untouched, including M8 ready world `d3fe7d92-cdd9-475e-940f-f5b48e1725a8`. Diagnostics used the existing profile and did not create an E2E profile clone.

The original four installed-state records are retained as exact serialized strings in [the baseline](evidence/m9-installed-baseline.json). [Final restoration](evidence/m9-restoration.json) verifies byte-for-byte durable database equality for preferences, scores, economy/stock and dialogue, plus exact read-back of eight current template files. Tony has $270 and Copper $330, with their original supplies. The app is at [the setup menu](evidence/m9-menu-ready.jpg), world `312bccdb-81ef-4eb2-acef-53bf5d74e772`, with no match deployed, no script fault and no automatic purchases. E27 is not installed: the new arbitrary-text requirement remains engine work.


## Engine continuation: native presentation, posture and finite mobility

Local candidate **0.0.2502**, engine `ed5907bae`, is installed. Its app.asar
SHA-256 is `8c2c3b8b364fc0bbc86f6c6a6c1950b24e815aff958d55aa2ed58a062608f7b5`.
This supersedes the historical 2498 implementation status above; full M9 remains open.

Dialogue now uses independent retained native world text at 36 CSS pixels, with
720-pixel wrapping, unchanged name/health plates, and at least three simulation
seconds before firing/death effects. Native pose holds keep the actual death hull;
passive posture, turn-boundary righting and bounded firing seats use public APIs.
Packaged presentation, opposing powder slopes and queued-death evidence lives in
the engine work log. The historical Nuke-specific fall-through is not fully isolated.

Parachute is enabled after an actual paid purchase, immediate next-round navigation,
native deployment and healthy landing, with unused charges retained on save/reopen.
Fuel Tank is enabled after native stone/powder movement, small-step and wall tests.
Blocked or idle input costs nothing; installed fuel is debited from the native
cumulative accepted-work meter. CPUs deliberately move using the same controller.
Prices, capacity and speed remain authored in Game/shop.json.

The two-CPU fuel match `5e8fd269-c438-48fc-b673-d2a9508081cf` completed on turn five.
Both bought normal six-second fuel bundles and used native movement; all twenty
shells ended once and all 672 six-tick samples retained every survivor. The observer
kept a 120-frame tail, so this is sampled evidence. Ten save/reopen checks retain
exact bank, scores, winner, hull and motor state. Original names, scores, wallets,
stock and dialogue were restored from the fresh pre-test baseline, verified as
exact serialized strings. Diagnostic saves remain intact; no E2E profile was cloned.

See [fuel acceptance](evidence/m9-engine-candidates/ground-cpu-acceptance.json),
[save/reopen](evidence/m9-engine-candidates/ground-combat-roundtrip.json), and
[account restoration](evidence/m9-engine-candidates/accounts-restored-after-ground-cpu.json).
Local M5 layout and M6–M9 checks pass. Runtime polygon/ridge/neural work and explicit
save barriers are partly implemented; living generation, structural collapse,
penetrators/beams, next-cast accessories, E14 and complete E16 acceptance remain open.


### Engine contact filtering / direct-hit replay — 0.0.2504

The installed local candidate is built from engine `5598431ee`, app.asar
SHA-256 `d2b754bc77eb8a2b08d1da2a541dab23cdd1c23db0365a20353ee4310b8c985f`.
Packaged worker and loopback checks pass. All 30 enabled rigid-shell mods were
patched/read back through public authoring APIs with the catalog's solid/powder
loose-contact filter. Scripted child/death shells inherit the same policy.
Thin liquid curtains and bounded off-camera flights verify filtered shells reach
solid terrain; physical liquid forces remain active. The historical MIRV's exact
rain contact is still not identified.

The replay also found/fixed native on-body contact-only shots ending before
applying damage. Packaged hits now agree with actual health loss and native
resistance, retain the stored shooter's identity, and emit one hit before end.
CPU save `b0d456a3-7589-4cce-bf1e-3afcca1343bd` finished on turn 4 with Contact
Beta surviving: 22 shells ended once, four native damage/hit pairs, zero survivor
residency violations across 561 six-tick samples (bounded 120-frame tail). Eight
distinct-world save/reopen checks pass. Fresh account names/scores/wallets/stock/
dialogue strings were restored exactly and independently checked in storage.
Evidence is in `docs/evidence/m9-engine-candidates/matter-cpu-acceptance.json`.
M5-layout and M6–M9 local checks pass. Full M9 remains open for the documented
native growth/generation, weapons/accessories, transmutation/material and matrix
acceptance work. No original save or historical failure evidence was removed.


### Revised placement policy (October 23)

Tony superseded mandatory turn-boundary righting and pre-shot seating: only initial deployment requires settling. R and a HUD button request native upright posture during a human turn. CPUs use the same action when tilted; a blocked attempt never prevents aiming or firing. Initial placement may request bounded, conservative terrain displacement, excluding the solid foundation. This uses the native particle transaction and collision rebuild, not a game collision solver. Source checks pass; installed-app validation is in progress.

The earlier transient-contact stall remains preserved in save `c554162d-7ee0-4c47-8093-205a2c143322`. It did not reproduce after reopening or in the captured-terrain native fixture. The policy change does not establish its root cause or certify that observation fixed.


Tony subsequently relaxed initial placement too: all righting is best effort. Native spawns start upright; initial righting gets at most 60 simulation ticks, then deployment proceeds for complete, moving, blocked or refused outcomes. There is no terrain seating call in the game. R/HUD and CPU flips remain voluntary and cannot gate aiming or firing. The captured native seating failure remains open and disabled in this game policy. Final packaged replay of this policy is pending.


### Best-effort placement and world aim verified on 0.0.2516

Installed engine `b47deb8e3630007fdb92732d501df75b6dc65d90`; app.asar SHA-256
`82aad8376841ae3e0bf63c21d8bdc0a252a5051e10df93c112bbedb5496816fb`.
The [scoped acceptance](evidence/m9-world-aim-2516/aim-best-effort-2516-acceptance.json)
passes all revised placement/aim checks. This supersedes the pending status above.
Full M9 is still incomplete.

The engine keeps aim relative to the world horizon and provides `localAngle`
readback. A tank tilted 0.38178 radians retained its tilt while aiming up, diagonally
right and diagonally left. The real barrel followed each world direction; a real
90-degree shot launched vertically and completed once. Players and CPUs do not
subtract the hull angle. The HUD labels this WORLD AIM.

Fresh WFC seed 1729, two CPUs, save `e261514f-c73a-4626-b079-e1cf8734fb33`,
spawned both tanks upright. Best-effort placement took six ticks each and used no
terrain seating. The match finished on turn one, with 106 native launches/ends
including a MIRV and the hundred-shot death emission. Across 1,220 observed ticks,
all survivors stayed live at 25% zoom. Both presentations lasted 3.016667 simulated
seconds. Eight save/reopen checks passed. This flat start did not require a CPU
flip; prior packaged R-key and Brush Reach CPU-flip evidence remains applicable.

Exact fresh pre-test names, scores, wallets, stock and dialogue records were
restored and verified. The app is back at the undeployed setup menu. The retained
native hard-seating failure remains open; the game does not invoke seating or
require leveling before movement/firing. No original saves or profiles were
replaced, and no full E2E profile was cloned.


### Pale bar pickup report fixed on 0.0.2527

The reported disconnected pale bars were native NPC inventory drops, each
using the weapon templates’ simple gun art. The engine now exposes the generic
`dropInventoryOnDeath` template policy; Indigo’s M9 tank is authored false
through the public API and the installer retains that choice. The engine also
places enabled drops outside the corpse bounds and retains failed drops.

Installed source `2b8743367`, app.asar SHA-256
`da3da03bf6fe53ef9a7ef759751a1e933796a9e6a6e5262f604ccac9946d5cff`.
Worker/loopback package checks and 13,928 engine tests pass with zero TS errors.
A fresh real-tank native-death probe retained all 35 inventory entries and
created no pickups. Evidence: `docs/evidence/m9-death-loot-2527/`.

The four-CPU diagnostic `b1566f9e-6350-47d9-8802-2bc2f512275e` finished on
turn 36: 136 launches/ends, zero duplicates and zero survivor residency failures
across 26,161 observed ticks. No death weapon pickups appeared. Roster and bank
were exact after save/reopen; the fresh original account/dialogue strings were
restored and verified. Riot Charge/Blast and Dirt Charge each completed three
paid native uses; Earth Disrupter refused the existing fragment-capacity limit
and remains disabled pending explicit native loose-debris overflow acceptance.
All 327,680 foundation cells survived the twelve terrain attempts. Full M9 is
still incomplete; this is scoped acceptance of the bar report and retained
terrain diagnostics, not acceptance of all pending weapons or materials.


### Riot SMOKE replacement and terrain weapons accepted on 0.0.2530

Tony selected actual SMOKE conversion for Riot Charge and Riot Blast. Both now
use the generic native `terrainWork` recipe with `replacement: 'matching'`: only
authored eligible STONE/DIRT/SAND cells change. Air, hulls, unlisted materials
and the foundation remain protected. The directional wedges retain their world
aim, bounds and native completion wait. Dirt Charge uses empty-only DIRT fill;
Earth Disrupter uses the existing native fracture system with explicit bounded
loose-debris overflow. All four are enabled through public authoring APIs, with
workspace readback and existing template IDs preserved.

Installed source `7c55ffbb125891b5be680bce1100e1c085d3e49a`; app.asar SHA-256
`503b8e83576ae88107b13dcc85e14d090b4834c611eb62d4f8e1632c8bce1e6e`.
The signed local arm64 release passed 13,935 tests (one expected fail, 17 skipped),
zero-error type-check, production build, and packaged worker/loopback suites.
Those suites verify exact 64-cell matching-only conversion, a protected
same-material hull and foundation, excluded IRON, SMOKE at native 400 K with
finite life, real gas motion and eventual expiry. The native growth evaluator
honors the same replacement policy; its real-kernel regression passes.

Four-CPU save `1685f5ff-52f6-4e39-bd21-29df56838535`, seed 1729, retained its
real UI purchases across the upgrade and consumed exactly three charges of each
item. All twelve native operations completed. Riot Charge converted 5,798 cells
across its uses and Riot Blast 25,169, with actual SMOKE readback. Dirt added
1,153 cells. Earth retained all 4,683 selected cells as 4,463 body cells plus
220 loose cells, with no erasure. All 327,680 central foundation cells remained
STONE after the twelve uses and after completed-match save/reopen.

The match finished naturally on turn 20: 120 launches and 120 unique ends,
no survivor residency violation across 12,114 observed simulation ticks at
25% zoom, and no weapon-drop pickups. Bank and roster restored exactly on
save/reopen. Fresh pre-test names, scores, wallets, stock, preferences and
dialogue strings were restored exactly in durable installed storage. Original
saves and failure evidence remain intact; no E2E profile was cloned.

The first final editor-save call lost its bridge connection after successful
file writes. Independent readback showed both files intact; an isolated save
then succeeded in 1,879 ms. This is retained as an observability interruption,
not an asserted save-data defect. The template's pre-update difference from the
workspace was the earlier staged terrain implementation, verified before writing.

Full M9 remains incomplete. This does not accept the remaining penetrator/beam,
next-cast accessory, transmutation/material, procedural-source or matrix work.
The package is a local release, not notarized or publicly published.

Evidence: `docs/evidence/m9-terrain-2530/acceptance-2530.json`.
