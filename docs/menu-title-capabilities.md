# Current menu particle restrictions — observed on 0.0.2575

This records current implementation limits, not the user's requested design.
The requested logo is **one particle layer**, with imported pixel colors retained
and different element assignments, including Particle Emitters and burning wood.

Particle Emitter is builtin element153, internally `PARTICLE_SPAWNER` with
`caBehavior: 'spawner'`. See the native definition in
`../foxtrot/src/simulation/ElementDatabaseDefaults.ts` around line14421 and its
Fire variant immediately below it. The existing project sources derive from
this element; they are not a different kind of emitter.

## Feature restrictions in the delivered menu implementation

| Area | Current behavior |
| --- | --- |
| Particles | Solid/powder/liquid/gas motion, heat/conduction, ordinary reactions, erase/powder explosions |
| Particle authoring | Rectangles/circles with element, temperature and velocity; no imported per-pixel RGBA input |
| Particle Emitters | Explicitly rejected because the menu domain omits their CA host/kernel path |
| Other omitted subsystems | Drains, life CA/organisms, pipes, air pressure/velocity and electromagnetism |
| World features | No entities/rigid bodies or gameplay script/event/audio host; not needed for this logo |
| Images | Background/parallax and element material textures supported; different from imported colored logo particles |
| Lifetime | Independent clock up to60ticks/sec; reset on reentry; no scene save/resume |

Source: `../foxtrot/src/menus/scenes/MenuScene.ts`, `MenuSceneDomain.ts`,
`MenuSceneHost.ts`; engine documentation `../foxtrot/docs/menu-scenes.md`.
Native emitter refusal is retained in
`docs/evidence/m13-native/title-source-validation.json`.

## Hardcoded menu-specific caps

- Dimensions multiples of64, width≤1024, height≤512, total≤262144cells.
- Two active/retiring scenes, four views; eight backgrounds and256initial stamps.
- Sixteen queued operations per scene; additional8192-row native spawn pool.
- Scene document≤2MiB; document+images≤8MiB; each decoded image≤4million pixels.
- View canvas≤4096pixels per axis; one outstanding GPU scene frame.
- Explicit explosions radius1–128; paint velocity components−20..20.
- Loop duration1–3600seconds or disabled.

The current logo requires a native colored-particle import and the existing
Particle Emitter behavior within this single layer. The absent world features
are not prerequisites. The corrected scope is in `engine-m14-patch-prompt.md`.
