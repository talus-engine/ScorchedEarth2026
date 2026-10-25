"""Losslessly display native generated pixel records; does not author art."""
import json
from PIL import Image, ImageDraw
from bridge import ROOT


def main():
    records = [json.loads(p.read_text()) for p in sorted((ROOT / 'assets/m13/generated').glob('*.json'))]
    assert records, 'No native generated part records yet'
    width, cell_h, columns = 1000, 150, 4
    sheet = Image.new('RGB', (width, ((len(records) + columns - 1) // columns) * cell_h), '#161529')
    draw = ImageDraw.Draw(sheet)
    for i, record in enumerate(records):
        pixels = record['body']['pixels']
        min_x, min_y = min(p['localX'] for p in pixels), min(p['localY'] for p in pixels)
        w, h = record['contentWidth'], record['contentHeight']
        part = Image.new('RGBA', (w, h))
        for p in pixels:
            color = p['color']
            part.putpixel((p['localX'] - min_x, p['localY'] - min_y),
                          (color & 255, (color >> 8) & 255, (color >> 16) & 255, (color >> 24) & 255))
        native = ROOT / 'assets/m13/png' / (record['id'] + '.png')
        native.parent.mkdir(parents=True, exist_ok=True)
        part.save(native)
        x, y = (i % columns) * (width // columns), (i // columns) * cell_h
        scale = min(6, 220 // w, 110 // h)
        enlarged = part.resize((w * scale, h * scale), Image.Resampling.NEAREST)
        sheet.paste(enlarged, (x + 15, y + 30), enlarged)
        draw.text((x + 15, y + 10), f"{record['id']} ({w}x{h})", fill='#ffffbb')
    dest = ROOT / 'artifacts/m13/art-contact-sheet.png'
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest)
    print(dest)


if __name__ == '__main__':
    main()
