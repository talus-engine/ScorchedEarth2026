"""Validate the actual palette pixels, native gates and all compatible joins."""
import base64
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def check():
    m = json.loads((ROOT/'world/WFC/template.json').read_text())
    root = ET.parse(ROOT/'world/WFC/bootstrap.svg').getroot()
    node = root.find('{http://www.w3.org/2000/svg}image')
    atlas = Image.open(io.BytesIO(base64.b64decode(node.get('href').split(',')[1])))
    tiles = {}
    for t in m['tiles']:
        x, y = t['atlasOrigin']
        p = atlas.crop((x, y, x+256, y+256))
        edges = {'north': [p.getpixel((n, 0)) for n in range(256)],
                 'south': [p.getpixel((n, 255)) for n in range(256)],
                 'east': [p.getpixel((255, n)) for n in range(256)],
                 'west': [p.getpixel((0, n)) for n in range(256)]}
        assert t['sizeChunks'] == [4, 4]
        for side, socket in t['sockets'].items():
            g = t['gates'][side]
            assert 0 <= g['a'] < g['b'] <= 1
            assert g == m['sockets'][socket]
            assert [bool(v) for v in edges[side]] == [socket != 'sky' and i >= round(g['a']*256) and i < round(g['b']*256) for i in range(256)], (t['name'], side)
        tiles[t['name']] = (t, p, edges)
    pairs = 0
    for a, _, ae in tiles.values():
        for b, _, be in tiles.values():
            for side, opposite in [('east', 'west'), ('south', 'north')]:
                if a['sockets'][side] == b['sockets'][opposite]:
                    assert ae[side] == be[opposite], (a['name'], b['name'], side, 'material seam')
                    assert a['gates'][side] == b['gates'][opposite]
                    pairs += 1
    placements = {(p['x'], p['y']): p for p in m['placements']}
    assert set(placements) == {(x, y) for x in range(0, 200, 4) for y in range(0, 20, 4)}
    assert len({p['source'] for p in placements.values() if p['origin']}) == 24
    assert sum(p['origin'] for p in placements.values()) == 24
    joins = 0
    for (x, y), p in placements.items():
        candidates = [t for t, _, _ in tiles.values() if t['sockets'] == p['sockets']]
        assert candidates, (x, y, 'empty domain')
        if y == 8: assert len(candidates) == 2
        if y == 12: assert len(candidates) == 4
        if y == 16: assert all(t['materials'] == {'STONE': 65536} for t in candidates)
        for dx, dy, side, opposite in [(4, 0, 'east', 'west'), (0, 4, 'south', 'north')]:
            n = placements.get((x+dx, y+dy))
            if n:
                assert p['sockets'][side] == n['sockets'][opposite]
                assert p['gates'][side] == n['gates'][opposite]
                joins += 1
    result = {'tiles': len(tiles), 'anchors': len(placements), 'origins': 24,
              'compatibleMaterialJoins': pairs, 'layoutJoins': joins,
              'allCandidateDomainsNonempty': True, 'solidBottom': True}
    print(json.dumps(result))
    return result


if __name__ == '__main__':
    check()
