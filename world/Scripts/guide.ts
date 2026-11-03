/** Editor-only, read-only previews for the level guide's native event links. */
if (talus.editor.available) {
    const files = new Set([
        'Scripts/main.ts', 'Scripts/lib/game.ts', 'Game/arena.json',
        'Graphs/cpu-turn.json', 'Game/shop.json', 'Game/personas.json',
        'Menus/hud.html', 'Menus/setup.html', 'WFC/README.md', 'Game/terrain-recipes.json',
    ]);
    async function preview(title: string, text: string): Promise<void> {
        const lines = text.split('\n');
        talus.ui.set('guide', { title, text: lines.slice(0, 120).join('\n'), truncated: lines.length > 120 });
        talus.ui.openMenu('Menus/guide.html');
    }
    talus.on('menu.custom.close-guide', () => talus.ui.closeMenu());
    talus.on('guide:file', async event => {
        const path = String(event.data?.path || '');
        if (files.has(path)) await preview(path, await talus.files.readText(path) || 'File unavailable.');
    });
    talus.on('guide:asset', async () => {
        const arena = JSON.parse((await talus.files.readText('Game/arena.json'))!);
        const tank = await talus.editor.templates.get(arena.tankTemplate);
        if (!tank) return;
        const parts = Array.isArray(tank.bodies) ? tank.bodies : [];
        await preview('Tank template', [
            'Native ID: ' + arena.tankTemplate,
            'Name: ' + tank.templateName,
            String(tank.description || ''),
            '', 'Bodies:', ...parts.map((part: any) => part.bodyIndex + ': ' + part.name + ' (' + part.role + ')'),
            '', 'Joints: ' + (Array.isArray(tank.joints) ? tank.joints.length : 0),
            'Animation layers: ' + (Array.isArray(tank.particleAnimationLayers) ? tank.particleAnimationLayers.length : 0),
            '', 'Edit this record in the entity template editor.',
            'The character controller moves the tank. Jointed parts and layered animations provide its appearance.',
            'Repository definitions: assets/native/entities/<id>.json, assets/native/animationClip and animationController.',
        ].join('\n'));
    });
    talus.on('guide:title', () => preview('Title world',
        'Select Title in the project world switcher to edit its native artwork.\n\n'
        + 'The child world is bound to menu:title. Menus/title.html displays its full-screen scene behind the controls.\n\n'
        + 'Menus/Scenes/title.json defines the scene. Game/title-logo-pattern.js assigns wood, dynamite and assorted explosive materials while retaining image colors.\n\n'
        + 'Art/Title contains the font-outline SVGs. Game/title-vectors.json holds the reusable native stamps. Menus/Assets/title-lettering.png is their compiled particle image.\n\n'
        + 'Save and export the complete project: the child world and binding are native data.'));
}
