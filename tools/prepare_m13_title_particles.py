"""Preview the current logo material script without recoloring pixels."""
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
    particle_image = 'Menus/Assets/earth-2026-logo.png'
    particle_path = args.output_root / 'world' / particle_image
    particle_path.parent.mkdir(parents=True, exist_ok=True)
    source.save(particle_path)
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
    names = [name.lower() for name in pattern['materials']]
    parts = {name: Image.new('RGBA', source.size) for name in names}
    part_pixels = {name: image.load() for name, image in parts.items()}
    pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            material = names[pattern['indices'][y * source.width + x]]
            part_pixels[material][x, y] = pixels[x, y]
    assets = []
    merged = Image.new('RGBA', source.size)
    occupied = bytearray(source.width * source.height)
    merged_pixels = merged.load()
    for name, element in zip(names, pattern['materials']):
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
            'width': 512, 'height': 256,
            'nontransparentPixels': sum(a > 0 for a in band.getchannel('A').tobytes()),
            'preservePixelColors': True,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        })
    assert merged.tobytes() == source.tobytes(), 'Material bands changed source RGBA'
    manifest = {
        'version': 4, 'seed': pattern['seed'],
        'script': 'Game/title-logo-pattern.js', 'reroll': 'each title entry',
        'title': 'Scorched Earth 2026', 'source': 'Art/scorched-terra-title.png',
        'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'scene': 'menu:title', 'sampling': 'nearest, copied source RGBA; no recoloring',
        'particleImage': {'file': particle_image, 'width': 512, 'height': 256,
                          'sha256': hashlib.sha256(particle_path.read_bytes()).hexdigest()},
        'layout': 'wood shell; randomized dynamite stripes confined to the center; peripheral fire/water/methane emitter patches',
        'coreStripes': {**pattern['stripes'], 'colorChange': False},
        'emitterIdentity': {'base': 'PARTICLE_SPAWNER', 'baseId': 153,
                            'userName': 'Particle Emitter', 'fire': 'TERRA_TITLE_FIRE_SOURCE',
                            'water': 'TERRA_TITLE_WATER_SOURCE', 'gas': 'TERRA_TITLE_GAS_SOURCE'},
        'assets': assets, 'rgbaReconstructionExact': True,
        'status': 'preview only; runtime evaluates Game/title-logo-pattern.js directly on the full image',
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"Prepared logo pattern seed {pattern['seed']}; source RGBA reconstructs exactly.")


if __name__ == '__main__':
    main()
