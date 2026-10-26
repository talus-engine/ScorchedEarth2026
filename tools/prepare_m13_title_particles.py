"""Assign logo materials and seeded wood stripes without recoloring pixels."""
import argparse
import hashlib
import json
import math
import random
from PIL import Image
from bridge import ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=int, default=2026)
    args = parser.parse_args()
    source_path = ROOT / 'world/Art/scorched-terra-title.png'
    source = Image.open(source_path).convert('RGBA').resize((512, 256), Image.Resampling.NEAREST)
    rng = random.Random(args.seed)
    slope = rng.uniform(.25, .48)
    amplitude = rng.uniform(5, 10)
    period = rng.uniform(65, 105)
    phase = rng.uniform(0, 2 * math.pi)
    stripes = []
    start = -200
    while start < 750:
        width = rng.uniform(5, 12)
        stripes.append((start, start + width))
        start += width + rng.uniform(14, 27)
    parts = {name: Image.new('RGBA', source.size) for name in ('fire', 'methane', 'water', 'wood')}
    part_pixels = {name: image.load() for name, image in parts.items()}
    pixels = source.load()
    for y in range(source.height):
        offset = slope * y + amplitude * math.sin(y * 2 * math.pi / period + phase)
        for x in range(source.width):
            wood = any(a <= x + offset < b for a, b in stripes)
            material = 'wood' if wood else ('fire' if y < 64 else 'methane' if y < 128 else 'water')
            part_pixels[material][x, y] = pixels[x, y]
    assets = []
    merged = Image.new('RGBA', source.size)
    occupied = bytearray(source.width * source.height)
    merged_pixels = merged.load()
    for name, element, band_limits in (
        ('fire', 'TERRA_FIRE_SOURCE', [0, 64]),
        ('methane', 'METHANE', [64, 128]),
        ('water', 'TERRA_WATER_SOURCE', [128, 256]),
        ('wood', 'WOOD', None),
    ):
        band = parts[name]
        for y in range(source.height):
            for x in range(source.width):
                pixel = part_pixels[name][x, y]
                if any(pixel):
                    index = y * source.width + x
                    assert not occupied[index], 'Material masks overlap'
                    occupied[index] = 1
                    merged_pixels[x, y] = pixel
        relative = f'Menus/Assets/earth-2026-logo-{name}.png'
        target = ROOT / 'world' / relative
        band.save(target)
        assets.append({
            'file': relative, 'element': element, 'x': 64, 'y': 20,
            'width': 512, 'height': 256, 'band': band_limits,
            'nontransparentPixels': sum(a > 0 for a in band.getchannel('A').tobytes()),
            'preservePixelColors': True,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        })
    assert merged.tobytes() == source.tobytes(), 'Material bands changed source RGBA'
    manifest = {
        'version': 2, 'seed': args.seed,
        'title': 'Scorched Earth 2026', 'source': 'Art/scorched-terra-title.png',
        'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'scene': 'menu:title', 'sampling': 'nearest, copied source RGBA; no recoloring',
        'layout': 'top quarter fire emitter, next quarter methane, bottom half water emitter; irregular wood stripes across all regions',
        'woodStripes': {'slope': slope, 'amplitude': amplitude, 'period': period, 'phase': phase,
                        'intervals': stripes, 'colorChange': False},
        'emitterIdentity': {'base': 'PARTICLE_SPAWNER', 'baseId': 153,
                            'userName': 'Particle Emitter', 'fire': 'TERRA_FIRE_SOURCE',
                            'water': 'TERRA_WATER_SOURCE', 'note': 'Existing project configurations of the native Particle Emitter'},
        'assets': assets, 'rgbaReconstructionExact': True,
        'status': 'prepared locally; revised four-material masks await native single-layer import/emitter integration',
    }
    (ROOT / 'assets/m13/title-particle-logo.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Prepared four disjoint material masks including seeded wood stripes; source RGBA reconstructs exactly.')


if __name__ == '__main__':
    main()
