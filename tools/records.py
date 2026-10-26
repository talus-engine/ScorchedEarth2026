"""Capture or install the project's current native entity and animation records."""
import argparse
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call, script

DIRECTORY = ROOT / 'assets/native'


def native(source):
    result = script(source)
    if not result.get('ok') or result.get('error'):
        raise RuntimeError(result.get('error') or 'Native record operation failed')
    return result['value']


def entity_ids():
    arena = json.loads((ROOT / 'world/Game/arena.json').read_text())
    shop = json.loads((ROOT / 'world/Game/shop.json').read_text())
    return sorted({arena['tankTemplate'], *(p['templateId'] for p in arena['tankPalettes']),
                   *(i[k] for i in shop['items'] for k in ['template', 'modTemplate'] if i.get(k))})


def capture():
    ids = entity_ids()
    rows = []
    for identifier in ids:
        rows.append(call('read_asset', {'kind': 'entity', 'id': identifier})['record'])
        if len(rows) % 20 == 0:
            print('Read', len(rows), 'entity records', flush=True)
    folder = DIRECTORY / 'entities'
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob('*.json'):
        old.unlink()
    for record in rows:
        (folder / (record['templateId'] + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    for kind in ['animationClip', 'animationController']:
        records = native('const kind=' + json.dumps(kind) + ', ids=' + json.dumps(ids) + ';const out=[];for(const row of await talus.editor.records.list(kind)){const record=await talus.editor.records.get(kind,row.id);if(ids.includes(record.entityTemplateId))out.push(record)}return out')
        folder = DIRECTORY / kind
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob('*.json'):
            old.unlink()
        for record in records:
            identifier = record.get('clipId') or record['controllerId']
            (folder / (identifier + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    print('Captured', len(rows), 'entity records and their animation libraries.')


def install():
    proposals = []
    for path in sorted((DIRECTORY / 'entities').glob('*.json')):
        record = json.loads(path.read_text())
        identifier = record['templateId']
        current = native('return await talus.editor.templates.get(' + json.dumps(identifier) + ')')
        if current is None:
            raise RuntimeError('Import the complete project before installing native records: ' + identifier)
        patch = {k: v for k, v in record.items() if k != 'templateId' and current.get(k) != v}
        if patch:
            call('save_entity_template', {'template': identifier, 'patch': patch, 'dryRun': True})
            proposals.append((identifier, patch))
    for kind in ['animationClip', 'animationController']:
        for path in sorted((DIRECTORY / kind).glob('*.json')):
            record = json.loads(path.read_text())
            native('return await talus.editor.records.save(' + json.dumps(kind) + ',' + json.dumps(record) + ')')
    for identifier, patch in proposals:
        call('save_entity_template', {'template': identifier, 'patch': patch})
        actual = native('return await talus.editor.templates.get(' + json.dumps(identifier) + ')')
        if any(actual.get(k) != v for k, v in patch.items()):
            raise RuntimeError('Native record readback mismatch: ' + identifier)
    native('await talus.editor.save();return true')
    print('Installed', len(proposals), 'changed entity records.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['capture', 'install'])
    args = parser.parse_args()
    context = call('engine_describe_context')['world']
    if not context['isEditorMode'] or context['templateId'] != WORLD_ID:
        raise RuntimeError('Open the configured project in the editor first.')
    {'capture': capture, 'install': install}[args.action]()
