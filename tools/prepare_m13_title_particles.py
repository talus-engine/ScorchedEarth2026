"""Split the imported logo by material without recoloring any source pixels."""
import hashlib
import json
from PIL import Image
from bridge import ROOT


def main():
    source_path = ROOT / 'world/Art/scorched-terra-title.png'
    source = Image.open(source_path).convert('RGBA').resize((512, 256), Image.Resampling.NEAREST)
    assets = []
    merged = Image.new('RGBA', source.size)
    for name, element, start, end in (
        ('fire', 'TERRA_FIRE_SOURCE', 0, 64),
        ('methane', 'METHANE', 64, 128),
        ('water', 'TERRA_WATER_SOURCE', 128, 256),
    ):
        band = Image.new('RGBA', source.size)
        crop = source.crop((0, start, 512, end))
        band.paste(crop, (0, start))
        merged.paste(crop, (0, start))
        relative = f'Menus/Assets/earth-2026-logo-{name}.png'
        target = ROOT / 'world' / relative
        band.save(target)
        assets.append({
            'file': relative, 'element': element, 'x': 64, 'y': 20,
            'width': 512, 'height': 256, 'band': [start, end],
            'nontransparentPixels': sum(a > 0 for a in band.getchannel('A').tobytes()),
            'preservePixelColors': True,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        })
    assert merged.tobytes() == source.tobytes(), 'Material bands changed source RGBA'
    manifest = {
        'title': 'Scorched Earth 2026', 'source': 'Art/scorched-terra-title.png',
        'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'scene': 'menu:title', 'sampling': 'nearest, copied source RGBA; no recoloring',
        'layout': 'top quarter fire emitter, next quarter methane, bottom half water emitter',
        'assets': assets, 'rgbaReconstructionExact': True,
        'status': 'prepared; current isolated menu-scene API refuses image pixels and spawners',
    }
    (ROOT / 'assets/m13/title-particle-logo.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Prepared three material bands; reconstructed RGBA matches the sampled logo exactly.')


if __name__ == '__main__':
    main()
