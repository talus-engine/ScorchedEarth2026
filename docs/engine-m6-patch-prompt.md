# M6 engine patch prompt — material transformations, large fire brushes and correct sprays

Indigo is the artillery game in `/Users/tonygermaneri/gh/indigo`. Talus is in `/Users/tonygermaneri/gh/foxtrot`. We are testing installed **0.0.2497**, the accepted M5 release (`ff77aaf51d84716cab1df32a5ff4832c3b3ad325`). Do not regress its terrain persistence, per-actor controller, camera frame or independent projectile fixes.

Tony wants random, physically destructive tank deaths. He is the engine author and explicitly requests proper engine features instead of script workarounds. Implement the generic capabilities below, document them, release a new installed build, and then finish the disabled Indigo effects against the actual released API. Do not hardcode Indigo into Talus.

M7 follow-up: **E10 is still open** and affects both numeric damage and the explicit death-effect labels. The current reproduction and release requirements are in [the M7 damage-text handoff](engine-m7-patch-prompt.md). Its fix must preserve the new fixed-position speech bubbles.

## E14 — change an existing entity's matter, retaining its painted pixels

**Confirmed missing public capability.** See `docs/evidence/m6-capability-audit.json`: the live Entity API has no material mutation verb. `setTemplate` rebuilds a template; it does not transform the actual current wreck. `world.fill` fills empty cells only. Despawning and drawing a rectangle or spawning a replacement template would discard actual shape, damage, pose and pixel paint. Do not use those substitutions.

Add a supported entity/material operation that can:

- Transform all currently surviving material members of an entity, including multi-body hulls, into another element while preserving each pixel's birth color when requested. This must change the **element**, not recolor the tank.
- Work from a normal `death` callback and on a retained corpse later (the last-laugh sequence lasts 0.75 seconds). Specify event ordering relative to death hooks, ragdoll/final-frame conversion and disposal. Do not resurrect the entity, reset health, repeat death/loot events, or replace its stable identity.
- Handle solid-to-solid, solid-to-powder, liquid and gas transitions correctly. Converting a tank to HYDROCHLORIC_ACID must release real liquid with the transformed silhouette and paint, free invalid rigid members/constraints, and allow the acid to react normally. Do not leave a liquid-colored rigid collider. An indestructible living template must not silently suppress the opted-in wreck's chemistry.
- Address a small region relative to the entity's pose. After converting to DYNAMITE, replace the central **2×2** mote with actual FIRE, even though those cells are occupied. Ignite the physical explosive; do not substitute `world.explode` for dynamite chemistry. Define clipping and rotation behavior precisely.
- Update CPU/GPU member state, particles, material properties, ownership, render colors, native collider topology and persistence coherently. Queue safely across readback/capture; report accepted/completed/refused work honestly. Avoid speculative duplicate replay of deferred mutations.
- Preserve transformations and colors after streaming and save/reopen. Define behavior for stored, frozen, destroyed and unresolved handles. No silent fallback to template pixels.

API shape is the engine author's choice; prefer a reusable entity material mutation with optional local region and preserve-color setting, rather than separate tank-specific verbs. Publish typings, capability examples and tests. Existing implementation touchpoints include `src/scripting/api/{spec,runtime}/entities*` / `entity.ts`, `src/simulation/MemberStateRows.ts`, `RigidBody.ts`, `ParticleSimulationWASMHost.ts` death handling around 8765, `DamageManager.ts`, and `src/app/engine/hostScripts.ts` onDeath payload construction. These are research pointers, not a prescribed patch.

## E15 — supported large material brush during gameplay

**Confirmed missing script capability for this effect.** The user requests a random-magnitude nuke defined as a giant **FLAME brush at the tank center**. This palette's flame material is named `FIRE` (ID 6 in this world); no `FLAME` element exists. Resolve by name, not hardcoded ID.

`talus.world.fill` rejects bounding boxes larger than 128×128 cells (`ELEMENT_FILL_MAX_CELLS`, `ParticleSimulationWASMHost.fillElement`) and writes empty cells only. Indigo's proposed nuke varies over **96–240 world-pixel radius**. Existing `ai/action/Particle_Brush` reaches `spawnParticleBrush` through `hostCutscene.ts`, but its BT properties are literal coordinates and input pins are explicitly not routed. Do not create per-death database graphs just to transport a dynamic position.

Expose the runtime material brush as a supported gameplay API (or properly generalize an existing one), with dynamic world coordinates, a declared size/budget contract, and completion/refusal semantics. Reuse the engine brush's physical material behavior. Specify occupied-cell handling, world/body layer scope, clipping to active regions, capacity limits and capture/save safety. The tiny ignition replacement from E14 and this large brush may share machinery, but do not change ordinary fill's existing semantics accidentally.

This is a physical FIRE effect. Do not replace it with a screen flash, recoloring, arbitrary HP damage, or a script-tiled series of small fills to evade the current limit. Camera framing must continue to keep all living tanks active at 25%.

## E16 — particle sprays ignore the element's spawn temperature

**Confirmed installed-build defect, blocking actual flame, lava and cold emitters.** `spawnLooseParticles` in `ParticleSimulationWASMHost.ts` around 10345 allocates particles directly, then writes `life: 0, temp: 295.15` regardless of the element. Normal fill calls the common creation path with the element's `initialTemp`. The existing GPU spawner also honors element temperature. The TTL shader lazily initializes zero life, so do not misdiagnose immediate burnout from `life: 0` alone; temperature is the reproduced fault.

