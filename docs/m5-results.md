# Indigo M5 — camera and terrain movement

**M5 accepted on Talus 0.0.2497.** The installed application matches the engine agent's release artifact and clean local commit `ff77aaf51d84716cab1df32a5ff4832c3b3ad325`. [Independent provenance](evidence/m5-2497-independent-provenance.json). E12 movement and E13 camera/streaming are resolved for the tested milestone.

The game requests real **25% zoom**, updates a frame around every surviving tank each simulation tick, and constrains shell/impact tracking to that frame. All tanks fit at the current 1600×968 window. Smaller windows report a visibility limit while preserving tank residency. Independent shells use the engine's bounded flight streaming when they leave the camera ring. The 50×5 mixed WFC world and solid-stone bottom row remain intact.

The configured controller now crosses pixel obstructions and small steps using engine collision handling. No game-side step teleport, auto-jump or terrain repair was added.

## Independent installed-build replay

All **16 checks pass** in the [new replay](evidence/m5-2497-recheck-replay.json):

- A parked/restored diagnostic tank crosses the lone pixel and four-/ten-pixel steps in both directions, stops at the forty-pixel wall, and retains its durable identity and 100 HP. The authored 0.5-pixel skin is retained. [Course trace](evidence/m5-2497-recheck-course.json).
- A clean four-CPU match finishes on turn 10 with one survivor and 10 real shots. Across 3,660 observed simulation ticks, every surviving hull stays live inside the active ring at 25% zoom. Every shot detonates and ends exactly once, after its hit notifications.
- Completed-match save/reopen preserves identity, health, winner, zoom and the camera constraint; scores are not duplicated.
- Original remembered settings and scores are restored exactly. The test match is `37cdce95-ef52-4524-abcb-4e4b0289d980`; the app returns to the agent's untouched ready world `b29dda01-c94c-4410-9d1f-a50ea1f51e94`, with Tony and Copper, zero humans, seed 7 and thirty-second turns. [Ready screen](evidence/m5-2497-ready.jpg).

The first independent attempt stopped on a diagnostic name-length error before deployment: its long report label caused both generated names to truncate identically. The runner now reserves space for each numeric suffix. That [invalid attempt](evidence/m5-2497-independent-replay.json) remains recorded. The final return to the user's save required continuing from the title screen after navigation completed; the replay helper now explicitly waits for that transition. Neither harness issue was treated as an engine regression or a passing game check.

TypeScript against the installed declarations, Python compilation and the 2–16-player layout/input-boundary checks pass. The installed production script matches `world/Scripts/match.ts` exactly. This replay uses the existing installed app and creates no browser-profile copy.

## Engine verification and scope

The engine agent reports **44 passing acceptance checks**, including fresh and streamed actors, two controller profiles in both registration orders, a mixed stone/sand ramp, two-/four-/sixteen-CPU matches, high and long off-ring shots, resizing, terrain integrity and remote-crater persistence. The [validation report](evidence/engine-2497-validation.md), [acceptance record](evidence/m5-engine-2497-acceptance.json) and [compressed diagnostics](evidence/m5-engine-2497-diagnostics.zip) are retained. An [independent archive audit](evidence/m5-2497-archive-audit.json) confirms the recorded four- and sixteen-CPU runs finish with one survivor, zero residency violations and one end per shot.

This is the installed Apple Silicon build. Mid-flight transient projectile save/resume remains outside M5; this patch does not close the earlier E9 finding. Loose GPU matter outside the camera grid remains held while independent rigid flight, terrain collision, carving and damage continue. Earlier M4 diagnostics remain in their own record.

## Initial investigation — Talus 0.0.2496

The following is the original pre-patch investigation and retained reproduction history. Its blocker statements describe 0.0.2496, not the accepted build above.

Tony accepted the current gameplay and requested a new milestone on 2026-10-22. M5 targets a 25% view and tank movement across uneven ground while preserving the 50×5 mixed WFC world. His clarified camera requirement is **always keep every surviving tank within the 25% active ring**; projectile tracking must obey that constraint. **M5 is blocked on Talus 0.0.2496:** parameter tuning does not resolve small-step collisions, and the requested zoom is not retained in game mode. The [engine patch prompt](engine-m5-patch-prompt.md) contains reproductions and acceptance criteria. M4 is preserved in `fixtures/m4/`; no engine source was changed.

### Camera

