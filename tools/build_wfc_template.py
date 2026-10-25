"""Build the artist's square WFC scaffold from Talus-authored material pixels.

Run with `arch -x86_64 python3 tools/build_wfc_template.py` on this workstation.
No procedural noise is substituted for the native brush: the existing exported
noise swatch supplies the material, while this script defines the tile geometry.
This is a bootstrap asset builder, not a command to overwrite later artist work.
"""
import base64
import collections
import io
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'world/WFC'
AREA = 'terra-reach-v2'
SIZE = 256
SIDES = ['north', 'south', 'east', 'west']
NS = '{https://talus.dev/ns/world}'


def main():
    OUT.mkdir(exist_ok=True)
    swatch = ROOT / 'assets/mixed-earth-swatch.svg'
    (OUT / 'mixed-earth-swatch.svg').write_bytes(swatch.read_bytes())
    root = ET.parse(swatch).getroot()
    node = next(n for n in root.iter() if n.get(NS + 'channel') == 'element')
    source = Image.open(io.BytesIO(base64.b64decode(node.get('{http://www.w3.org/1999/xlink}href').split(',')[1])))
    palette = {int(e.get('index')): (e.get('name'), e.get('color')) for e in root.iter(NS + 'element')}
    stone = next(i for i, (name, _) in palette.items() if name == 'STONE')
    patches = [source.crop((x, y, x+SIZE, y+SIZE)) for y in (3, 256) for x in (0, 256)]
    assert all(0 not in patch.getdata() for patch in patches)
    gates = {'sky': {'a': 0, 'b': 1}, 'earth': {'a': 0, 'b': 1}, 'stone': {'a': 0, 'b': 1},
             **{f'h{h}': {'a': h/SIZE, 'b': 1} for h in (64, 128, 192)}}
    rows, pictures = [], []

    def add(name, sockets, img, role, weight=1):
        i = len(rows)
        rows.append({'name': f'terra-v2-{name}', 'role': role, 'sizeChunks': [4, 4],
                     'atlasOrigin': [(i % 6)*SIZE, (i//6)*SIZE],
                     'sockets': dict(zip(SIDES, sockets.split())), 'weight': weight,
                     'gates': {s: gates[v] for s, v in zip(SIDES, sockets.split())},
                     'materials': {palette[v][0] if v else 'EMPTY': n for v, n in collections.Counter(img.getdata()).items()}})
        pictures.append(img)

    # Shared two-pixel material rims make both geometry and material agree.
    # The rim itself is copied from the native noise swatch, not a rock cage.
    horizontal = [patches[0].getpixel((x, 128)) for x in range(SIZE)]
    vertical = [patches[0].getpixel((128, y)) for y in range(SIZE)]
    horizontal[0] = horizontal[1] = horizontal[-1] = horizontal[-2] = stone
    vertical[0] = vertical[1] = vertical[-1] = vertical[-2] = stone

    def material(index, interior=False):
        p = patches[index % 4].copy()
        for t in range(SIZE):
            for border in (0, 1, 254, 255):
                p.putpixel((t, border), horizontal[t])
                p.putpixel((border, t), vertical[t])
        if interior:
            for y in range(240, 256):
                for x in range(256):
                    p.putpixel((x, y), stone)
        return p

    add('sky', 'sky sky sky sky', Image.new('L', (SIZE, SIZE)), 'sky')
    add('bedrock', 'stone stone stone stone', Image.new('L', (SIZE, SIZE), stone), 'bedrock')
    for i in range(4):
        add(f'earth-{i+1}', 'earth stone earth earth', material(i, True), 'interior')
    for west in (64, 128, 192):
        for east in (64, 128, 192):
            for variant, offset in [('ridge', -48), ('bowl', 48)]:
                p = material(len(rows))
                center = max(24, min(232, (west + east)//2 + offset))
                for x in range(SIZE):
                    # Eight-pixel flat collars are the artist's seam contract.
                    if x < 8: height = west
                    elif x >= 248: height = east
                    elif x < 104:
                        t = (x-8)/96
                        height = west + (center-west)*(1-math.cos(t*math.pi))/2
                    elif x < 152: height = center
                    else:
                        t = (x-152)/96
                        height = center + (east-center)*(1-math.cos(t*math.pi))/2
                    for y in range(round(height)):
                        p.putpixel((x, y), 0)
                add(f'{west}-{east}-{variant}', f'sky earth h{east} h{west}', p, 'surface')

    # An Euler circuit visits each height pair twice, once for each variant.
    graph = {v: [(e, variant) for e in (64, 128, 192) for variant in ('ridge', 'bowl')] for v in (64, 128, 192)}
    route = []
    def visit(v):
        while graph[v]:
            e, variant = graph[v].pop(0)
            visit(e)
            route.append((v, e, variant))
    visit(128)
    route.reverse()
    assert len(route) == 18 and route[0][0] == route[-1][1] == 128
    assert all(a[1] == b[0] for a, b in zip(route, route[1:]))
    # Continue a fixed, connected seam scaffold. Seeds remix ridge/bowl forms
    # and earth textures inside it. Every editor guide stays exact (no union).
    heights = [128, 128, 192, 128, 64, 64, 128, 192, 192, 128, 64, 128,
               128, 192, 128, 64, 128, 192, 128, 128, 64, 64, 128, 192,
               128, 64, 128, 192, 192, 128, 64, 128, 128]
    route += [(heights[i], heights[i+1], 'ridge' if i % 2 else 'bowl') for i in range(32)]
    by_name = {t['name']: t for t in rows}
    placements = []
    origins = set()
    for y in range(5):
        for x in range(50):
            if y < 2: name = 'terra-v2-sky'
            elif y == 2:
                w, e, variant = route[x]
                name = f'terra-v2-{w}-{e}-{variant}'
            elif y == 3: name = f'terra-v2-earth-{x%4+1}'
            else: name = 'terra-v2-bedrock'
            t = by_name[name]
            is_origin = name not in origins
            origins.add(name)
            row = {'x': x*4, 'y': y*4, 'source': name, 'origin': is_origin,
                   'sockets': t['sockets'], 'gates': t['gates']}
            if is_origin: t['originAnchor'] = {'x': row['x'], 'y': row['y']}
            placements.append(row)
    assert len(origins) == 24

    manifest = {'version': 2, 'areaId': AREA, 'tileSizePixels': SIZE, 'tileSizeChunks': 4,
                'grid': {'x': 0, 'y': 0, 'columns': 50, 'rows': 5},
                'sourceSwatch': 'WFC/mixed-earth-swatch.svg',
                'sourceSwatchNote': 'Historical bootstrap input only; current painted origins are native WFC tile art.',
                'gateMeaning': 'Filled bridge span. Sky is a full EMPTY edge. Fractions run left-to-right on N/S and top-to-bottom on E/W.',
                'collarPixels': 8, 'seedPolicy': 'Fixed connecting heights; seeded ridge/bowl silhouettes and four mixed-earth textures. Source tiles are WYSIWYG in the editor and join the same palette in games.',
                'sockets': gates, 'tiles': rows, 'placements': placements}
    (OUT / 'template.json').write_text(json.dumps(manifest, indent=2)+'\n')
    atlas = Image.new('L', (1536, 1024))
    groups = []
    for t, img in zip(rows, pictures):
        ox, oy = t['atlasOrigin']
        atlas.paste(img, (ox, oy))
        groups.append(f'<g class="wfc-tile" talus:tile="{t["name"]}" talus:area="{AREA}" talus:size="4x4" talus:origin="{ox} {oy}" talus:sockets="{" ".join(t["sockets"][s] for s in SIDES)}" talus:weight="{t["weight"]}"/>')
    buf = io.BytesIO(); atlas.save(buf, format='PNG')
    metadata = '<metadata><talus:elements>'+''.join(f'<talus:element index="{i}" name="{name}" color="{color}"/>' for i, (name, color) in palette.items())+'</talus:elements></metadata>'
    svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:talus="https://talus.dev/ns/world" viewBox="0 0 1536 1024">'+metadata+f'<image width="1536" height="1024" talus:channel="element" talus:palette="metadata" href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/>'+''.join(groups)+'</svg>\n'
    # No area stamp: installation changes all constraints in one reviewed edit.
    (OUT / 'bootstrap.svg').write_text(svg)
    # Contact sheet is a reference only. Native sliders are installed as gates.
    sheet = ['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1160" viewBox="0 0 1440 1160"><rect width="1440" height="1160" fill="#111322"/><g font-family="monospace" fill="#eeeeee"><text x="20" y="26" font-size="20">SCORCHED TERRA / WFC ARTIST SCAFFOLD / 256 x 256 PER TILE</text>']
    for i, (t, img) in enumerate(zip(rows, pictures)):
        rgb = Image.new('RGB', (256, 256), '#151b30')
        rgb.putdata([tuple(int(palette[v][1].lstrip('#')[k:k+2], 16) for k in (0, 2, 4)) if v else (21, 27, 48) for v in img.getdata()])
        b = io.BytesIO(); rgb.save(b, format='PNG')
        x, y = 20+(i%6)*238, 64+(i//6)*274
        sheet.append(f'<text x="{x}" y="{y-12}" font-size="11">{t["name"].replace("terra-v2-", "")}  @{t["originAnchor"]["x"]},{t["originAnchor"]["y"]}</text><image x="{x}" y="{y}" width="208" height="208" href="data:image/png;base64,{base64.b64encode(b.getvalue()).decode()}"/><rect x="{x}" y="{y}" width="208" height="208" fill="none" stroke="#707b98"/>')
        for side, g in t['gates'].items():
            for v in (g['a'], g['b']):
                if side in ('north', 'south'):
                    a, b = x+v*208, y+(208 if side == 'south' else 0)
                    c, d = a, b+(-11 if side == 'south' else 11)
                else:
                    a, b = x+(208 if side == 'east' else 0), y+v*208
                    c, d = a+(-11 if side == 'east' else 11), b
                sheet.append(f'<path d="M{a},{b}L{c},{d}" stroke="#5ff2c2" stroke-width="2"/>')
        sheet.append(f'<text x="{x}" y="{y+228}" font-size="10">N:{t["sockets"]["north"]} S:{t["sockets"]["south"]} E:{t["sockets"]["east"]} W:{t["sockets"]["west"]}</text>')
    sheet.append('</g></svg>\n')
    (OUT / 'artist-sheet.svg').write_text(''.join(sheet))
    print(f'Built {len(rows)} tiles / {len(placements)} anchors / {len(origins)} editable origins')


if __name__ == '__main__':
    main()
