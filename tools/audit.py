"""Check the maintained template's structure, native imports and file references."""
import argparse
import gzip
import json
import re
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = {'.md', '.py', '.ts', '.js', '.cjs', '.mjs', '.html', '.css', '.json', '.ink'}


def audit_archive(problems):
    project = json.loads((ROOT / 'project.json').read_text())
    archive = ROOT / project['archive']
    if not archive.exists():
        return
    try:
        with tempfile.TemporaryDirectory(prefix='talus-template-audit-') as folder:
            database = Path(folder) / 'project.sqlite'
            with gzip.open(archive, 'rb') as source, database.open('wb') as target:
                total = 0
                while chunk := source.read(1024 * 1024):
                    total += len(chunk)
                    if total > 1024 * 1024 * 1024:
                        raise ValueError('Archive exceeds the 1 GiB validation budget.')
                    target.write(chunk)
            connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
            try:
                integrity = connection.execute('PRAGMA integrity_check').fetchall()
                if integrity != [('ok',)]:
                    problems.append('Archive integrity: ' + str(integrity[:3]))
                for path in (ROOT / project['worldFiles']).rglob('*'):
                    if not path.is_file():
                        continue
                    relative = path.relative_to(ROOT / project['worldFiles']).as_posix()
                    row = connection.execute('SELECT bytes FROM world_files WHERE world_id=? AND path=?',
                                             (project['worldId'], relative)).fetchone()
                    if row is None or row[0] != path.read_bytes():
                        problems.append('Archive source mismatch: ' + relative)
                title = connection.execute('SELECT parent_id,kind,scene_id FROM world_document_links WHERE document_id=?',
                                           (project['titleWorldId'],)).fetchone()
                if title != (project['worldId'], 'menu-scene', 'menu:title'):
                    problems.append('Archive is missing the native Title world binding.')
                if not connection.execute('SELECT 1 FROM world_files WHERE world_id=? LIMIT 1', (project['titleWorldId'],)).fetchone():
                    problems.append('Archive is missing Title world files.')
                if connection.execute('SELECT count(*) FROM installed_game_state').fetchone()[0]:
                    problems.append('Archive contains installed player data.')
                row = connection.execute('SELECT game_ui_config FROM world_templates WHERE template_id=?', (project['worldId'],)).fetchone()
                actual = json.loads(row[0] or '{}') if row else {}
                expected = json.loads((ROOT / 'world/Game/input.json').read_text())
                if any(actual.get(key) != value for key, value in expected.items()):
                    problems.append('Archive native UI policy differs from Game/input.json.')
            finally:
                connection.close()
    except (OSError, ValueError, sqlite3.Error) as error:
        problems.append('Cannot validate project archive: ' + str(error))


def audit(source_only=False):
    problems = []
    roots = ['world', 'assets', 'tools', 'tests', 'docs']
    files = [p for directory in roots for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    forbidden = re.compile(r'(?<![A-Za-z0-9])[mM]\d{1,2}(?![A-Za-z0-9])|\bE\d{2}\b|engine agent|handoff|checkpoint|legacy implementation|migration branch', re.I)
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        if path.suffix not in TEXT:
            continue
        source = path.read_text()
        if path.suffix == '.json':
            try:
                json.loads(source)
            except ValueError as error:
                problems.append(f'{relative}: {error}')
        if relative != 'tools/audit.py':
            for number, line in enumerate(source.splitlines(), 1):
                # Encoded model/image bytes are assets, not prose.
                if len(line) < 1000 and forbidden.search(line):
                    problems.append(f'{relative}:{number}: historical source label')
        if relative != 'tools/audit.py' and ('/Users/' in source or '../foxtrot' in source):
            problems.append(f'{relative}: workstation-specific path')
        if path.suffix == '.ts' and relative.startswith('world/Scripts/'):
            for name in re.findall(r"require\(['\"]([^'\"]+)['\"]\)", source):
                if not (ROOT / 'world/Scripts/lib' / (name + '.ts')).exists():
                    problems.append(f'{relative}: missing native library {name}')
        if path.suffix in {'.html', '.json', '.ts', '.js'}:
            for reference in re.findall(r'''["']((?:Menus|Game|Graphs|Dialogue|WFC|Art)/[A-Za-z0-9_./-]+\.(?:html|json|js|ink|png|webp|svg))["']''', source):
                if not (ROOT / 'world' / reference).exists():
                    problems.append(f'{relative}: missing world file {reference}')
    for name in ['artifacts', 'backups', 'fixtures']:
        if (ROOT / name).exists():
            problems.append('Unexpected source directory: ' + name)
    if subprocess.run(['git', 'ls-files', '--error-unmatch', 'AGENT_CHAT.md'], cwd=ROOT, capture_output=True).returncode == 0:
        problems.append('AGENT_CHAT.md must remain untracked')
    if subprocess.run(['git', 'check-ignore', '-q', 'AGENT_CHAT.md'], cwd=ROOT).returncode:
        problems.append('AGENT_CHAT.md is not ignored')
    menus = subprocess.run(['python3', str(ROOT / 'tools/menus.py'), '--check'], capture_output=True, text=True)
    if menus.returncode:
        problems.append(menus.stderr or menus.stdout)
    if not source_only:
        for name in ['README.md', 'world/Guide.md', 'world/Game/guide.json', 'world/Scripts/guide.ts', 'project/scorched-earth-2026.talus']:
            if not (ROOT / name).is_file():
                problems.append('Missing template entry: ' + name)
        definition = ROOT / 'world/Game/guide.json'
        if definition.exists() and json.loads(definition.read_text()).get('visibility') != 'editor':
            problems.append('The level guide must be editor-only')
        readme = (ROOT / 'README.md').read_text()
        if forbidden.search(readme):
            problems.append('README contains a historical source label')
        for path in [ROOT / 'README.md', *(ROOT / 'docs').glob('*.md')]:
            for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
                if ':' not in target and not (path.parent / target.split('#')[0]).exists():
                    problems.append(f'{path.name}: broken link {target}')
        audit_archive(problems)
    if problems:
        raise SystemExit('\n'.join(problems))
    print('Template audit passed:', len(files), 'maintained files.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-only', action='store_true', help='Audit source before creating the final guide and archive.')
    audit(parser.parse_args().source_only)
