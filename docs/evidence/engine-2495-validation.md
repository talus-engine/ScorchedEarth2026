> Engine agent report copied before independent acceptance in the installed app. Its package was subsequently installed as Talus 0.0.2495; hashes are recorded in [build provenance](engine-2495-provenance.json).

# Indigo M1: rejected departure snapshot loses an untouched chunk

Follow-up to `adf204861`, tested on 2026-10-21/22. The earlier isolated
2493 validation did not cover the remaining failure Tony reproduced in
actual Indigo on 2494. This report supersedes its terrain acceptance.

## Reproduction and cause

The installed 2494 `app.asar` matches the reported SHA-256:
`0401374675477b33c77ea4c1392d98c9c38d7731181aa5bb2af64dd43b3dcdbd`.
The original combat save `5c0bd082-1ae1-4301-b719-fadeb0d7715a` and control
`9b903c72-7b0b-4407-ba1f-1dfbe2314662` were preserved. Initial read-only
bridge samples confirmed resident empty terrain at (3232,672) and STONE
in the three neighboring chunks. Original evidence was copied with a
SHA-256 manifest to `/private/tmp/indigo-followup/evidence-original`.

Diagnostics used a separate copy of the actual Talus project database and
settings, including Indigo's existing template, WFC catalogue, assets and
script. The copied database passed `PRAGMA integrity_check`. No fixture
was reinstalled and neither original save was used as a writable test.
Bridge calls use Indigo's `tools/bridge.py` with separate ports and token
file; credentials are absent from the reports.

A first replay audited the complete corridor before and after every shot.
It exercised the rejection path but did not lose ground. A second replay
kept the original four-shot timing and 1600×968 viewport, auditing after
combat. It reproduced **exactly chunk (50,10), all 4,096 STONE cells** in
fresh save `75a598ae-0eae-42b4-8cd7-fd6283228b86`. No other corridor chunk
lost material outside the actual explosion discs. The hole survived
save/reopen. Ownership, damage, death and hit-completion checks passed.

The ledger identifies the calibration shot as the first loss, rather than
the later high arc. Times below are milliseconds since enabling the ledger:

| Time | Chunk (50,10) event |
| --- | --- |
| 6,692 | WFC materializes 4,096 stored particle rows |
| 6,729 | All 4,096 rows load into live slots |
| 8,465 | Departure capture starts with the chunk's 4,096 owned slots |
| Between capture and retry | The first shell detonates at (4682.265625,640); the chunk transaction rejects its handed-off snapshot because the explosion is deferred |
| 8,555 | The retained chunk is reactivated; `loadSkip` sees it as already loaded |
| 8,574 | A retry captures the same 4,096 owned slots, whose GPU rows are still zero |
| 8,607 | `unloadParticlesFromChunksCPU` commits 4,096 → 0 stored rows |
| 32,912 | Reload reads the saved empty chunk |

The explosion's carve radius is 48, far from this chunk. The failure is
not an import gap, a dead-row reclamation, or a legitimate crater. The
departure snapshot was the only live copy: extraction had zeroed its GPU
rows. `takePrelandedFor` transferred it into
`syncParticlesToSpecificChunks`, whose deferred-mutation guard threw
**before** that method's snapshot restoration/release scope. The retry
therefore persisted zeros. Editor mode does not use this game departure
handoff, explaining the mode difference.

See [the reproduced loss and neighboring chunk histories](engine-2494-loss-diagnosis.json).
The instrumented no-loss replay is retained separately; it is not treated
as evidence that 2494 was fixed.

## Change and regression coverage

`syncParticlesToSpecificChunks` now owns an incoming snapshot from method
entry. Its existing restore/release scope includes preflight, capture
preparation, classification and staging. A rejected extraction restores
its original rows and sidecars before release; the established allocation
restamp prevents an older dead-row report from reclaiming the put-back.

The pending-explosion guard still rejects a new capture. The fix does not
weaken the mutation lease or reorder damage/hit/end events. Earlier
capture, dead-row, body-retirement, WFC, owner and callback fixes remain.
No game scripts repair terrain, no whole-arena residency is added, and no
saved terrain is regenerated. Existing damaged saves are not repaired.

