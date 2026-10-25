"""Author the free escape cast and append it to existing tank loadouts.

Requires the Indigo editor. No stock materials, hull pixels, controllers or paid
weapons are edited. Readback verifies every tank's other authored fields.
"""
import argparse
import hashlib
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call, script
from install_m1 import save_template


def install(output):
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID, 'Indigo editor required'
    shop_path = ROOT / 'world/Game/shop.json'
    shop = json.loads(shop_path.read_text())
    item = next(i for i in shop['items'] if i['id'] == 'escape-charge')
    assert item['unlimited'] and item['price'] == 0 and item['noCombatRewards']
    names = list(dict.fromkeys(['IRON', 'SMOKE'] + [m['name'] for m in item['behavior']['materials']]))
    materials = script('const names=' + json.dumps(names) + ';return Object.fromEntries(names.map(n=>{const e=talus.elements.get(n);if(!e)throw Error("Missing material "+n);return [n,e.id]}));')['value']
    spec = dict(item['projectile'])
    spec['elementType'] = materials[spec.pop('material', 'IRON')]
    mod_name, name = 'indigo/m12-escape-charge-shell', 'indigo/m12-escape-charge'
    mod = save_template(mod_name, 'indigo/m5-shell', {'itemData': {'modSpec': {'powerCost': 0, 'recoilDelta': 0, 'projectile': spec}}})
    weapon = save_template(name, 'indigo/m5-cannon', {'itemData': {'startingMods': [mod_name], 'weaponBaseStats': {'castDelay': 0, 'rechargeTime': 0, 'spread': 0}}, 'description': item['description']})
    item['template'], item['modTemplate'] = weapon, mod
    arena = json.loads((ROOT / 'world/Game/arena.json').read_text())
    tanks = list(dict.fromkeys([arena['tankTemplate']] + [p['templateId'] for p in arena['tankPalettes']]))
    evidence = {'weapon': weapon, 'mod': mod, 'materials': materials, 'tanks': []}
    fields = ['bodies', 'joints', 'characterController', 'stats', 'indestructible', 'ragdollOnDeath', 'dropInventoryOnDeath']
    for tid in tanks:
        before = call('read_asset', {'kind': 'entity', 'id': tid})['record']
        items = list(before['startingItems'])
        if weapon not in items:
            items.append(weapon)
            call('save_entity_template', {'template': tid, 'patch': {'startingItems': items}})
        after = call('read_asset', {'kind': 'entity', 'id': tid})['record']
        assert after['startingItems'] == items, tid
        for field in fields:
            assert before.get(field) == after.get(field), (tid, field)
        digest = hashlib.sha256(json.dumps({k: before.get(k) for k in fields}, sort_keys=True).encode()).hexdigest()
        evidence['tanks'].append({'id': tid, 'startingItems': items, 'otherAuthoredFieldsUnchanged': True, 'preservedHash': digest})
    evidence['weaponRecord'] = call('read_asset', {'kind': 'entity', 'id': weapon})['record']
    evidence['modRecord'] = call('read_asset', {'kind': 'entity', 'id': mod})['record']
    shop_path.write_text(json.dumps(shop, indent=2) + '\n')
    (ROOT / 'assets/m12-escape-ids.json').write_text(json.dumps({'weapon': weapon, 'mod': mod, 'tanks': tanks}, indent=2) + '\n')
    call('write_world_file', {'worldId': WORLD_ID, 'path': 'Game/shop.json', 'content': shop_path.read_text()})
    script('await talus.editor.save();return true')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps({'weapon': weapon, 'mod': mod, 'tankCount': len(tanks), 'evidence': str(output)}))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    install(args.output)
