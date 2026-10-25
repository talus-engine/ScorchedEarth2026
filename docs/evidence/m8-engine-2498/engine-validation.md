# Indigo M8: native purchased utilities and transient damage text

Base: `ff77aaf51d84716cab1df32a5ff4832c3b3ad325`. Release: 0.0.2498,
Apple Silicon macOS. Engine commit: `8e0b0647104ca6cb797f400e2004b1c71810998a`.
The original Indigo profile was used with separate small diagnostic saves;
no profile was cloned. Existing saves, prior failure evidence and
`docs/plans/simulator-navigation-overview.md` were preserved.

## Engine contracts

- `Entity.controller` exposes held/released native levitation, bounded fuel
  transfers and authoritative state in seconds. Authored duration remains in
  milliseconds. Consumable controllers start empty with recovery disabled.
  Intent has an owner and ends on disposal, cancellation, death and streaming;
  fuel persists. Per-actor native collision and controller configuration remain
  authoritative. Behavior graphs use the same operations.
- `talus.world.terrainWork` runs a bounded, serial native operation. Excavation
  filters terrain ownership, material hardness, actor reach, author bounds and
  exclusions. Recipe/flood work uses the editor's shared WASM recipe evaluator,
  supports routed graph inputs, and returns actual work rather than allocation
  estimates. Budget/capacity failures refuse the entire plan before mutation.
  Waiting never holds the mutation lease; save/disposal cancels pending work,
  while committed work retains its completion receipt.
- World-plane particles now step in admitted remote simulation-anchor cores
  using a bounded sparse chunk lookup alongside the dense camera grid. This
  enables sand to settle at independent projectile impacts without following
  the projectile or keeping the arena resident. Other particle planes and
  camera-window air/heat/EM fields retain their existing reach; this is not an
  off-screen heat-solver implementation.
- `Entity.defenses` stores finite shield and deflector components on the durable
  root. Shield absorption precedes health loss, reports requested/absorbed/actual
  damage, and cannot trigger a heal-after-death race. Deflectors apply actual
  forces to native rigid-body projectiles, retain original ownership and cap
  overlapping response. Stored/frozen owners exert no field; death disables it.
  Analytic aim explicitly refuses known active fields; the game uses authored
  exploratory powers until fields deplete.
- Template patch validation derives fixed records, maps and optional mixed
  members from `EntityTemplateData`, rather than guessing map types from example
  values. Numeric fuse beside boolean switches is valid. Tests check generated
  schema freshness, invalid primitives/maps/non-finite values and atomic refusal.
- Transient text has one page presentation owner and a monotonic clock, including
  while paused. Native damage crosses worker/loopback boundaries once. Text
  rises in screen pixels at 25% zoom, fades, expires and clears on teardown;
  explicit text retains its size/color/lifetime and Show Damage distinction.
  Indigo's duplicate numeric label was removed; stationary speech is unchanged.

Two supporting defects were exposed by actual replay: required saves omitted
runtime-drifted chunks, losing additions to formerly empty procedural terrain;
and multiple terrain collider begins could pay a ricochet bounce more than once
per physics step. Required saves now include drifted state, without making it
authored terrain. Bounce reporting coalesces a step's contacts and requires an
outward response for fuse-only shells, excluding resting/sliding contacts.
Previous departure, dead-row, durable-source and deferred-hit protections remain.

## Verification

