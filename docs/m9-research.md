# M9 — artillery catalogue and native engine boundaries

Research date: 2026-10-22/23. The reference is the DOS **Scorched Earth 1.5** catalogue, not Scorched 3D's different arsenal. The [original author's site](https://www.whicken.com/scorch/) identifies the original release. The [archived 1.5 manual](https://www.scritub.com/limba/engleza/games/Scorched-Earth-The-Mother-of-A42102146.php) supplied the catalogue and behavior families. Names below identify compatibility targets; prices, damage, ammunition and balance are Indigo's own.

The [Team17 Worms Armageddon manual](https://ftp.zx.net.nz/pub/archive/ftp.team17.com/pub/t17/manuals/Worms_Armageddon.pdf) and [official archived game description](https://wormsarmageddon.worms2d.info/main.html?area=plat&page=abou) informed the additional rapid-fire, grenade, cluster and guided-rocket families. Jetpack, repair, excavation, shielding and magnetic defenses build on M8's native components. No third-party code or quote database was imported.

`world/Game/shop.json` is the authoritative coverage table, including disabled entries and their engine dependency. `tools/author_m9.py` authors the catalogue; `tools/install_m9.py` creates physical projectile mods and weapons through public HTTP. Every original item has a distinct catalogue entry. An entry is not evidence of complete implementation: disabled entries cannot take money or be equipped.

## Adaptations

Indigo's balance is intentionally suitable for its 100-HP tanks and current 25% camera framing. Nuclear shells are ordinary native blast/carving weapons; the separately requested random death nuke is a **material FIRE brush**, not a reskinned blast. Native loose materials supply dirt and liquid-dirt behavior. Rollers use genuine rigid-body terrain response and rest/body detonation with an eight-second safety fuse. Reserve shield packs use M8's real finite component; Force Shield and Heavy Shield are charge-capacity adaptations, not claims of the original game's exact reflection rules.

MIRV and Death's Head release real descendants at the native apex event. Early carrier impacts do not split. Leap Frog launches successive actual warheads; Funky Bomb and Cluster Grenade create bounded secondary volleys. Machine Gun and Flamethrower emit real projectiles over time. Lazy Boy composes the existing native aiming graph and consumes a charge only on an applied solution; it does not require a new engine class. One magazine/charge is debited for the entire attack. Every projectile still earns its own cash events; the turn waits for the whole attack and any native terrain payload, then uses the existing bounded settle wait.

## Terrain alternative

Brush Reach is a separate 12,800 × 1,280-pixel rectangle at x=16,384 in the same Indigo world. No WFC generators occupy it. The existing WFC arena remains intact. The native recipe evaluator builds the bottom 256-pixel STONE foundation first, then connected seeded surface noise and mixed substrate, then 50 authored 64–128-pixel semantic detail stamps. It uses the engine's world-coordinate noise evaluator and native bounded commits, not an external raster or scripted substitute physics. The map seed controls generation independently of combat and dialogue randomness.

Full neural texture generation, guided polygon/ridge strokes, and living growth are **not available through the runtime terrain API**. The editor's growth library contains Bramble and living Oak Sapling; Bramble is a growth preset, not one of the 97 semantic recipes or four neural models listed by the APIs. The requested living-bramble variant and runtime growth belong in E22. Do not label the current recipe-only mode a completed neural/living generator.

## Presentation

Speech uses the same native `talus.ui.nameplate` canvas instance as tank names, updates with the engine's frame renderer, and restores the name afterward. The current API permits one single-line nameplate per entity, so the sentence is prefixed by the pilot's name. Camera centering happens before the label; firing/death effects wait at least three simulation seconds. Death presentations serialize. A pause pauses that interval. Independent hazard projectiles may continue while the next living tank plays.

**Superseded presentation requirement:** the user subsequently clarified that speech must be an independent arbitrary world text instance on that layer, not part of the nameplate, and at least four times larger. The existing label demonstrates sequence timing only. E27 requests the missing generic retained-world-text API, 36-screen-pixel dialogue, wrapping and cleanup; tank names remain independent after that engine integration.

The engine-generated background is `29a4363f-3411-41e0-958c-6ac53283fcb2`, **Indigo — Distant Thunder**. Three generated PNG layers retain separate parallax factors. Native weather sets select clear/rain at weights 90/10, periodically rerolled by the engine; this is not a promise of exactly one rainy round in every ten rounds.
