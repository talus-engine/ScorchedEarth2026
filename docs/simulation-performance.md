# Simulation and camera acceptance

The target is 60 simulation ticks per second. A smooth menu or a 60 FPS display
does not prove that particles, shells, rigid bodies or game timers advance at
normal speed. Inspect native `simStepsPerSec`, `simSpeedRatio`, governor cadence,
particle high-water mark, resident chunks and chunk turnover during actual play.

`npm run test:packaged` opens the real menus, starts two CPUs and observes combat.
It records native renderer telemetry alongside the HUD. The gate requires a shot
and a following turn, rejects sustained slowdown and checks the supply-drop
presentation deadline. Use a fixed seed and a single active test player so
comparisons do not include competing simulation workloads.

## Ring, zoom and quantization

The camera's simulation window and bounded `talus.sim.anchor` claims determine
which regions stay live. Distant terrain and entities use native streaming.
`talus.camera.setZoom` changes magnification; the engine selects a coarser
pyramid level for overview views. Camera zoom and quantization are not separate
controls. Do not force the governor or multiply projectile speeds to conceal
a failing workload.

Measure at least 30 seconds of fresh CPU play and require an average of at
least 58 simulation ticks per second, targeting 60. Repeat with the whole
battlefield in view. Record actual zoom, pyramid level and display FPS as well
as native tick rate. Test transitions separately from fresh starts.

## Correctness alongside speed

- Inspect WFC foreground and background at multiple positions, then return to
  those positions. Loading and leaving empty sky must not remove authored tiles.
- Observe native shells through ascent, apex, descent and impact while the
  camera follows smoothly. Camera movement must not change physics outcomes.
- Complete supply delivery, damage, death effects and a following turn. Test
  a resumed save with effects and terrain destruction preserved.
- Inspect memory and residency over several turns. Empty-chunk turnover must
  settle; a growing queue, repeated terrain reloads or refused allocations
  prevents publication even if an initial turn succeeded.

Keep diagnostic traces and screenshots in ignored `.build/` directories. Keep
test profiles bounded and close the diagnostic app before another agent uses
the engine.