The new regression failed against 2494 because the extracted snapshot was
neither restored nor released. It covers a deferred blast and another
early preflight exception, exact particle words and sidecars, delayed
dead-row protection, and continued refusal of a new capture while a blast
waits. The browser flight regression now establishes a full 192-chunk
baseline, audits after each flight, compares untouched particle records,
and verifies exact persistence after reopen.

## Candidate validation

| Check | Result |
| --- | --- |
| Full unit suite | 1,114 files passed; 13,682 tests passed, 1 expected failure, 17 skipped; no unexpected failures |
| Type-check | Exit 0; required TS error count 0 |
| Production build | Passed, including type-check, Vite bundle and documentation |
| Plain game terrain | Four camera round trips, zero changed chunks and no storage wipes; save/reopen fingerprints match |
| Flight corridor browser regression | All 192 chunks checked before firing and after each of three shots; no unexplained material loss or changes to untouched particle records; exact persistence after reopen |
| WFC import regression | HTTP import over visited blank footprint children, live editor/reopen/seeded game, three camera trips; zero changed chunks |
| Entity projectile regression | Passed, including fragments and durable source attribution |
| Title-screen regression | Passed, including explicit seed 0 |
| Packaged M1, original combat timing | 23/23 original checks passed; 192 chunks with zero unexpected loss, exact terrain particle fingerprints after camera trips and save/reopen; no storage wipes |
| Packaged M1, baseline and per-flight audits | 23/23 original checks passed in a second fresh save; all 192 chunks intact before firing, zero unexpected material or particle changes after each of four shots, exact hashes after three camera round trips and save/reopen |
| Packaged desktop smoke | All checks passed: Apple Metal WebGPU, native isolation, OPFS, bridge input/tools, editor boot, no uncaught errors or crashed child processes, and exit arbitration |

The packaged corridor audits inspect every cell in columns 0–95, rows
10–11, and hash complete STONE terrain particle records, independent of
allocator slot numbers. Rigid-body rows are excluded from terrain hashes:
their session body IDs legitimately change on restore, and the separate
entity checks verify durable identity, health, name, inventory and markers.
Only the actual radius-48 explosion discs, with cell-center rounding, may
contain missing terrain. Save/reopen must preserve the resulting terrain
and crater hashes exactly.

Both packaged runs additionally passed exact survivor name/identity,
inventory item IDs/equipped item/ammunition, and one-living-roster-member
checks after reopen. The second run reproduced the reported calibration
impact at (4686.265625,639.75), then completed two damaging shots and the
high arc without the missing chunk. The same deferred-mutation rejection
remains observable; it is now a safe retry instead of a discarded terrain
snapshot.

Detailed [per-check acceptance, combat events and all corridor hashes](engine-2495-acceptance.json)
cover both candidate saves. The final preservation readback confirms that
the original application still has the original combat save open at
(3200,640), its hole is still empty, its neighbors are STONE, and both
supplied saves still exist.

Visual evidence: [original 2494 hole](engine-2494-hole.png),
[2495 intact corridor after reopen](engine-2495-intact.png),
and [2495 intentional craters after reopen](engine-2495-craters.png).

Local macOS arm64 candidate: **0.0.2495**, based on `adf204861` plus this
patch. Ad-hoc signed; not notarized, installed or published. Release with
Tony after review. This is an engine prerequisite, not completion of the
full artillery game.

```
app.asar  6439f69bd6e8993032dfcab5fa992df1a164538933cff1480edbeb20f63d46f0
DMG       3de4e674dc925404fc9749557bf86ce76d835bf305023419a375577bc608ba40
ZIP       de38ffefc6078ba143e42657d5dcc9fac553792f429e9574c8fb6ae80183d8a4
```

Raw replay reports, per-stage ledgers, build/test logs, copied diagnostic
profiles and the preserved 2494 ZIP are under `/private/tmp/indigo-followup`.