| Check | Result |
| --- | --- |
| Full unit suite | 1,122 files, 13,760 tests passed; one expected failure and 17 skipped |
| Type check and production build | Zero TypeScript errors; production bundle and generated API documentation built |
| Public template patch | Numeric `fuse: 4` dry-run writes nothing; real save/readback retains fuse and boolean switches |
| Native controller | Capacity 12 seconds; bounded purchases, partial refill, exhaustion, no idle regeneration, ceiling/wall collision and release tested |
| Streaming and save | Fuel 3/12, shield 30/60 and field 2/4 survive real park/restore and save/reopen; live body ID changes, durable ID does not; parked field absent |
| Death and posthumous source | Death removes movement control and disables defenses; the dead owner's real shell retains its durable source and ends once |
| Excavation | Actual stone removal, hardness/work receipt, body exclusion, protected foundation, no-work repeat and movement into cleared terrain verified |
| Remote sand | 735 SAND and 512 STONE cells retained after save/reopen in the first remote fixture; exact full census, camera unchanged |
| Real remote impact | A real independent shell impacts around x=9552; native seeded recipe adds 738 SAND, all present after settling on 512 STONE cells, camera unchanged |
| Shield and deflection | Native trajectory comparison plus actual CPU combat: shield absorbs exactly 60; field consumes exactly 6 power and depletes; actual hull damage pays cash |
| Ricochet | Physical bounce, body impact, four-second fuse (4.033 simulation seconds including completion), lifetime detonation and expiry-only paths; exactly one damage/carve resolution |
| Actual five-CPU match | Finishes turn 42 with one survivor; 166 real shells including death effects, exactly one detonation/end each; every hit precedes end; no duplicate same-step bounce |
| Final installed two-CPU match | Finishes turn 5 with one survivor; 15 shells resolve once each; 2,640 audited ticks with no survivor parking; two sand banks add 8,156 and 8,649 particles |
| Framing | 13,230 audited simulation ticks, zero survivor residency violations; all 441 recorded camera frames at 0.25 zoom |
| Terrain after combat | All 655,360 foundation cells across 160 chunks intact before and after save/reopen |
| Economy and navigation | Finished-save reload does not repeat payouts/scores/purchases; manual purchase followed by next-round navigation in 26 ms retains ammunition; seed 123, names, stock and automatic CPU purchases reconcile |
| E10 visuals | Actual CPU hit: one 77 label rises/fades/expires; a real death launches a secondary shell, producing separate 15 and 16 labels that expire; paused explicit 900/1800 ms labels expire as requested |
| Final E10 replay | One native 54 label rises and expires in the installed release; a visible 30-second label clears on save/reopen at 10.82 wall seconds; payouts unchanged |
| Game source checks | Current M5/M6/M7/M8 checks, native-utility accounting checks and strict generated-API type check pass |
| User state | Original preferences, scores, wallet/stock and dialogue restored byte-for-byte in durable storage; app returned to the original title screen |

Packaged worker/loopback smoke results, final installation, hashes and restored
installed-state verification are recorded in the
[acceptance JSON](evidence/indigo-m8-engine-2498-acceptance.json). Both packaged
smoke modes passed, including native input, OPFS, bridge tools and exit flows.
Candidate 8's installed `app.asar` was
`07f582d33b5a688667589ef296b59f97b648dd25469c7dfc0b9e8c4c049ee75a`.
The final bundle changes the build-number display; simulation implementation is
identical. Final packaged `app.asar`:
`9f569ededc042f0c471eff83d5a55eac211c05a6f59ad817c24b99d0d711bb0b`.
This is a local ad-hoc-signed release, not a notarized/public release. Intel and
Windows runtime validation is not claimed.

## Retained limitations and evidence

E14 wreck/material conversion, M6 large FIRE-brush acceptance and complete E16
physical-material acceptance remain open. Shared material creation now uses the
active catalog's initial temperature, but that does not certify combustion,
corrosion or cooling. Nuke variants remain disabled. E9 transient in-flight
projectile persistence is outside this release; save at supported quiet bounds.
Deflection supports native rigid-body projectiles and explicitly refuses other
kinds. Shields absorb selected health damage, not knockback/status riders.

The public API spec files document limits, cancellation and persistence. Raw
reports, timed screenshots and reproducible harnesses are retained in
`/private/tmp/indigo-m8-engine`; curated evidence is also retained in Indigo's
`docs/evidence/m8-engine-2498/`. Diagnostic saves include the finished combat
`11e06129-fd29-4416-b653-6b74f03f8467` and native course
`5ad3b549-3361-45e9-ba60-558da786a14b`. Failed candidate/save evidence remains
intact. Test attempts that sampled an outgoing same-world session, stopped at
transient frozen residency, or omitted round-two CPU purchases are retained and
are not counted as engine passes.

The older M5 disposable profile was inactive and occupied 6.9 GiB. Its 3,951
regular files were archived and compared by SHA-256 before removing the original
copy; symlink targets were also checked. The preserved archive is
`/private/tmp/indigo-m5-engine/profile-preserved.tar.gz` (1.13 GiB). No diagnostic
save was deleted. Free disk space returned to about 18 GiB. The restoration guard
reads installed values as JSON text so inspector formatting cannot round a
fractional fuel value and falsely report a readiness mismatch.
