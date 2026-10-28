/** Authored CPU identities and human names shared by setup, rounds and scores. */
type Character = {
    id: string;
    name: string;
    personaId: string;
    skill: string;
    paletteIndex: number;
    color: string;
    description: string;
};
type Catalog = {
    minPlayers: number;
    maxPlayers: number;
    humans: { min: number; max: number; default: number };
    computers: { min: number; max: number; default: number };
    nameMaxLength: number;
    characters: Character[];
};
function select(params: any, catalog: Catalog) {
    const humans = Number(params.humans), computers = Number(params.computers);
    for (const [count, limits] of [[humans, catalog.humans], [computers, catalog.computers]] as const)
        if (!Number.isInteger(count) || count < limits.min || count > limits.max)
            throw new Error('Choose a valid number of human and computer players.');
    if (humans + computers < catalog.minPlayers || humans + computers > catalog.maxPlayers)
        throw new Error('Choose between ' + catalog.minPlayers + ' and ' + catalog.maxPlayers + ' tanks in total.');
    const names = params.humanNames ?? [], ids = params.cpuCharacters ?? [];
    if (!Array.isArray(names) || !Array.isArray(ids))
        throw new Error('Player names and CPU selections must be lists.');
    const humanNames = Array.from({ length: humans }, (_, i) => {
        if (names[i] != null && typeof names[i] !== 'string')
            throw new Error('Enter a name for each human player.');
        const name = String(names[i] || '').trim() || 'Player ' + (i + 1);
        if (name.length > catalog.nameMaxLength)
            throw new Error('Human names may contain at most ' + catalog.nameMaxLength + ' characters.');
        return name;
    });
    const characters: Character[] = [];
    for (let i = 0; i < computers; i++) {
        const character = ids[i] == null
            ? catalog.characters.find(c => !characters.some(selected => selected.id === c.id))
            : catalog.characters.find(c => c.id === ids[i]);
        if (!character)
            throw new Error('Choose a CPU character from the roster.');
        if (characters.some(c => c.id === character.id))
            throw new Error('Choose a different character for each CPU.');
        characters.push(character);
    }
    const allNames = [...humanNames, ...characters.map(c => c.name)];
    if (new Set(allNames.map(name => name.toLowerCase())).size !== allNames.length)
        throw new Error('Use distinct human names, different from the selected CPU names, so scores stay separate.');
    return { humans, computers, humanNames, characters };
}
function settings(match: any, saved: any = {}) {
    const humanNames = [...(Array.isArray(saved.humanNames) ? saved.humanNames : [])];
    const cpuCharacters = [...(Array.isArray(saved.cpuCharacters) ? saved.cpuCharacters : [])];
    match.roster.filter((p: any) => p.control === 'human').forEach((p: any, i: number) => humanNames[i] = p.name);
    match.roster.filter((p: any) => p.control === 'cpu').forEach((p: any, i: number) => cpuCharacters[i] = p.characterId);
    return { humans: match.humans, computers: match.computers, humanNames, cpuCharacters };
}
export = { select, settings };
