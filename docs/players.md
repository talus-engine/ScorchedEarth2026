# Players and CPU characters

[Game/players.json](../world/Game/players.json) owns the match limits and CPU
character pool. A match contains two to ten tanks. Humans and CPUs can each
range from zero to ten; their sum cannot exceed ten. Raising one count reduces
the other only when needed to stay within that combined cap.

The setup menu uses Talus's native `talus-roster-settings` control. Its `src`
loads the project catalog; `bind="installed.indigo"` restores saved choices.
The control works before a world is loaded, and submits numeric `humans` and
`computers` plus typed `humanNames` and `cpuCharacters` arrays. Human names are
editable individual fields. CPU rows are enum selections, with fixed names,
skill labels and strategy descriptions. A character can appear only once in a
match. Battlefield settings are outside the player sections.

Each character points to a persona for its faction voice, shopping preferences
and tactics. Its own `skill` selects the planning budget and learning rate.
`paletteIndex` selects an existing native tank template from
[arena.json](../world/Game/arena.json); the palette's body color matches the
catalog swatch. Human tanks use unused palettes so every tank remains distinct.

[roster.ts](../world/Scripts/lib/roster.ts) validates submitted values before
deployment. Trimmed human names are limited to 32 characters. Blank names become
`Player 1`, `Player 2`, and so on. Names must be distinct, including from selected
CPU names, because wallets and high scores use normalized names as their keys.
The game remembers names and selections in installed state and carries the same
crew through armory transitions, subsequent rounds and battle restarts.

To add a CPU, supply a unique ID and name, an existing persona ID, a supported
skill and an unused palette index. Its identity stays fixed across matches;
the world seed affects terrain and human palette allocation, not CPU names.

## Aiming against live flight

CPUs and Ballistic Guidance aim with the engine's native forecast
(`tank.weapon.plan`). That forecast integrates gravity, the weapon's authored drag
and constant wind, and warns `evolving-air-fields-not-predicted`. Live rigid shells
also lose speed to air coupling, about 0.015 per second for the standard missile
on build 2961. A 5-second high arc therefore lands roughly 4% short of the forecast.
[ballistics.ts](../world/Scripts/lib/ballistics.ts) keeps the forecast's validated
angle and solves the power for a drag-aware flight. An arc solved at the edge of
reach has no power left for that correction, so the survey asks the native planner
for a flatter validated arc to the same point (up to 3° and then 8° lower), which
needs less power. Each clean CPU flight fits the drag that explains its impact; the
match's estimate starts at the measured default and follows those samples. A
future engine change to live flight is therefore measured rather than assumed.
Learned per-target offsets exclude this correction, so it is never applied twice.

## Zeroing in

A CPU brackets each new target the way an artillery spotter does
([aiming.ts](../world/Scripts/lib/aiming.ts)). Once the native survey finds a
clear corridor to the target, the first shot is a ranging round at the same
validated elevation, aimed at the ground half the opening width short of the
target. When that point is not a clear shot (a ridge in the way), the round goes
the same distance long, then half as far short or long. The next shot lands on
the other side. Every later shot splits the interval between the
closest short and the closest long impact, so each correction is half the last.
A miss on the unexpected side widens the search by doubling steps. A near hit
(inside the blast radius) still narrows the bracket by its side, so the CPU keeps
closing toward a direct hit. A direct hit locks the bracket and becomes the proven
solution, which is retried after a single contrary shot. Every planned tank shot
teaches the bracket, including impacts on uneven ground near the target. The HUD
tactic reads *Ranging shot*, *Bracketing the target*, *Halving the bracket* or
*On target*. Nothing here is random: the same situation produces the same
sequence of shots. One survey candidate is held in reserve for the ranging
re-plan, so planning never exceeds the skill's candidate budget.

Each skill's `bracket` in [personas.json](../world/Game/personas.json) sets the
opening width as a fraction of the horizontal range: rookie 0.40, easy 0.28,
regular 0.18, hard 0.10 and expert 0.05. Across 2,400 pixels an expert is usually on
target by its third shot and a rookie by its sixth or seventh. The bracket persists
per target and weapon while the shooter and target stay roughly in place;
significant movement starts a new ranging sequence.

Payload carriers (creatures, ordnance and trickster weapons) are not bracketed:
their payload acts on its own after landing. When no corridor is clear, the
separate obstructed fallback blasts a firing lane from a fixed table of angles
and powers ([cpu.ts](../world/Scripts/lib/cpu.ts)).
