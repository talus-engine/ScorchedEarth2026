"""Capture real Talus files for Git; install reviewed text through the public API.

No automatic deletions or conflict resolution. A missing/offline mount refuses.
The ignored baseline records the last identical bytes, not a preferred side.
"""
import argparse
import hashlib
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call

TEXT = {'.ts', '.js', '.json', '.ink', '.html', '.css', '.md', '.txt', '.svg', '.csv'}
ASSETS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.wav', '.ogg', '.mp3', '.flac', '.bin'}
GENERATED = {'Scripts/talus.d.ts', 'Scripts/tsconfig.json'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory(root):
    if not root.is_dir():
        raise RuntimeError('Directory unavailable (mount may be offline): ' + str(root))
    out = {}
    for p in sorted(root.rglob('*')):
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            raise RuntimeError('Refusing symlink: ' + str(p))
        if not p.is_file() or any(part.startswith('.') for part in p.relative_to(root).parts):
            continue
        if rel.startswith(('Thumbnail/', 'Worlds/', 'AI/world-raster/samples/')) or rel in GENERATED or p.name.startswith('example-'):
            continue
        if p.suffix == '.js' and p.with_suffix('.ts').exists():
            continue
        if p.suffix not in TEXT | ASSETS:
            continue
        data = p.read_bytes()
        out[rel] = {'sha256': digest(data), 'bytes': len(data)}
    if not out:
        raise RuntimeError('No authored files found; refusing an empty snapshot')
    return out


def classify(local, live, baseline):
    rows = []
    for name in sorted(local.keys() | live.keys() | baseline.keys()):
        a, b = local.get(name, {}).get('sha256'), live.get(name, {}).get('sha256')
        old = baseline.get(name)
        if a == b:
            state = 'same' if a else 'absent'
        elif old is None:
            state = 'mount-new' if a is None else 'repo-new' if b is None else 'conflict'
        elif a is None or b is None:
            state = 'missing-side'  # Never turn a missing mount/file into a deletion.
        elif a == old:
            state = 'mount-changed'
        elif b == old:
            state = 'repo-changed'
        else:
            state = 'conflict'
        rows.append({'path': name, 'state': state, 'repo': a, 'mount': b})
    return rows


def context():
    c = call('engine_describe_context')
    w = c['world']
    if not w['isEditorMode'] or w['templateId'] != WORLD_ID or not w['engineBooted']:
        raise RuntimeError('Open the configured project in the Talus editor first')
    mount = c['files'].get('hostMount')
    if not mount or not mount['mounted']:
        raise RuntimeError('The Talus file mount is offline')
    return Path(c['files']['worldDir'])


def sync(action, local_root, live_root, state_path, paths=None, writer=None):
    old = json.loads(state_path.read_text()) if state_path.exists() else {'template': WORLD_ID, 'files': {}}
    if old['template'] != WORLD_ID:
        raise RuntimeError('Baseline belongs to a different template')
    local, live = inventory(local_root), inventory(live_root)
    rows = classify(local, live, old['files'])
    selected = set(paths) if paths else {r['path'] for r in rows}
    if selected - {r['path'] for r in rows}:
        raise RuntimeError('Unknown paths: ' + ', '.join(sorted(selected - {r['path'] for r in rows})))
    chosen = [r for r in rows if r['path'] in selected]
    if action == 'status':
        return rows
    conflicts = [r['path'] for r in chosen if r['state'] in {'conflict', 'missing-side'}]
    if conflicts:
        raise RuntimeError('Resolve these files explicitly before syncing: ' + ', '.join(conflicts))
    allowed = {'mount-new', 'mount-changed'} if action == 'capture' else {'repo-new', 'repo-changed'}
    work = [r for r in chosen if r['state'] in allowed]
    if action == 'install':
        unsupported = [r['path'] for r in work if Path(r['path']).suffix not in TEXT or local[r['path']]['bytes'] > 1024 * 1024]
        if unsupported:
            raise RuntimeError('Install these binary/large assets with talus.files.writeBytes: ' + ', '.join(unsupported))
        if writer is None:
            raise RuntimeError('No public-API installer configured')
    # Preflight every file before the first mutation, and recheck each side at use.
    if inventory(local_root) != local or inventory(live_root) != live:
        raise RuntimeError('Files changed during preflight; retry after editing stops')
    for row in work:
        name = row['path']
        src, dst = (live_root / name, local_root / name) if action == 'capture' else (local_root / name, live_root / name)
        data = src.read_bytes()
        source_hash = row['mount'] if action == 'capture' else row['repo']
        dest_hash = row['repo'] if action == 'capture' else row['mount']
        if digest(data) != source_hash or (digest(dst.read_bytes()) if dst.exists() else None) != dest_hash:
            raise RuntimeError('File changed before write: ' + name)
        if action == 'capture':
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_name('.' + dst.name + '.capture')
            tmp.write_bytes(data)
            tmp.replace(dst)
        else:
            writer(name, data.decode('utf-8'))
        # Install verification reads the API, so it need not wait for NFS caching.
        if action == 'capture' and digest(dst.read_bytes()) != source_hash:
            raise RuntimeError('Capture readback failed: ' + name)
        old['files'][name] = source_hash
    for row in chosen:
        if row['state'] == 'same':
            old['files'][row['path']] = row['repo']
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(old, indent=2) + '\n')
    return [dict(r, applied=r in work) for r in rows]


def install_text(path, content):
    # Recheck session ownership before each write; scripts hot-reload in editor.
    context()
    call('write_world_file', {'worldId': WORLD_ID, 'path': path, 'content': content})
    if call('read_world_file', {'worldId': WORLD_ID, 'path': path})['content'] != content:
        raise RuntimeError('Installed readback failed: ' + path)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=('status', 'capture', 'install'))
    p.add_argument('--path', action='append', help='Select individual relative paths; repeat as needed')
    args = p.parse_args()
    live = context()
    rows = sync(args.action, ROOT / 'world', live, ROOT / '.build/sync/baseline.json', args.path, install_text)
    for row in rows:
        if row['state'] != 'same':
            print(('APPLIED ' if row.get('applied') else '') + row['state'] + ' ' + row['path'])
    print(f'{sum(r["state"] == "same" for r in rows)} identical files; no deletions')
    if args.action == 'install':
        result = call('engine_run_script', {'source': 'await talus.editor.save();return true', 'timeoutMs': 30000}, 35)
        if not result.get('value'):
            raise RuntimeError('Template save did not complete')
        status = call('engine_script_status')
        if status.get('faulted'):
            raise RuntimeError('Installed script fault: ' + json.dumps(status['faulted']))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
