# Tanks, weapons and CPU tactics

A tank's floating native character controller supplies movement. Jointed wheels,
tracks and jet pods provide the game-piece appearance. Decorative bodies do not
collide with terrain or propel the tank. Native layered animation follows
controller movement and levitation; the turret aims through its native pivot.
Every enabled weapon has distinct small pixel artwork.

`Game/shop.json` is the armory catalog. Enabled weapons include conventional and
heavy shells, grenades, ricochets, rollers, MIRV and cluster payloads, nukes,
terrain removal and deposition, machine guns, flame, plasma and laser weapons.
The three Diggers cut finite underground routes; the three Sandhogs split into
native child cutters. Their noisy cutting fronts turn eligible terrain into
smoke, with finite work and distance budgets and an excluded stone foundation.
Laser fires eight finite cutting-material pulses and consumes one Battery.
An entry marked `enabled: false` cannot charge a wallet or be selected.

`Game/ordnance.json` defines persistent proximity mines, bomb/acid/lava/nuclear
airstrikes, water-bursting ducks and the seeded Meteor Lottery. A landed carrier
creates the effect once. Mines become durable rigid bodies, arm after a delay,
and can trigger on their owner; dormant mines do not prolong a turn. Barrages
launch finite native projectiles with the original shooter's credit. Material
payloads commit real particles through bounded terrain work. The Holy Hand
Grenade's exact 2,800px blast is configured but disabled pending native area support.

`Game/creatures.json` defines native worm and crow entities, their movement,
contact damage, lifetime and population limits. Worms clear eligible terrain
ahead of their physical bodies and leave the stone foundation intact; crows
attack a selected tank for a bounded interval. `Game/tricksters.json` defines
the noise-seeking Black Sheep and Tax Collector. Sheep follow recent shots and
explosions, then detonate on proximity, contact or their finite fuse. Tax
Collector transfers a bounded share of cash on a real direct hit; each victim
can pay only once per cast. Both wallet balances and the receipt persist in one
installed-state write, including when the original shooter has died.

Utilities use native finite components: shields, magnetic deflection, batteries,
parachutes, jet fuel, ground fuel, digging and aim assistance. The game reconciles
actual native consumption with purchased stock. A refused action spends nothing.
Mag Deflector repels incoming metal shells. Super Mag selects a reflective response
on the same native field and draws from its own reserve. Its energy and impulse
limits can allow a fast shell through; switching modes does not transfer charge.
Cash rewards cover turns, movement, firing, landing, hits, damage, death and
other configured actions. Damage to oneself still earns the configured awards.
The free escape charge has no combat cash reward.

The equipment drawer arms one guidance charge and one contact fuse for the next
compatible volley. Ballistic Guidance surveys the selected angle
and adjusts power; a refused or stale solution keeps the charge. Horizontal and
vertical guidance use native target-line steering; Heat Guidance follows the
selected living target. Contact Trigger enables terrain and body detonation.
The native accessory ledger reserves one charge for the cast, retains it on
refusal, and carries its compiled settings into native payload children.
Charges leave the wallet only on the first accepted launch. Script-created
secondary shells are separate launches. Compatibility checks exclude conflicting
guidance, burst/terrain tools and contact fuses on underground cutters.

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

Cutting weapons use bounded aim estimates because their evolving material paths
have no ballistic forecast. CPUs check range, the foundation and observed
obstructions, then retain measured direct hits across the whole volley. They do
not apply ballistic range-error corrections to cutting misses or call an
experimental route a clear prediction.

Large geometry or wind changes invalidate a correction's applicability without
erasing the observation. Deliberate demolition, apex carriers, expiration and
early wall impacts do not masquerade as ordinary range error. A changed firing
pose is checked again after dialogue, before spending ammunition. Repeated
geometry failure permits at most two paid, locally surveyed moves followed by
fresh native shot planning. Unknown terrain and other hard refusals stop this
recovery. Repeated failure reaches a visible, saveable stall rather than an
infinite pass loop.

Death effects are data in `Game/chaos.json`. The presentation owns the three-second
last words; effects own transmutation, particles, projectiles and bounded emission
regions. Dynamite and acid adopt the actual painted tank frame, preserving its
colors. Ignition changes only the central 2×2 region. Solid wrecks remain native
physical matter, and their chemistry can continue after the turn advances.
Other play can continue during finite death sprays. Script-owned sequences keep
their save barrier until the effect sequence completes.

Custom emitter definitions live in `assets/native/materials/`. Their native
material IDs and current installed definitions travel in the complete project
archive. Resolve elements by name when authoring a new project.
