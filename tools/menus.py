"""Embed the shared arcade theme in native, self-contained HTML menus."""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MENUS = ROOT / 'world/Menus'
MARKED = re.compile(r'<style data-game-theme>.*?</style>', re.S)


def build(check=False):
    theme = (MENUS / 'arcade.css').read_text().strip()
    changed = []
    for path in sorted(MENUS.glob('*.html')):
        source = path.read_text()
        if not MARKED.search(source):
            continue
        result = MARKED.sub(lambda _: '<style data-game-theme>\n' + theme + '\n</style>', source, count=1)
        if result != source:
            changed.append(path.name)
            if not check:
                path.write_text(result)
    if check and changed:
        raise SystemExit('Run python3 tools/menus.py: ' + ', '.join(changed))
    print('Shared theme is synchronized across native menus.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
