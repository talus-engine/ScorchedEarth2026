"""Generate native image-2 part art in resumable six-part source boards.

Uses Talus's configured image provider; no API key is read or exported.
Each board is an art-source template, never a gameplay spawn. Talus performs
one image call per part, chroma removal and native-size pixel conversion.
"""
import argparse
import hashlib
import json
from pathlib import Path

from bridge import ROOT, WORLD_ID, call


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def prompt_for(parts, style):
    geometry = [{'name': p['id'], 'boxX': n * 36, 'boxY': 0,
                 'boxW': p['width'], 'boxH': p['height'], 'isRoot': n == 0,
                 'material': 'IRON', 'imagePrompt': p['design']}
                for n, p in enumerate(parts)]
    return ('Create an exploded pixel-art source board for Scorched Terra. '
            'This is a reusable art library, not a playable character. '
            'Return exactly the listed separate body parts, in order, with the exact names '
            'and bounding boxes below. Generate each part independently. '
            'Exactly the first part is root; connect each other part to it with a hinge '
            'at its listed placement. Do not add connecting material, backgrounds, labels '
            'or unlisted bodies. All parts are inert solid metal: use IRON for the plan. '
            'Color is artwork only. Keep these deliberately tiny dimensions exactly. '
            + style + '\nPARTS:\n' + json.dumps(geometry, indent=2))


def generate(keys, confirmed_model):
    assert confirmed_model == 'gpt-image-2', 'Confirm the native configured model name, without reading its key'
    plan = json.loads((ROOT / 'assets/m13/art-plan.json').read_text())
    by_id = {p['id']: p for p in plan['parts']}
    assert keys and set(keys) <= set(by_id)
    context = call('engine_describe_context')['world']
    assert context['isEditorMode'] and context['templateId'] == WORLD_ID, 'Use the quiet Indigo editor lease'
    out = ROOT / 'assets/m13/generated'
    for offset in range(0, len(keys), 6):
        parts = [by_id[k] for k in keys[offset:offset + 6]]
        if all((out / (p['id'] + '.json')).exists() for p in parts):
            continue
        signature = hashlib.sha256(','.join(p['id'] for p in parts).encode()).hexdigest()[:12]
        receipt_path = ROOT / 'assets/m13/boards' / (signature + '.json')
        request = {'prompt': prompt_for(parts, plan['style']),
                   'templateName': 'indigo/art/m13/' + signature,
                   'targetHeight': max(p['height'] for p in parts),
                   'styleTheme': plan['style'],
                   'colorThemes': ['steel', 'charcoal', 'cyan', 'warm ivory', 'item-specific accent colors'],
                   'description': 'Generated tiny part source board; game installation copies art only.',
                   'tags': ['scorched-terra', 'm13', 'art-source']}
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
        else:
            write(ROOT / 'assets/m13/prompts' / (signature + '.json'), request)
            print('Generating', ', '.join(p['id'] for p in parts), flush=True)
            receipt = call('generate_entity', request, timeout=900)
            write(receipt_path, {'modelConfirmed': confirmed_model, **receipt})
        record = call('read_asset', {'kind': 'entity', 'id': receipt['templateId']})['record']
        write(ROOT / 'assets/m13/boards' / (signature + '-source.json'), record)
        bodies = record.get('bodies', [])
        assert len(bodies) == len(parts), 'Unexpected source-board part count; inspect retained board before continuing'
        for p, body in zip(parts, bodies):
            assert body['name'] == p['id'], (p['id'], body['name'])
            pixels = body['pixels']
            assert pixels, 'Empty generated part: ' + p['id']
            width = max(v['localX'] for v in pixels) - min(v['localX'] for v in pixels) + 1
            height = max(v['localY'] for v in pixels) - min(v['localY'] for v in pixels) + 1
            assert width <= p['width'] and height <= p['height'], (p['id'], width, height)
            write(out / (p['id'] + '.json'), {'id': p['id'], 'model': confirmed_model,
                  'sourceTemplateId': receipt['templateId'], 'sourceBodyIndex': body['bodyIndex'],
                  'requested': p, 'body': body, 'contentWidth': width, 'contentHeight': height})
            print('Saved', p['id'], f'{width}x{height}', len(pixels), 'pixels', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirmed-model', required=True)
    parser.add_argument('parts', nargs='+', help='Exact keys from assets/m13/art-plan.json')
    args = parser.parse_args()
    generate(args.parts, args.confirmed_model)
