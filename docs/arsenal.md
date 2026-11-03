# Arsenal

The baseline is Wendell Hicken’s **Scorched Earth 1.5**, the final official
release. Its manual lists 33 weapons and 15 accessories. All have uniquely
named, enabled entries in this game. Sources: the [official release and manual](https://www.whicken.com/scorch/)
and the [manual mirror, pages 23–32](https://www.abandonwaredos.com/docawd.php?idg=1912&sf=scorchedearthmanual.txt&sg=Scorched+Earth&st=manual).

## Original weapons

The table maps every manual entry to its stable identifier in
[the shop catalog](../world/Game/shop.json).

| Family | Original weapon | Game identifier |
| --- | --- | --- |
| Explosive shells | Baby Missile | `standard` |
| Explosive shells | Missile | `heavy` |
| Explosive shells | Baby Nuke | `baby-nuke` |
| Explosive shells | Nuke | `nuke` |
| Multiple warheads | Leap Frog | `leapfrog` |
| Multiple warheads | Funky Bomb | `funky` |
| Multiple warheads | MIRV | `mirv` |
| Multiple warheads | Death’s Head | `deaths-head` |
| Burning fuel | Napalm | `napalm` |
| Burning fuel | Hot Napalm | `hot-napalm` |
| Ranging | Tracer | `tracer` |
| Ranging | Smoke Tracer | `smoke-tracer` |
| Rollers | Baby Roller | `baby-roller` |
| Rollers | Roller | `roller` |
| Rollers | Heavy Roller | `heavy-roller` |
| Terrain removal | Riot Charge | `riot-charge` |
| Terrain removal | Riot Blast | `riot-blast` |
| Terrain removal | Riot Bomb | `riot` |
| Terrain removal | Heavy Riot Bomb | `heavy-riot` |
| Diggers | Baby Digger | `baby-digger` |
| Diggers | Digger | `digger-shell` |
| Diggers | Heavy Digger | `heavy-digger` |
| Sandhogs | Baby Sandhog | `baby-sandhog` |
| Sandhogs | Sandhog | `sandhog` |
| Sandhogs | Heavy Sandhog | `heavy-sandhog` |
| Terrain construction | Dirt Clod | `dirt-clod` |
| Terrain construction | Dirt Ball | `dirt-ball` |
| Terrain construction | Ton of Dirt | `ton-dirt` |
| Terrain construction | Liquid Dirt | `liquid-dirt` |
| Terrain construction | Dirt Charge | `dirt-charge` |
| Collapse | Earth Disrupter | `earth-disrupter` |
| Energy | Plasma Blast | `plasma` |
| Energy | Laser | `laser` |

Every weapon points to a native gun template and projectile modifier. Every tank
inventory includes those guns. Tests compare all configured projectile fields
with the native records and check names individually, so a duplicate or disabled
entry cannot satisfy coverage. Sprite and behavior tests cover the cutting
weapons, payload accounting, timed effects, terrain tools and economy. These
checks establish authored coverage; they do not replace playing every weapon.

## Accessories

Heat Guidance, Ballistic Guidance, Horz Guidance, Vert Guidance, Lazy Boy,
Parachute, Battery, Mag Deflector, Shield, Force Shield, Heavy Shield, Super Mag,
Auto Defense, Fuel Tank and Contact Trigger are enabled. They use finite native
accessories, controllers and defensive fields, with purchases owned by the game.

## Game rules and adaptations

The game balances damage, ammunition and range for its own battlefield. Diggers
here carry small damaging charges; Sandhogs carry multiple damaging drill
warheads. MIRVs have an impact fallback when terrain prevents their apex split.
Earth Disrupter fractures a local patch into physical debris. These are deliberate
game behaviors, so roster coverage is not a claim of identical DOS physics or
exact original weapon rules.

Smoke Tracer uses the shared [shot visual system](shot-trails.md). Its native
rigid-body definition contains no ineffective particle-projectile trail setting.
Traces and colored smoke are available on ordinary shots too.

## Terrain-eating motion

All three Diggers and all three Sandhogs, including their native child warheads,
are real Rapier projectiles. Game scripts choose aim and launch them; they do not
move these shells or paint their tunnels from a tick hook. The native
`ProjectileExcavation` component clears a corridor and permits physics movement
only after native terrain collision has been updated.

Their `excavation.cutAhead` is 64 pixels and `lookahead` is 96 pixels. The native
cutter sizes cuts from measured preparation latency and predicted motion, with
`cutAhead` as the minimum batch length and `lookahead` as the maximum reach. It
keeps completed clearance while preparing the next cut, so pending future work
does not stop a shell traveling through an already-cleared corridor.

The template requires engine build 2799 or later for this continuous cutting.
Speed, lifetime, work and distance limits, material eligibility, noisy edges,
smoke output, tank collisions and the protected stone floor remain enforced.
`excavation.holds` counts missed preparation deadlines after admission;
`excavation.latency` reports preparation time in simulation seconds. Faster shots
or long falls may need more lookahead, up to the engine's 512-pixel limit.

The CPU-only cadence test uses real Rapier motion and native terrain kernels with
a controlled three-frame publication delay. Every Digger, Sandhog and child
warhead must keep its authored speed, remain inside published clearance and have
zero holds after initial admission. Live validation must also measure these
properties with actual GPU capture, collision rebuilding and streaming.