Reproduction: `tools/probe_m6_materials.py` launches an isolated CPU save and compares 64 particles from `world.spawnParticles` with an 8×8 `world.fill` control, in empty simulated air. After six simulation ticks it pauses and uses `particleTempStats(..., true)` to inspect live GPU matter. Evidence: `docs/evidence/m6-2497-material-probe.json`, world `405bcbdf-3f91-4dc1-933a-58a53f4cdb35`. All six locations are inside the same active ring.

| Requested material | Spray after six ticks | Fill control after six ticks |
| --- | --- | --- |
| FIRE (initialTemp 900 K) | 61 SMOKE cells, mean 325 K, no FIRE | 56 FIRE + 8 SMOKE, mean 885 K |
| LAVA (initialTemp 1400 K) | 4 BASALT cells in sampled region, mean 298 K, no LAVA | 64 LAVA, mean 1392 K |
| LIQUID_NITROGEN (initialTemp 70 K) | 64 NITROGEN gas cells, mean 295 K | 40 liquid + 24 gas, mean 84 K |

Counts are the sampled GPU occupancy, not a claim that every allocated overlapping spray particle survives. The large 96-radius fill is also explicitly refused in this same reproduction, supporting E15. Element definitions and a concise defaults extract are saved beside the probe. The probe completed; its original two-second navigation cleanup encountered a page reload race afterward. The diagnostic navigation helper now waits for actual session readiness.

Fix the generic public spray creation path to honor the active element definition and share the engine's correct particle initialization machinery. Audit life noise, birth-color reset, visual roles, CA parameter references, material/element presence, allocator ownership, uploads and persistence/capture exclusion; those lanes are audit requirements, not individually reproduced bugs. Do not heat/cool newborn particles with extra game-script brushes to compensate, and do not replace the spray with small fills.

Test FIRE heat and lifetime, LAVA remaining molten initially, cold nitrogen, acid and ordinary powders, recycled slots, capture overlap, streaming and save/reopen. Check visuals as well as return counts. Earlier M6 scheduling tests recorded accepted spray allocations; those counts **do not prove the requested physical effect**. Six spray-based catalog variants are disabled pending this repair.

## Finish the four staged game effects

The catalog is `world/Game/chaos.json`; ten other variants are implemented using current public APIs. Six of those use the spray API and are now disabled for E16; four shell-based variants remain playable. The four original feature gaps are:

1. `dynamite`: actual hull → DYNAMITE, preserve paint, central 2×2 FIRE.
2. `acid`: actual hull → HYDROCHLORIC_ACID, naturally eats terrain.
3. `nuke`: seeded random radius 96–240 FIRE brush centered on the wreck.
4. `last-laugh`: ten real shells in seeded random directions over 0.75 seconds, then transform the retained hull into DYNAMITE and ignite its center. Do not despawn the wreck before the finale.

After E16, re-enable and visually verify `furnace`, `thermite`, `oil`, `volcano`, `cryo`, and `sprinkler`, including their real physical reactions.

Keep selection and effect progress in match global state and the selected effect in the NPC blackboard. The scheduler is concurrent with normal turns. A dead shooter must not steal the primary shell's tracking, trigger two deaths, or award two scores. Shell ownership is the deceased tank's durable identity, so posthumous kills work. Particle chemistry currently reports environmental damage: do not invent kill credit if the engine does not retain causal provenance.

Ordinary turns continue while hazards emit. If at most one tank survives, wait for scheduled emitters and their real shells to finish, then a bounded three-second aftermath; never wait indefinitely for powders/liquids to stop. Chain reactions may yield a draw. M5's accepted game is preserved in `fixtures/m5/` and the original ready save is `b29dda01-c94c-4410-9d1f-a50ea1f51e94`.

The current four-effect preview passes a natural CPU match and completed-result reopen; a controlled physical chain test confirms 200 actual shell endings, posthumous credit, and a draw. See `docs/m6-results.md` and its evidence links. These game checks do not close E14, E15 or E16.

## Acceptance and release

- Unit/native tests for material mutation, paint preservation, multipart bodies, non-solid release, localized ignition, idempotent death delivery, invalid handles and capture overlap.
- Installed-build demonstrations of all six requested effects, with all-CPU games. Capture real material/color/topology evidence before and after transformation; measure exactly 2×2 ignition, 100 actual shell launches/detonations, ten shells in less than one simulation second, ten seconds of flame emission concurrent with advancing turns, and variable-size physical FIRE brushes.
- Include nearby deaths, overlapping effects, the current shooter dying while aiming/casting/in flight, posthumous kills, zero survivors, final-result timing and score idempotence.
- Verify all survivors and scheduled wreck emissions remain inside the active ring at 25%. Check streaming and save/reopen of transformed wrecks and resulting terrain; no missing chunks or restored pre-explosion ground.
- The older E9 transient-projectile save gap remains known. Do not claim mid-burst save/resume works unless the engine actually persists those projectiles. Game code currently stops explicitly if saved secondary shell handles are missing; do not silently delete or replay them.
- Run the repository's required TypeScript, unit, build and packaged checks. Test in the current profile or a small disposable fixture; **do not clone multi-gigabyte E2E profiles**. Clean up only profiles created for this task. Leave the user's names and scores intact.
- Record commit, installed binary/version/hash, focused evidence, test results and remaining limits in the Indigo engine work log. Release and install the fixed build before marking M6 complete.
