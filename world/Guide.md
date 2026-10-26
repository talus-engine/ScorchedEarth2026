# Scorched Earth 2026

A Talus game template: side-scrolling, turn-based artillery on destructible terrain.

## Play

Choose New game, a seed or random map, and 2–16 human/CPU players, then Start match. Each tank has a timed turn to move, aim and fire. Shooting ends its turn. The last tank alive wins; falling outside the world is fatal. Actions earn cash for weapons and utilities. Names, wallets and scores persist. CPU-only opening shops run automatically.

## How it fits together

[main.ts](event:guide:file?path=Scripts/main.ts) starts the game. [Game composition](event:guide:file?path=Scripts/lib/game.ts) connects the libraries. Scripts own turn policy; native controllers, graphs, physics and animation execute it.

[Rules](event:guide:file?path=Game/arena.json) · [CPU graph](event:guide:file?path=Graphs/cpu-turn.json) · [Weapons and cash](event:guide:file?path=Game/shop.json) · [Personas](event:guide:file?path=Game/personas.json)

[HUD](event:guide:file?path=Menus/hud.html) and [setup](event:guide:file?path=Menus/setup.html) bind reactive UI state. [Title world](event:guide:title) fills the screen behind the title controls. [Tank asset](event:guide:asset) contains the jointed parts and animation bindings.

## Paint and customize

[Surface tile origins](camera:2304,640,0.25) · [Foundation origins](camera:512,896,0.5) · [Battlefield](camera:6400,640,0.25)

All WFC tiles are 256×256 pixels. Preserve connector spans and edge collars; paint interiors freely. [Artist guide](event:guide:file?path=WFC/README.md) · [Generation presets](event:guide:file?path=Game/generation.json)

The repository README maps all files, tools and assets. Save in Talus and export the complete project to retain painted terrain and Title. File sync alone does not capture native world data.

Cmd/Ctrl-click a link. File links show read-only excerpts. This guide is visible only in the editor.
