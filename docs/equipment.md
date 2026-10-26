# Tanks, weapons and CPU tactics

A tank's floating native character controller supplies movement. Jointed wheels,
tracks and jet pods provide the game-piece appearance. Decorative bodies do not
collide with terrain or propel the tank. Native layered animation follows
controller movement and levitation; the turret aims through its native pivot.
Every enabled weapon has distinct small pixel artwork.

`Game/shop.json` is the armory catalog. Enabled weapons include conventional and
heavy shells, grenades, ricochets, rollers, MIRV and cluster payloads, nukes,
terrain removal and deposition, machine guns, flame and plasma weapons. Entries
marked `enabled: false` are visible capability placeholders and cannot charge a
wallet or be selected. Enable one only after its configured native behavior works.

Utilities use native finite components: shields, magnetic deflection, batteries,
parachutes, jet fuel, ground fuel, digging and aim assistance. The game reconciles
actual native consumption with purchased stock. A refused action spends nothing.
Cash rewards cover turns, movement, firing, landing, hits, damage, death and
other configured actions. Damage to oneself still earns the configured awards.
The free escape charge has no combat cash reward.

## CPU policy

Five faction-backed personas differ in shopping, risk, movement, target selection
and dialogue. Their skill controls candidate budgets and learning rate. Native
`weapon.plan` surveys current terrain; evolving air and electromagnetic fields
are not treated as perfectly predictable.

Each tank keeps at most 64 impact observations and 64 target/weapon learning
records. Useful range misses adjust the requested target range. The solver
rechecks the corridor and tries a successful angle first. Direct hits outrank
splash hits; a worse follow-up retains the best solution and reduces correction
gain. A successful emplacement holds position rather than wandering randomly.

Large geometry or wind changes invalidate a correction's applicability without
erasing the observation. Deliberate demolition, apex carriers, expiration and
early wall impacts do not masquerade as ordinary range error. A changed firing
pose is checked again after dialogue, before spending ammunition. Repeated
failure reaches a visible, saveable stall rather than an infinite pass loop.

Death effects are data in `Game/chaos.json`. The presentation owns the three-second
last words; effects own transmutation, particles, projectiles and bounded emission
regions. Other play can continue during persistent death emitters.

Custom emitter definitions live in `assets/native/materials/`. Their native
material IDs and current installed definitions travel in the complete project
archive. Resolve elements by name when authoring a new project.
