"""Cut the actual Talus noise-brush swatch into the Indigo WFC palette.

Requires Pillow. On this workstation use `arch -x86_64 python3` for Pillow.
No noise is generated here: material indices come from the engine export.
"""
import base64
import collections
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
AREA = 'indigo-mixed'
NS = '{https://talus.dev/ns/world}'
root = ET.parse(ROOT / 'assets/mixed-earth-swatch.svg').getroot()
node = next(n for n in root.iter() if n.get(NS + 'channel') == 'element')
source = Image.open(io.BytesIO(base64.b64decode(node.get('{http://www.w3.org/1999/xlink}href').split(',')[1])))
palette = {int(e.get('index')): (e.get('name'), e.get('color')) for e in root.iter(NS + 'element')}
stone = next(i for i, (name, _) in palette.items() if name == 'STONE')
# The brush stroke's outside edge is not tile content. All four cuts are full.
patches = [source.crop((x, y, x+256, y+256)) for y in (3, 256) for x in (0, 256)]
assert all(0 not in patch.getdata() for patch in patches)
tiles = [('sky', 'sky sky sky sky', Image.new('L', (256,256)), 1),
         ('bedrock', 'bedrock bedrock bedrock bedrock', Image.new('L',(256,256),stone), 1)]
for i, patch in enumerate(patches):
    tiles.append((f'interior-{i}', 'mixed bedrock mixed mixed', patch, 1))
for west in (64,128,192):
    for east in (64,128,192):
        for variation in (-16,16):
            middle = (west+east)//2 + variation
            patch = patches[(len(tiles)-6)%4].copy()
            for x in range(256):
                top = west+(middle-west)*(x+.5)/96 if x<96 else middle if x<160 else middle+(east-middle)*(x+.5-160)/96
                for y in range(256):
                    if y+.5 < top: patch.putpixel((x,y),0)
            tiles.append((f'ground-{west}-{east}-{variation+16}', f'sky mixed h{east} h{west}', patch, 3 if west==east else 1))
groups=[]; stats=[]; atlas=Image.new('L',(1536,1024))
for index,(name,sockets,patch,weight) in enumerate(tiles):
    ox,oy=(index%6)*256,(index//6)*256
    atlas.paste(patch,(ox,oy))
    groups.append(f'<g class="wfc-tile" talus:tile="mixed-{name}" talus:area="{AREA}" talus:size="4x4" talus:origin="{ox} {oy}" talus:sockets="{sockets}" talus:weight="{weight}"/>')
    stats.append({'tile':name,'sockets':sockets,'counts':{palette[i][0] if i else 'EMPTY':n for i,n in collections.Counter(patch.getdata()).items()}})
metadata='<metadata><talus:elements>'+''.join(f'<talus:element index="{i}" name="{name}" color="{color}"/>' for i,(name,color) in palette.items())+'</talus:elements></metadata>'
buf=io.BytesIO();atlas.save(buf,format='PNG');image=base64.b64encode(buf.getvalue()).decode()
matter=f'<image x="0" y="0" width="1536" height="1024" talus:channel="element" talus:palette="metadata" href="data:image/png;base64,{image}"/>'
groups.append(f'<g class="wfc-area" talus:area="{AREA}" talus:boundary="*" talus:chunkX0="0" talus:chunkY0="0" talus:chunkX1="199" talus:chunkY1="19"/>')
svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:talus="https://talus.dev/ns/world" viewBox="0 0 1536 1024">'+metadata+matter+'\n'.join(groups)+'</svg>\n'
(ROOT/'assets/mixed-reach.svg').write_text(svg)
(ROOT/'docs/evidence/m4-mixed-palette.json').write_text(json.dumps({'recipe':'assets/mixed-earth-brush.json','source':'assets/mixed-earth-swatch.svg','tiles':stats},indent=2)+'\n')
print('Built',len(tiles),'tiles from engine noise swatch;',len(svg),'bytes; bottom tile has',stats[1]['counts'])
