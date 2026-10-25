# M8 research and design — cash, weapons and utilities

Research date: 2026-10-22. These are mechanical inspirations; the prices and reward rates below are Indigo's own initial tuning.

## References

- [Wendell Hicken's official Scorched Earth page](https://www.whicken.com/scorch/) identifies the original game and its 1.5 manual/download. The [mirrored 1.5 manual](https://www.scritub.com/limba/engleza/games/Scorched-Earth-The-Mother-of-A42102146.php) describes buying equipment between rounds, retaining unspent money, selecting weapons, damage-absorbing shields, magnetic deflectors, guidance, batteries, fuel, parachutes, digging weapons and terrain-producing charges. It distinguishes destructive ground weapons from weapons that deposit dirt. These suggest a store with several tactical roles rather than only escalating damage.
- [Team17's Worms Armageddon manual, archived from its FTP server](https://ftp.zx.net.nz/pub/archive/ftp.team17.com/pub/t17/manuals/Worms_Armageddon.pdf) describes a selectable limited-supply arsenal, jetpack thrust, blowtorch/drill controls, and utilities retained for later use. [The archived official product page](https://wormsarmageddon.worms2d.info/main.html?area=plat&page=abou) also lists mobility tools and broad weapon variety. This supports separate utility controls and finite fuel/charges.
- [Windage's own weapons guide](https://windage.online/weapons) is a contemporary artillery comparison: it groups explosives, rolling/splitting shells, terrain tools, defenses and guidance, and explicitly ties damage/kill earnings to a between-round shop. It is a modern derivative, not evidence of the original game's exact balance or behavior.

## Candidate roles

| Role | Indigo item or later candidate | Current scope |
|---|---|---|
| Reliable attack | Field cannon | Free, unlimited baseline |
| Larger blast | Heavy howitzer | Purchasable bundle of three |
| Terrain destabilization | Crumble cannon | Native pulverization releases solid terrain as falling debris |
| Terrain-dependent attack | Bouncer cannon | Locked pending authoring validator repair, E20 |
| Terrain removal | Excavator cannon | Riot shell: native carve, zero blast damage |
| Recovery | Repair battery | Two native heals per bundle |
| Flight | Jetpack fuel | Locked pending NPC levitation controls, E17 |
| Tunneling | Burrowing rig | Locked pending a real excavation/controller contract, E18 |
| Terrain creation | Sand charge cannon | Locked pending runtime noise/flood brush, E15 extension |
| Projectile defense | Mag deflector | Locked pending authored field/shield API, E19 |
| Damage defense | Blast shield | Locked pending pre-damage absorption API, E19 |
| Later attack variations | Cluster shells, apex-splitting volleys, rollers, guided rounds, incendiary canisters | Research backlog; not advertised as implemented |
| Later mobility/defense | Parachute, emergency teleport, portable bridge, targeting computer | Research backlog; distinct capabilities need validation |

The first release does not approximate levitation with repeated velocity writes, tunneling with a string of hidden explosions, or sand flooding with a square fill. The user specifically requests fixing abstract engine capabilities when needed. Physical material magnetism exists in Talus; that does not by itself supply a purchased, powered, owner-bound deflection field.

## Economy contract

Each remembered player name has its own wallet, paid-ammunition stock and repair charges. New names get $600 once. Name matching follows the existing case-insensitive score identity. Starting another game does not issue another starting grant. Cash and unused supplies survive new seeded maps.

| Action | Initial reward |
|---|---:|
| Start a turn | $10 |
| Successful angle/power adjustment | $3 per adjustment |
| Move 16 world pixels | $2 |
| Launch any owned shell, including death shells | $20 |
| First collision/landing of a shell | $15 |
| Shell resolves without a landing | $10 |
| Bounce | $5 |
| Damage-producing hit | $20 |
| Damage dealt, including self-damage and non-roster targets | $3 per HP, rounded per event |
| Damage received | $1 per HP, rounded per event |
| Die / cause a death, including self-kill | $100 each |
| Win | $150 |
| Pass / time out | $10 |
| Switch to a different available gun | $5 |
| Successfully use a utility | $15 |

Rewards deliberately include misses, accidents, self-damage and posthumous chaos. A blocked/zero-damage hit earns no damage bonus. Invalid purchases, unavailable items, full-health repairs and empty-gun selections do not spend stock or fabricate an action. Repeated UI clicks are checked against the displayed wallet revision.

Live earnings accumulate in the round's saved match state and appear separately from spendable wallet cash. When all physical hazards and the bounded aftermath finish, one installed-state write pays every account and records that world's payout receipt. Reopening or replaying an older result cannot pay it again. Purchases and ammo/utility consumption update the persistent armory immediately. The store displays the round's itemized earnings.

The opening armory lets players use the initial grant. The same UI opens between completed rounds. Humans choose purchases; CPUs buy a small weapon/repair basket automatically, once per shop stage. The next-round button starts a fresh WFC world with the same roster; a blank seed requests randomness and an entered seed is passed through the engine's normal new-game menu path. The 50×5 layout, solid bottom stone row and 25% active-ring policy remain unchanged.
