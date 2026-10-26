"""Project declarations, immutable preset capture, editor guide and portable export."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from bridge import ROOT, WORLD_ID, call, script


def editor():
    context = call('engine_describe_context')
    if not context['world']['isEditorMode'] or context['world']['templateId'] != WORLD_ID:
        raise RuntimeError('Open the configured project in the editor first.')
    return context


def write(path):
    call('write_world_file', {'worldId': WORLD_ID, 'path': path, 'content': (ROOT / 'world' / path).read_text()})


def types():
    source = Path(editor()['files']['worldDir']) / 'Scripts/talus.d.ts'
    target = ROOT / '.build/talus.d.ts'
    target.parent.mkdir(exist_ok=True)
    shutil.copyfile(source, target)
    print('Saved current native declarations to .build/talus.d.ts')


def ui():
    editor()
    config = json.loads((ROOT / 'world/Game/input.json').read_text())
    result = script('const config=' + json.dumps(config) + ';const current=await talus.editor.records.get("gameUi");await talus.editor.records.save("gameUi",{...current,...config});await talus.editor.save();return await talus.editor.records.get("gameUi")')
    if not result.get('ok') or result.get('error'):
        raise RuntimeError(result)
    if any(result['value'].get(key) != value for key, value in config.items()):
        raise RuntimeError('Native game UI readback does not match Game/input.json.')
    print('Installed input bindings and game UI policy.')


def catalog():
    editor()
    documents = []
    sources = [('noise', 'noise', '/presets'), ('semantic', 'semantic', '/recipes'),
               ('growth', 'living', '/presets'), ('neural', 'neural', '/models'),
               ('vector', 'vectors', '/shapes'), ('material', 'element-catalog', '/elements'),
               ('settings', 'semantic-settings', '/presets/0')]
    for kind, name, pointer in sources:
        relative = 'Game/Presets/' + name + '.json'
        write(relative)
        data = (ROOT / 'world' / relative).read_bytes()
        document = {'kind': kind, 'path': relative, 'pointer': pointer, 'sha256': hashlib.sha256(data).hexdigest()}
        if kind == 'settings':
            document['id'] = 'default'
        documents.append(document)
    job = call('engine_resource_catalog', {'action': 'capture', 'catalog': 'terrain-presets', 'documents': documents})['job']
    while job['state'] in ['running', 'committing']:
        time.sleep(.5)
        job = call('engine_resource_catalog', {'action': 'status', 'job': job['id']})['job']
    if job['state'] != 'completed':
        raise RuntimeError(job.get('error') or job)
    result = job['catalog']
    (ROOT / 'world/Game/Presets/catalog.json').write_text(json.dumps(result, indent=2) + '\n')
    settings_path = ROOT / 'world/Game/generation.json'
    settings = json.loads(settings_path.read_text())
    settings['catalog'].update(id=result['id'], hash=result['hash'])
    settings_path.write_text(json.dumps(settings, indent=2) + '\n')
    write('Game/Presets/catalog.json'); write('Game/generation.json')
    print('Captured', len(result['manifest']['entries']), 'project-owned resources.')


def guide():
    editor()
    definition = json.loads((ROOT / 'world/Game/guide.json').read_text())
    definition['markdown'] = (ROOT / 'world/Guide.md').read_text()
    result = script('const definition=' + json.dumps(definition) + ';const old=(await talus.annotations.list()).find(n=>n.name===definition.name);const note=old?await talus.annotations.save({...old,...definition}):await talus.annotations.create(definition);await talus.editor.save();return note')
    if not result.get('ok') or result.get('error'):
        raise RuntimeError(result)
    if result['value']['visibility'] != 'editor':
        raise RuntimeError('Guide must remain editor-only.')
    print('Installed editor-only guide:', result['value']['annotationId'])


def export(args):
    executable = Path(args.binary).expanduser().resolve()
    publisher = Path(args.publisher).expanduser().resolve()
    destination = Path(args.output).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [str(executable), str(publisher / 'tools/publish/cli.mjs'), '--profile', str(Path(args.profile).expanduser()),
               '--project', WORLD_ID, '--out', str(destination)]
    if args.publish_snapshot:
        command.append('--publish-snapshot')
    if args.overwrite:
        command.append('--overwrite')
    result = subprocess.run(command, env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'})
    if result.returncode:
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for name in ['types', 'ui', 'catalog', 'guide']:
        sub.add_parser(name)
    output = sub.add_parser('export', help='Export a closed Talus profile through its bundled CLI.')
    output.add_argument('--binary', default='/Applications/Talus.app/Contents/MacOS/Talus')
    output.add_argument('--publisher', default='/Applications/Talus.app/Contents/Resources/publisher')
    output.add_argument('--profile', default=str(Path.home() / 'Library/Application Support/Talus'))
    output.add_argument('--output', default=str(ROOT / 'project/scorched-earth-2026.talus'))
    output.add_argument('--publish-snapshot', action='store_true')
    output.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    if args.action == 'export':
        export(args)
    else:
        {'types': types, 'ui': ui, 'catalog': catalog, 'guide': guide}[args.action]()
