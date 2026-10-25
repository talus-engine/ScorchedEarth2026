# M8 engine patch prompt — purchased mobility, terrain tools and defenses

## Engine release 0.0.2498 — 2026-10-22

Engine commit: **8e0b0647104ca6cb797f400e2004b1c71810998a**. The local 0.0.2498 release implements E17–E20, the M8 runtime recipe extension, and E10. The staged items are enabled after native and CPU-match verification. See [current M8 results](m8-results.md) and [acceptance evidence](evidence/m8-engine-2498/acceptance.json). E14, the separate M6 large FIRE/E16 physical acceptance, and E9 remain open. The original request below is preserved as the acceptance contract.


Complete the reusable engine capabilities needed by Indigo's armory, make a release, then integrate and verify the staged game items. Tony is the engine author: fix missing capabilities in the engine rather than approximating them in game scripts. The cash economy, store, persistent stock, weapon selection, heavy shells, crumble shells, excavator shells and repair batteries already run through public APIs. Unavailable items are visible but cannot be purchased.

Project: `/Users/tonygermaneri/gh/indigo`. Engine: `/Users/tonygermaneri/gh/foxtrot`. Investigated Talus **0.0.2497**, commit `ff77aaf51d84716cab1df32a5ff4832c3b3ad325`. Read the engine's AGENTS.md. Preserve unrelated work, including `docs/plans/simulator-navigation-overview.md`. No engine source was changed for M8. Use the installed profile and small diagnostic saves; do not clone E2E profiles.

Read [M8 research](m8-research.md), `world/Game/shop.json`, `world/Scripts/match.ts`, and [capability evidence](evidence/m8-capabilities.json). Keep the existing [M6 material work](engine-m6-patch-prompt.md) and [M7 damage-text fix](engine-m7-patch-prompt.md) open until their own acceptance passes. E15 below extends the existing brush request; it is not a duplicate bug. E9 transient projectile persistence also remains outside this acceptance unless deliberately included.

**Tony reconfirmed during M8 that damage numbers are still static. Include E10 in the next release; it remains a visible defect.** Dialogue is a separate game correction: M8 now stores its shuffle bags in `indigo.dialogue` across rounds so repeating a terrain seed does not repeat the phrase sequence. Preserve that state and the stationary speech presentation.

## E17 — public NPC levitation and consumable fuel

Talus already has a native levitation controller. `src/simulation/CharacterControllerConfig.ts` defines enabled/time/acceleration/max-speed/recovery parameters. `CharacterMovementSystem.ts` consumes `intent.wantsLevitate`, uses `body.levitationRemaining`, applies thrust and suppresses gravity, and refills according to recovery settings. The public Entity interface exposes neither the intent nor authoritative remaining fuel/refill operations. Setting an arbitrary blackboard field does not drive that native controller.

Expose a typed, documented character-controller intent/state contract usable by scripts and behavior graphs for NPCs and players. It must support held/released levitation, current/max fuel, adding a bounded purchased quantity, and disabling automatic recovery for consumable fuel. Follow the existing native movement/collision solver; use seconds consistently at the public boundary and document conversions. Stop thrust on input release, empty fuel, actor death, end of turn, cancellation and disposal. Define save/stream restoration and return explicit refusal for unsupported entities.

Integrate `jetpack`: one purchase adds six seconds of thrust, capacity/fuel are visible, humans can hold a control during their turn, CPUs can deliberately use it. Fuel only drains while native thrust is applied. Do not emulate levitation with per-tick velocity writes or make purchased fuel regenerate for free. Test ceiling/wall collision, exhaustion, partial refill, repeated purchases, death, turn transitions and save/reopen.

## E18 — powered terrain excavation for an actor

The current public world API has fill, particle spray, explosions, ray/surface queries and selected simulation tools, but no supported excavation/erase brush at a live actor's working face. An explosive riot shell is implemented; it is a different item from a powered vehicle burrowing through ground.

Add a reusable, bounded runtime excavation tool/operation with an explicit shape and pose, material eligibility/hardness, terrain-only ownership filtering, author bounds/exclusions, authoritative work amount and completion/refusal. It must not erase the actor's hull or other rigid entities. Coordinate particle mutation, terrain collision rebuild and character movement so the tank enters newly cleared terrain safely. A game must be able to exclude the arena's solid foundation and charge fuel only for accepted work. Define behavior at unavailable chunks and save/teardown; no silent partial success.

Integrate `digger`: five seconds of powered burrowing per purchase, visible remaining fuel, human direction/activation, a CPU use case, and real terrain alteration. Preserve the bottom stone tile row through the authored bounds/material policy. Do not simulate tunneling by teleporting the tank or chaining hidden zero-damage explosions. Cover mixed powder/stone ground, no work against ineligible material, boundaries, self-exclusion, overlapping tools and collision consistency.

## E15 extension — runtime seeded noise/flood brush at projectile impact

The existing M6 evidence establishes that runtime fill is empty-only and capped at a 128×128 box, while the graph brush has literal coordinates without routed dynamic inputs. M8 needs the editor's actual noise/flood recipe machinery at a live shell's impact point. `spawnParticles` is not a noise/flood fill, and hand-written JavaScript noise or a rectangular fill is not the requested feature.

Expose the shared recipe evaluator through a typed runtime operation and dynamic graph inputs. Include seed, bounded shape/region, connected fill constraints where applicable, noise/material recipe, replacement policy, maximum particle/work budget, and a completion receipt reporting accepted/skipped/rejected work. Define chunk acquisition and mutation ordering with explosions/rigid bodies, independent projectile regions, cancellation and persistence. Preserve material initialization temperatures; coordinate with E16. Do not make the game recenter the camera to manufacture residency.

