// Pure script body. Input: logo = {width, height, seed?, previousSeed?}.
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
const scale = width / 512;
const slope = between(.2, .65) * (random() < .5 ? -1 : 1);
const amplitude = between(5, 13) * scale;
const period = between(65, 135) * height / 256;
const phase = between(0, Math.PI * 2);
const reach = Math.abs(slope) * height + amplitude + 20 * scale;
const stripes = [];
for (let start = -reach + between(0, 20) * scale; start < width + reach;) {
  const end = start + between(5, 13) * scale;
  stripes.push([start, end]);
  start = end + between(14, 28) * scale;
}
// These are slots in a material table, not simulation layers or engine IDs.
const materials = ['TERRA_FIRE_SOURCE', 'METHANE', 'TERRA_WATER_SOURCE', 'WOOD'];
const indices = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  const offset = slope * y + amplitude * Math.sin(y * 2 * Math.PI / period + phase);
  const base = y < height / 4 ? 0 : y < height / 2 ? 1 : 2;
  let stripe = 0;
  for (let x = 0; x < width; x++) {
    const position = x + offset;
    while (stripe < stripes.length && position >= stripes[stripe][1]) stripe++;
    const wood = stripe < stripes.length && position >= stripes[stripe][0];
    indices[y * width + x] = wood ? 3 : base;
  }
}
return {seed, width, height, materials, indices,
  stripes: {slope, amplitude, period, phase, intervals: stripes}};
