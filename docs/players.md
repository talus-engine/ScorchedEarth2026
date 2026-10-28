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
