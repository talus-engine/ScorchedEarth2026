"""Install generated weapon artwork through native template patches.

Preserves weapon IDs, item data and all gameplay fields. Run after reviewing
the generated contact sheet. Before/after records make the change reversible.
"""
import argparse
import copy
import json

from bridge import ROOT, WORLD_ID, call


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def install(keys):
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID
    plan = json.loads((ROOT / 'assets/m13/art-plan.json').read_text())
    weapons = {p['id']: p for p in plan['parts'] if p['kind'] == 'weapon'}
    assert keys and set(keys) <= set(weapons)
    receipt_path = ROOT / 'assets/m13/weapon-install.json'
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
    for key in keys:
        part = weapons[key]
        art = json.loads((ROOT / 'assets/m13/generated' / (key + '.json')).read_text())
        current = call('read_asset', {'kind': 'entity', 'id': part['targetTemplateId']})['record']
        before_path = ROOT / 'assets/m13/before/weapons' / (key + '.json')
        if not before_path.exists():
            write(before_path, current)
        original = json.loads(before_path.read_text())
        material = original['bodies'][0]['pixels'][0]['elementType']
        pixels = copy.deepcopy(art['body']['pixels'])
        assert pixels
        center_x = (min(p['localX'] for p in pixels) + max(p['localX'] for p in pixels)) // 2
        center_y = (min(p['localY'] for p in pixels) + max(p['localY'] for p in pixels)) // 2
        for pixel in pixels:
            pixel['localX'] -= center_x
            pixel['localY'] -= center_y
            pixel['elementType'] = material
        body = {**copy.deepcopy(original['bodies'][0]), 'name': part['name'] + ' sprite', 'pixels': pixels}
        patch = {'pixels': [], 'bodies': [body],
                 'canvasWidth': part['width'], 'canvasHeight': part['height']}
        call('save_entity_template', {'template': part['targetTemplateId'], 'patch': patch})
        actual = call('read_asset', {'kind': 'entity', 'id': part['targetTemplateId']})['record']
        assert actual['bodies'] == patch['bodies'] and not actual.get('pixels')
        for field, value in current.items():
            if field not in patch:
                assert actual.get(field) == value, (key, 'Unexpected gameplay change', field)
        write(ROOT / 'assets/m13/templates/weapons' / (key + '.json'), actual)
        receipt[key] = {'templateId': part['targetTemplateId'], 'sourceTemplateId': art['sourceTemplateId'],
                        'width': art['contentWidth'], 'height': art['contentHeight'],
                        'pixels': len(pixels), 'preservedGameplayFields': True}
        write(receipt_path, receipt)
        print('Installed', key, len(pixels), 'pixels; gameplay preserved', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('parts', nargs='+')
    install(parser.parse_args().parts)