The editor displays 25%, but the game reopens at 100% even after explicitly selecting the editor's 25% preset. The [game readback](evidence/m5-game-zoom-after-preset.json) is 400×242 world pixels at zoom 1. At the current 1600×968 window and 4× pixel scale, 25% would show 1600×968 world pixels. The engine clamps gameplay zoom at 25% and caps viewport coverage to its streaming ring. The former 2304-pixel two-tank separation could not fit; Tony chose compact deployment instead. No simulation ring expansion or forced residency is scripted.

The new combat strip is x=5760…7040 within the unchanged 12800×1280 world. Two through sixteen tanks start uniformly between x=5824 and x=6976. The hull span is 1192 pixels, and the smallest center separation is 76 pixels. Horizontal input stops each hull at the combat edges; tanks outside the combat bounds are eliminated. Deployment and turn cameras center the roster. Local policy checks pass for every supported count and both movement directions at the edges.

The current scripting camera API offers follow and centerOn, but no zoom or viewport/framing contract. Normal zoom keys and wheel handling are editor-only. The engine handoff requires real game zoom, active-ring/viewport readback, and projectile tracking clamped to keep the entire roster resident. High/wide shells may leave that constrained view; their real simulation and impact lifecycle must continue correctly. Flight and impact camera calls still use the prior behavior pending that API. Continuous all-tank residency is **not yet implemented or accepted**.

Fresh 16-CPU and 2-CPU deployments pass all **12 layout/idle checks**: distinct positions, hull span, separation, live residency in every sample, full health and no script fault. The [runtime report](evidence/m5-compact-layout.json) records both worlds and 20 idle samples per roster. This proves compact deployment and idle residency on the current build, not flight acceptance or visible 25% framing. [Ring diagnostics](evidence/m5-compact-ring.json) report 100% active-area coverage with no pending loads at capture.

### Controller verification

The isolated baseline reproduces the reported single-pixel obstruction: a 40-pixel-wide tank stops at x=5079.99 against a stone pixel at x=5100 on an otherwise flat floor. It stays at 100 HP. [Baseline trace](evidence/m5-baseline.json).

The candidate M5 controller uses a 16-pixel auto-step height, 0.5-pixel minimum step width, 12-pixel ground snap distance, a 60° climb slope and 55° slide threshold, and collision sides inset two pixels from the visible tracks. Jumping, wall climbing and dashing remain disabled. The unchanged game movement path calls the engine character controller through Entity.setVelocity. Tests use isolated CPU-only saves; test-course placement and initial tank teleporting are fixture setup, never game movement logic.

The candidate also stops against the single pixel, at x=5081.99 (the changed stopping coordinate is its narrower collider, not progress over the obstacle). A fresh unstreamed tank separately fails the one-, four- and ten-pixel steps. The natural mixed-terrain runs travel about 160 pixels right and 142 pixels left in five simulation seconds, but this does not satisfy the step requirement. [Tuned course](evidence/m5-tuned.json), [fresh isolated steps](evidence/m5-fresh-step-isolation.json), [natural terrain](evidence/m5-natural-movement.json).

M5 movement is blocked on an engine controller issue. Source inspection found that `TalusCharacterController` initializes the configured offset, but `CharacterMovementSystem.applyConfig` omits it and `TalusPhysicsWorld.configureCharacter` resets omitted offset to 0.01. The measured floor clearance agrees with that reset. The exact reason auto-step fails still needs engine-side instrumentation and a regression fix; changing game parameters did not fix it.

### Retained handoff

The earlier M4 ready save and all prior evidence remain intact. M5's candidate controller remains installed for reproduction and is not represented as a successful fix. Rebuild the movement course with the diagnostic tool when replaying: a later reopen of the tuned save did not reproduce the elevated course, and a subsequent save key reported `focused:false`. The [later attempt](evidence/m5-final-reproduction.json) is not a valid retained single-pixel scene and does not establish a terrain-persistence defect. The baseline, tuned and fresh-spawn runtime traces above remain valid.

The app is left on the compact two-CPU ready world `542309cf-88f8-434f-921d-18d4f81867a8`, seed 7, with Tony and Copper at 100 HP. The 16-CPU world is `658a91c0-e8a5-430d-9fd8-0fcfeeb2ac8d`. Original remembered names/settings and score records were restored exactly and checked for equality; no diagnostic match was scored. Reopening the compact scenes has not been tested.

TypeScript checking against the installed declaration file, Python compilation, document-link validation and `node tools/check_m5_layout.cjs` pass. The latter checks actual game policy for every roster size 2–16, separation and movement input bounds in both directions, including inward movement from each edge. Runtime evidence establishes the two blockers; it does not establish M5 acceptance.
