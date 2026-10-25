"""Package the authored dialogue; line order gives each quip its stable ID."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = {
    'version': 1,
    'provenance': {
        'description': '999 newly authored lines and one user-supplied literary quotation. No fortune database or proprietary game text was imported.',
        'quotedLine': {'id': 'shooting-001', 'source': 'User-supplied excerpt of Herman Melville, Moby-Dick (1851)'},
    },
}
seen = set()
for kind in ('shooting', 'death'):
    lines = (ROOT / 'assets/quips' / (kind + '.txt')).read_text().splitlines()
    assert len(lines) == 500, (kind, len(lines))
    for line in lines:
        key = ''.join(c.lower() for c in line if c.isalnum())
        assert line == line.strip() and 5 <= len(line) <= 90, line
        assert key not in seen, line
        seen.add(key)
    catalog[kind] = [{'id': f'{kind}-{i:03}', 'text': line} for i, line in enumerate(lines, 1)]
assert 0 < sum(row['text'].isupper() for kind in ('shooting', 'death') for row in catalog[kind]) < 100
(ROOT / 'world/Game/quips.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
print('Packaged 500 shooting lines and 500 death lines; all 1,000 unique.')
