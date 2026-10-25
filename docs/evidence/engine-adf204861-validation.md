# Indigo M1 engine validation

Candidate based on `e369493bdad2fd0cbc754ba99587f69e33de0199`, with the
engine patch described below. Validation date: 2026-10-21/22.
This is an engine prerequisite for the game, not acceptance of the full
50×5-tile game or authorization to publish a release.

## Terrain integrity

The game-mode failure reproduced with ordinary painted terrain, without
WFC: repeated camera trips lost progressively more chunk-shaped regions.
The game departure path extracts rows from the GPU before their storage
transaction commits. Those temporary zero rows were being reclaimed as
dead particles. Incoming terrain reused their slots, and the departure
then persisted incomplete or empty data.

The patch preserves ownership throughout capture, producer handoff and
transaction consumption. Unused extracted snapshots put their rows back;
full-world save barriers return held rows before reading them. Put-back
also advances the allocation sequence so an older dead-row readback
cannot free the restored rows after their capture is no longer held.
Overlapping captures track edits independently, so an edit associated
with an older snapshot cannot invalidate a newer snapshot indefinitely.

The projectile-following replay exposed another loss after ordinary camera
trips passed: a destroyed shell's GPU body remained active after its member
slots were reused for terrain. The stale body moved those terrain particles
to the shell's old pose. Body retirement now disables its GPU writer before
the allocator can reuse its slots. CPU pmap consumers also validate a
particle's position and plane, preventing a stale same-material slot from
being treated as a current collision or carve target.

No change pins the battlefield resident, repairs game terrain from scripts,
or regenerates saved craters. The tests compare full per-chunk particle
records as well as material cells. The M1 bridge replay additionally audits
every ground cell across chunk columns 0–95, rows 10–11 (192 chunks),
allowing only the actual explosion discs.

## Import, references and projectile completion

WFC import now uses the World Layout session's authoring operation, updating
the live layout, area catalogue, persistence and undo together. Unbaked
footprint children follow their owning generator instead of stale blank
template snapshots. An explicitly baked cell remains authoritative; baking
one anchor does not implicitly bake all its children. Modified game chunks
remain authoritative over template generation.

A saved entity's `stableId` already survives streaming and save/reopen. Its
numeric live body ID is temporary and can be reused. Projectile owners,
payloads, damage-over-time sources and script references now retain the
durable entity reference; damage and graph hooks resolve the current live
body when needed. Stored shooters retain source/killer identity. This does
not change the identity format or migrate saved data. Transient projectiles
themselves still have session-local projectile IDs.

Entity graph hooks obey residency: a stored entity has no live blackboard
to execute on, so its graph hook is skipped rather than run on a recycled
body ID. Global and bound script callbacks still receive the durable owner.

Deferred explosions retain their completion callback. Damage and death
resolve before `projectile.hit`, followed by payload and `projectile.end`.
World teardown cancels pending projectile completion. Tests cover immediate
and deferred resolution, duplicate completion, teardown and recycled live
body IDs.

Authored menu seeds are resolved before world creation, including zero;
blank requests a fresh random seed and an omitted field uses settings.
Generated and redrawn entity parts carry their plan indices, matching the
saved joint endpoints.

## Validation record

| Check | Result |
| --- | --- |
| Complete unit suite | 1,114 files passed; 13,679 tests passed, 1 expected failure, 17 skipped; no unexpected failures |
| `npm run type-check` | Exit 0, zero TypeScript errors |
| `npm run build` | Passed, including type-check, production bundle and documentation build |
| Plain terrain, game-mode camera trips | Four trips, zero changed chunks; full particle fingerprints preserved through save during departure and reopen |
| WFC import over previously visited blank chunks | Passed through real HTTP bridge: live editor, reopen, seeded game, three trips with zero changed chunks |
| Authored title-screen seed | Passed with explicit seed 0 and preserved launch parameters |
| Entity projectile and fragments | Passed with durable owner and explosion source |
| Generated entity parts | Generation/redraw unit tests passed; real HTTP generation and saved database readback confirmed three unique body indices matching both joint endpoints |
| Full shell-flight corridor browser test | Passed: three long-range shots, 192 ground chunks with no loss outside actual blast discs; exact particle fingerprints preserved after save/reopen |
| Packaged macOS arm64 build | Passed; version 0.0.2493, ad-hoc signed |
| Packaged desktop smoke | All checks passed, including Metal WebGPU, OPFS, bridge input/editing and exit flows |
| Packaged bridge M1 replay | All 48 checks passed: normal x=400 start, long-range shot, shooter parking/target restoration, two damaging hits and death, high arc, durable attribution, hit-before-end, one survivor, state and inventory restoration, camera trips and save/reopen |
| Packaged full-strip terrain audit | All 192 chunks passed before and after reopen: zero missing cells outside actual blast discs; every audited cell matched exactly |

The full unit suite was rerun outside the sandbox so its localhost test
servers could bind. One earlier unit run exposed a brittle fixed-length
source assertion; it now uses the method boundary. The first new browser
flight test had mistakenly enabled vertical arena copies and collided
with repeated floors; its fixture now explicitly authors a single arena.

Candidate SHA-256:

```
app.asar  131aba5275a07912906fdf58999a79c5e36102262712fb25948f2e8b74841b22
DMG       674135c2d7fd05ff823f2e4f9c1770fbec40ecdece099b63361127dff6f82d0b
ZIP       88d3694e6108c54e3a68890b08d5afee6649c3e7d61a3500ef6af96fd912334f
```

The packaged replay's survivor retained
`instance@spawn-96a9b0c6-0e07-408a-a95c-2bac2c23b12f` through parking and
reopen. Its numeric live ID was 0 initially, 3 after its first return,
16 before reopening, and 0 after reopening. Health remained 100; name,
inventory and the blackboard marker were preserved. Two direct hits
reduced the target from 100 to approximately 39.39 and then 0. The target
remained dead after reopen, leaving exactly one living roster member.

Reviewable evidence: [acceptance checks and events](engine-adf204861-acceptance.json),
[survivor ground after reopen](engine-indigo-m1-home.png), and
[craters after reopen](engine-indigo-m1-craters.png). Both screenshots were
visually inspected; the home ground is continuous and the impact area has
the intentional round craters without the prior square missing regions.

Raw local logs and bridge evidence are in `/private/tmp/indigo-resume`.
The original application on port 3702 and the original Indigo save were
not used as writable validation fixtures. Candidate tests use isolated
browser/desktop profiles and fresh games.

## Release limits

The local package is macOS arm64, ad-hoc signed and not notarized. Intel
macOS and Windows have not been validated. Generated multipart validation
uses deterministic mocked model replies through the real HTTP generation
and database save path; it does not assess generated artwork quality.
Menus, AI, the complete map, turn flow and production scoring UI remain
game work. Publishing a new release requires coordination with Tony.
