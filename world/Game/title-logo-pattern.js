// Pure script body. Input: logo = {width, height, seed?, previousSeed?, ignitionSites?}.
// Run once per title entry, before importing the particles. A supplied seed
// reproduces the pattern; otherwise choose a fresh one independent of match RNG.
// Output is only material assignments. Never read or modify source RGBA.
const width = logo.width, height = logo.height;
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > 1024 || height > 512 || width * height > 262144) throw new Error('Invalid logo dimensions');
const validSeed = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
if (logo.seed != null && !validSeed(logo.seed)) throw new Error('Invalid logo seed');
if (logo.previousSeed != null && !validSeed(logo.previousSeed)) throw new Error('Invalid previous logo seed');
let seed = logo.seed == null ? Math.floor(Math.random() * 4294967296) : logo.seed;
if (logo.seed == null && seed === logo.previousSeed) seed = (seed + 1) >>> 0;
let state = seed;
function random() {
  state = (state + 0x6d2b79f5) >>> 0;
  let n = state;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}
const between = (a, b) => a + random() * (b - a);
const scale = width / 640;
const slope = between(.2, .65) * (random() < .5 ? -1 : 1);
const amplitude = between(5, 13) * scale;
const period = between(65, 135) * height / 128;
const phase = between(0, Math.PI * 2);
const reach = Math.abs(slope) * height + amplitude + 20 * scale;
const stripes = [];
for (let start = -reach + between(0, 20) * scale; start < width + reach;) {
  const end = start + between(5, 13) * scale;
  stripes.push([start, end]);
  start = end + between(14, 28) * scale;
}
// Stripes replace material identity only; the stamped silver and shadow colors remain exact.
const materials = ['WOOD', 'DYNAMITE', 'TNT', 'C4', 'COAL', 'GUNPOWDER', 'THERMITE'];
const stripeMaterials = stripes.map((_, index) => index % 3 === 0 ? 1 : 2 + Math.floor(random() * (materials.length - 2)));
const indices = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  const offset = slope * y + amplitude * Math.sin(y * 2 * Math.PI / period + phase);
  let stripe = 0;
  for (let x = 0; x < width; x++) {
    const position = x + offset;
    while (stripe < stripes.length && position >= stripes[stripe][1]) stripe++;
    const inStripe = stripe < stripes.length && position >= stripes[stripe][0];
    const nx = x / width;
    const core = nx > .23 && nx < .77;
    const choice = stripeMaterials[stripe] ?? 0;
    const material = inStripe && (choice !== 1 || core) ? choice : 0;
    indices[y * width + x] = material;
  }
}
// Small native FIRE brushes light different opaque parts of the lettering on entry.
// The image alpha still clips every particle; source colors are untouched.
const sites = logo.ignitionSites || [];
const ignition = [];
if (sites.length) {
  const fire = materials.push('FIRE') - 1;
  const count = Math.min(sites.length, 5 + Math.floor(random() * 3));
  const available = sites.slice();
  for (let n = 0; n < count; n++) {
    const [x, y] = available.splice(Math.floor(random() * available.length), 1)[0];
    const radius = between(3, 6) * scale;
    ignition.push({ x, y, radius });
    for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(height - 1, Math.ceil(y + radius)); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(width - 1, Math.ceil(x + radius)); px++) {
        if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) indices[py * width + px] = fire;
      }
    }
  }
}
return {seed, width, height, materials, indices, ignition,
  stripes: {slope, amplitude, period, phase, intervals: stripes}};
