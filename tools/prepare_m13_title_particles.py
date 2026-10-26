"""Assign logo materials and seeded wood stripes without recoloring pixels."""
import argparse
import hashlib
import json
import secrets
import subprocess
from pathlib import Path
from PIL import Image
from bridge import ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=int, help='Reproduce a pattern; omit to make a fresh one')
    parser.add_argument('--output-root', type=Path, default=ROOT, help='Write previews elsewhere without changing project assets')
    args = parser.parse_args()
    source_path = ROOT / 'world/Art/scorched-terra-title.png'
    source = Image.open(source_path).convert('RGBA').resize((512, 256), Image.Resampling.NEAREST)
    manifest_path = args.output_root / 'assets/m13/title-particle-logo.json'
    seed = args.seed
    if seed is None:
        previous = json.loads(manifest_path.read_text()).get('seed') if manifest_path.exists() else None
        seed = secrets.randbits(32)
        if seed == previous:
            seed = (seed + 1) & 0xffffffff
    result = subprocess.run(['node', str(ROOT / 'tools/title_logo_pattern.cjs')],
                            input=json.dumps({'width': 512, 'height': 256, 'seed': seed}),
                            capture_output=True, text=True, check=True)
    pattern = json.loads(result.stdout)
    parts = {name: Image.new('RGBA', source.size) for name in ('fire', 'methane', 'water', 'wood')}
    part_pixels = {name: image.load() for name, image in parts.items()}
    pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            material = ('fire', 'methane', 'water', 'wood')[pattern['indices'][y * source.width + x]]
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
        target = args.output_root / 'world' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
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
        'version': 3, 'seed': pattern['seed'],
        'script': 'Game/title-logo-pattern.js', 'reroll': 'each title entry',
        'title': 'Scorched Earth 2026', 'source': 'Art/scorched-terra-title.png',
        'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'scene': 'menu:title', 'sampling': 'nearest, copied source RGBA; no recoloring',
        'layout': 'top quarter fire emitter, next quarter methane, bottom half water emitter; irregular wood stripes across all regions',
        'woodStripes': {**pattern['stripes'], 'colorChange': False},
        'emitterIdentity': {'base': 'PARTICLE_SPAWNER', 'baseId': 153,
                            'userName': 'Particle Emitter', 'fire': 'TERRA_FIRE_SOURCE',
                            'water': 'TERRA_WATER_SOURCE', 'note': 'Existing project configurations of the native Particle Emitter'},
        'assets': assets, 'rgbaReconstructionExact': True,
        'status': 'prepared locally; revised four-material masks await native single-layer import/emitter integration',
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"Prepared wood pattern seed {pattern['seed']}; source RGBA reconstructs exactly.")


if __name__ == '__main__':
    main()
