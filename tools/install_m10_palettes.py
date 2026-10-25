"""Native template variants: change only packed RGBA colors, never elements.

The first five palettes reflect the persona art direction. Repeated palette
families have distinct colors; actual faction/AI assignment awaits M10 engine.
"""
import colorsys
import copy
import json
from bridge import ROOT, WORLD_ID, call

context = call('engine_describe_context', timeout=15)['world']
assert context['isEditorMode'] and context['templateId'] == WORLD_ID
arena = json.loads((ROOT / 'world/Game/arena.json').read_text())
base = call('read_asset', {'kind': 'entity', 'id': arena['tankTemplate']}, timeout=20)['record']
personas = json.loads((ROOT / 'world/Game/personas.json').read_text())['personas']
assets_path = ROOT / 'assets/m10-palette-ids.json'
previous = json.loads(assets_path.read_text()) if assets_path.exists() else {}
variants = []

def pack(color):
    r, g, b = (int(color[n:n+2], 16) for n in (1, 3, 5))
    return (255 << 24) | (b << 16) | (g << 8) | r

def shift(color, band):
    if not band:
        return color
    rgb = [int(color[n:n+2],16)/255 for n in (1,3,5)]
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    rgb = colorsys.hsv_to_rgb((h + [.0, .035, -.035, .07][band]) % 1, s * [1,.7,.9,.6][band], v * [1,.85,1,.9][band])
    return '#' + ''.join(f'{round(c*255):02X}' for c in rgb)

def without_colors(bodies):
    out = copy.deepcopy(bodies)
    for b in out:
        for p in b['pixels']:
            p.pop('color', None)
    return out

for i in range(16):
    persona = personas[i % 5]
    palette = {k: shift(v, i // 5) for k,v in persona['palette'].items()}
    bodies = copy.deepcopy(base['bodies'])
    # Original authored hull uses three region colors; keep every particle,
    # body role/joint/controller unchanged and write only its color sidecar.
    colors = list(dict.fromkeys(p['color'] for b in bodies for p in b['pixels']))
    mapping = dict(zip(colors, [pack(palette[k]) for k in ['body','turret','accent']]))
    for b in bodies:
        for p in b['pixels']:
            p['color'] = pack(palette['tracks']) if b['bodyIndex']==0 and p['localY']>=4 else mapping[p['color']]
    assert without_colors(bodies) == without_colors(base['bodies'])
    name = f'indigo/m10-tank-{i+1:02}'
    args = {'template': previous[name]} if name in previous else {'basedOn': arena['tankTemplate'], 'name': name}
    saved = call('save_entity_template', {**args, 'patch': {'bodies': bodies}}, timeout=25)
    template_id = saved['templateId']
    actual = call('read_asset', {'kind': 'entity', 'id': template_id}, timeout=20)['record']
    assert actual['bodies'] == bodies, name
    for field in ['joints','characterController','stats','startingItems','indestructible','ragdollOnDeath','dropInventoryOnDeath']:
        assert actual[field] == base[field], (name, field)
    previous[name] = template_id
    assets_path.write_text(json.dumps(previous, indent=2) + '\n')
    variants.append({'templateId': template_id, 'color': palette['body'], 'palette': palette, 'style': persona['id']})
    print('Verified color-only variant', i+1, palette['body'], flush=True)

assert len({v['color'] for v in variants}) == 16
arena['tankPalettes'] = variants
(ROOT / 'world/Game/arena.json').write_text(json.dumps(arena, indent=2) + '\n')
call('write_world_file', {'worldId': WORLD_ID, 'path': 'Game/arena.json', 'content': json.dumps(arena, indent=2)}, timeout=20)
(ROOT / 'docs/evidence/m10/color-only-variants.json').write_text(json.dumps({
    'base': arena['tankTemplate'], 'variants': variants, 'pixelsPerTank': sum(len(b['pixels']) for b in base['bodies']),
    'sameElementsGeometryPhysicsHealthInventory': True, 'nativeReadbackVerified': True,
}, indent=2) + '\n')
