# Random burning logo

`world/Game/title-logo-pattern.js` is the game's pure JavaScript script body.
It assigns materials to one particle layer. It never reads or writes RGBA.
Irregular wood stripes cross the fire-emitter, methane and water-emitter regions.
Slope, direction, phase, waviness, stripe widths and gaps vary with the seed.

Run once per title entry before importing the logo, not every frame. Keep the
pattern fixed during that visit so the particles burn naturally. A later entry
uses fresh randomness independent of match terrain, CPU and dialogue RNG.

The script takes a `logo` argument:

```js
{ width: 512, height: 256, seed: 2026 }
```

Omit `seed` for a fresh pattern; optionally pass the prior visit's `previousSeed`
to avoid an immediate repeated seed. An explicit seed always reproduces the
pattern. A deterministic sandbox can supply fresh entropy as `seed` from the
scene's entry lifecycle instead of permitting `Math.random()` in the script.

It returns `{seed,width,height,materials,indices,stripes}`. `indices` is a
row-major Uint8Array selecting an entry in `materials`; these slots are not
engine element IDs or simulation layers. When importing, skip transparent
source pixels, copy each occupied pixel's source color, and assign only its
element/configuration from that material slot. The script does no simulation.

## Local authoring

The Python tool uses this same JavaScript policy through a small Node adapter:

```sh
# Generate a new random pattern and four color-preserving masks.
python3 tools/prepare_m13_title_particles.py

# Reproduce a particular pattern.
python3 tools/prepare_m13_title_particles.py --seed 2026

# Preview without changing project assets.
python3 tools/prepare_m13_title_particles.py --output-root artifacts/logo-preview
```

The emitted manifest retains the seed. The committed preview is pinned to 2026.
All masks are disjoint and recombine to the nearest-sampled source RGBA exactly.
Thirty-two tested seeds produced 32 distinct patterns with 27–33% wood coverage;
same-seed replay was exact. Two unseeded authoring runs also produced different
images, each passing the complete RGBA reconstruction check.

The script and local authoring path are implemented. Automatic title-entry
execution is not connected yet: ENGINE owns the app and is integrating the
single-layer particle import/emitter path. Use its documented initialization
contract when supplied; do not inject JavaScript into sanitized menu HTML or
move the game-specific stripe policy into engine source.