Integrate `sand`: three charges per bundle; each real projectile resolves into a bounded noise-filled bank of actual SAND at impact, using a seed derived from the round and shot. Keep the floor intact, keep all surviving tanks at 25% zoom active, and ensure added sand collides and settles. Validate deterministic brush output, actual material readback, edge impacts and nonresident-flight impacts. Finish M6's large FIRE-brush acceptance separately before enabling its nuke variants.

## E19 — purchased deflection fields and pre-damage shields

Physical material magnetism already exists (`src/simulation/MagneticBodies.ts` and the field solver). The missing capability is a supported, authored, owner-bound gameplay field with finite energy and projectile filtering, plus native damage absorption. Do not claim the engine has no magnetism, and do not route every shell through a script velocity loop.

Provide an engine-owned field/shield component with radius/strength or absorption capacity, activation/deactivation, finite power, lifecycle/state queries, filters, and typed events. Deflection must affect the actual projectile simulation including bounded independent flight, respect world and actor residency, and preserve the shell's original durable source for self/friendly/enemy damage credit. Specify overlapping fields and any response limits. Ballistic prediction should either account for known fields or explicitly report the unsupported situation. Expose enough information for CPU decisions.

Shield absorption must occur before hull health is reduced, with truthful requested/absorbed/applied damage in events. Do not heal damage back afterward; that can already trigger death and chaos. Indigo pays damage cash on actual damage, not fully absorbed hits. Integrate `magnet` and `shield` with finite purchased charges/capacity, UI state, activation controls and CPU behavior. Test depletion, overlap, self-owned shells, source death/unload, chain reactions, save/reopen and teardown.

## E20 — valid numeric fuse rejected by template patch validation

**Confirmed defect, not a missing projectile feature.** `ProjectileEmitter.ts` and `RigidBodyProjectiles.ts` support `detonate.fuse?: number` in seconds. The public tool rejects adding `fuse:4` to an existing detonation record containing boolean switches:

```json
{
  "basedOn": "indigo/m5-shell",
  "name": "indigo/m8-fuse-validation-probe",
  "patch": {"itemData":{"modSpec":{"projectile":{"detonate":{"fuse":4}}}}},
  "allowNewKeys": true,
  "dryRun": true
}
```

Call `save_entity_template` through HTTP/MCP. It returns HTTP 422, `itemData.modSpec.projectile.detonate.fuse: expected boolean, got number`. Retained [dry-run evidence](evidence/m8-fuse-validation.txt) saves nothing.

`src/ai/orchestrator/templatePatch.ts` infers a homogeneous open-map type from two or more same-typed example values (`mapValueKind`). A fixed record containing only authored boolean fields is therefore misclassified as a boolean map; `mergeInto` rejects the valid new numeric field even with `allowNewKeys:true`. The tool handler in `gameAgentTools.ts` refuses the whole patch.

Correct schema validation generically: distinguish known fixed records from actual maps and validate mixed-type optional members against the real model. Preserve rejection of wrong primitive types, invalid finite numbers and invalid map values. Do not special-case Indigo or disable validation globally. Add regression coverage for numeric fuse beside boolean switches, dry-run/no-write, actual save/readback and other mixed records. Do not work around this by clearing the detonation object and adding it in a second write or writing raw database rows.

Then enable the staged `ricochet` catalog entry and run `tools/install_m8.py` from the template editor. Verify actual bounces, on-body impact, a four-second fuse, lifetime handling, damage/carving exactly once, paid ammunition consumption and cash events. A template accepted by the validator alone is not acceptance of the projectile behavior.

## Release and end-to-end acceptance

1. Add documented typed scripting/graph APIs through the engine's existing spec/generation paths. Keep shared implementation ownership, explicit failure and cancellation, bounded native work and session cleanup. No game-specific engine branches or per-frame Vue update storms.
2. Complete focused unit/integration regressions, engine-required checks, type check, production build and packaged worker/loopback coverage. Install a new release and record version, commit and artifact hash.
3. Finish the staged Indigo items through public authoring APIs. Expose usable controls and stock/fuel/capacity in the HUD/shop. Unavailable items must stay disabled until physically verified. Prices and rates live in `world/Game/shop.json`; retain the free unlimited field cannon.
4. Run CPU-only matches that buy and actually exercise every new item. Preserve names, scores, wallet, stock and dialogue from a fresh pre-test baseline. Include damage to self, misses, landings, posthumous shells, utilities, empty stock, insufficient money, next-round purchases and seeded map creation. Verify unused supplies carry and completed payouts cannot duplicate on reload. Include a purchase immediately followed by next-round navigation, since installed-state writes are coalesced. Confirm script/installed-state readiness before external-agent writes; editor identity alone did not establish it during M8's final preparation. The retained retry evidence does not yet isolate an engine durability defect.
5. Visually inspect the effects and terrain, read back material/fuel/health, and save/reopen at supported boundaries. Preserve 50×5 WFC generation, solid bottom row, 25% survivor framing, fixed-position speech and bounded post-impact waiting. Do not certify physical material behavior solely from a job/allocation count.
6. Update this prompt, the engine work log and M8 results with evidence and remaining limits. Do not close E10/E14–E16 merely because M8's economy tests pass.

The live template now uses M8 schema 8. Historical M5–M7 replay commands expect their own fixtures; adapt the current M8 diagnostics for the released engine rather than overwriting the current economy with an old match script. Local checks `check_m5_layout.cjs`, `check_m6.cjs`, `check_m7.cjs` and `check_m8.cjs` already target current source.
