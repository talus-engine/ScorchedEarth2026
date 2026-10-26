"""Install native rigid-body tank rigs through public Talus authoring APIs."""
import argparse
import json
from pathlib import Path

from bridge import ROOT, WORLD_ID, call, script
from build_m13_rig import build, load_parts


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def native(source):
    r = script(source)
    if not r['ok']:
        raise RuntimeError(r.get('error'))
    return r['value']


def install(target, receipts, palette=None):
    current = call('read_asset', {'kind': 'entity', 'id': target})['record']
    backup = ROOT / 'assets/m13/before/tanks' / (target + '.json')
    if not backup.exists():
        write(backup, current)
    original = json.loads(backup.read_text())
    # A retained backup is safe for a rerun only when the live record is still
    # that source, or exactly the rig we last installed. In particular, never
    # overwrite later body physics/equipment edits with a historical snapshot.
    retained = ROOT / 'assets/m13/templates/tanks' / (target + '.json')
    if current != original and (not retained.exists() or current != json.loads(retained.read_text())):
        raise RuntimeError('Tank changed since its retained snapshots: ' + target
                           + '. Reconcile current body/joint fields before reinstalling.')
    proposal = build(original, receipts, target_template_id=target, palette=palette)
    patch = proposal['templatePatch']
    call('save_entity_template', {'template': target, 'patch': patch, 'dryRun': True})
    records = [{'kind': 'animationClip', 'record': c} for c in proposal['clips']]
    records.append({'kind': 'animationController', 'record': proposal['controller']})
    validation = native('const rows=' + json.dumps(records) + ';const out=[];for(const r of rows){const v=await talus.editor.records.validate(r.kind,r.record);out.push({kind:r.kind,...v});}return out;')
    assert all(v['ok'] for v in validation), validation
    # Save normalized native records, then attach the controller and complete rig.
    normalized = [{'kind': row['kind'], 'record': row['record']} for row in validation]
    saved = native('const rows=' + json.dumps(normalized) + ';const out=[];for(const r of rows){out.push({kind:r.kind,record:await talus.editor.records.save(r.kind,r.record)});}return out;')
    controllers = native("return await talus.editor.records.list('animationController');")
    assert any(c['id'] == proposal['controller']['controllerId'] for c in controllers), 'Native controller missing'
    call('save_entity_template', {'template': target, 'patch': patch})
    actual = call('read_asset', {'kind': 'entity', 'id': target})['record']
    for field in patch:
        assert actual.get(field) == patch[field], ('Native rig readback mismatch', field)
    for field, value in current.items():
        if field not in patch:
            assert actual.get(field) == value, ('Unexpected non-art change', field)
    for before_body in original['bodies']:
        after_body = next(body for body in actual['bodies'] if body['bodyIndex'] == before_body['bodyIndex'])
        assert ({k: v for k, v in before_body.items() if k != 'pixels'}
                == {k: v for k, v in after_body.items() if k != 'pixels'}), 'Existing body settings changed'
    assert actual['joints'][:len(original['joints'])] == original['joints'], 'Existing joints changed'
    write(ROOT / 'assets/m13/templates/tanks' / (target + '.json'), actual)
    write(ROOT / 'assets/m13/animations' / (target + '.json'), saved)
    write(ROOT / 'assets/m13/rigs' / (target + '.json'), proposal)
    return {'templateId': target, **proposal['manifest'], 'nativeRecordsValidated': len(saved),
            'nativeReadback': True, 'nonArtFieldsPreserved': True}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode', choices=['prototype', 'roster'])
    args = p.parse_args()
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID
    receipts = load_parts()
    arena = json.loads((ROOT / 'world/Game/arena.json').read_text())
    path = ROOT / 'assets/m13/tank-install.json'
    ledger = json.loads(path.read_text()) if path.exists() else {}
    if args.mode == 'prototype':
        target = ledger.get('prototype', {}).get('templateId')
        if not target:
            created = call('save_entity_template', {'basedOn': arena['tankTemplate'],
                           'name': 'indigo/m13-tank-prototype', 'patch': {}})
            target = created['templateId']
            ledger['prototype'] = {'templateId': target}
            write(path, ledger)
        ledger['prototype'] = install(target, receipts)
        write(path, ledger)
        print(json.dumps(ledger['prototype']), flush=True)
    else:
        assert ledger.get('prototype', {}).get('nativeReadback'), 'Author the native prototype first'
        ledger.setdefault('roster', {})
        for target, palette in [(arena['tankTemplate'], None)] + [(v['templateId'], v['palette']) for v in arena['tankPalettes']]:
            ledger['roster'][target] = install(target, receipts, palette)
            write(path, ledger)
            print('Installed native tank rig', target, flush=True)


if __name__ == '__main__':
    main()
