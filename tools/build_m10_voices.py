"""Curate distinct persona bags from new signature lines and the existing corpus.

All output is static authored content, not runtime text templates. The generic
faction shout-type contract must land before these are attached to native pools.
"""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
read = lambda p: json.loads((ROOT / p).read_text())
signatures = read('assets/m10-persona-lines.json')
general = read('world/Game/quips.json')
topics = {
    'lucky': 'luck lucky accident insurance warranty mechanic manual paperwork complaint regret mistake confident confidence wheel permit polite sorry hope optimistic button instruction instructor education explain wrong',
    'mole': 'dirt earth tunnel dig digging buried bury burial grave ground soil underground excavation shovel hill mountain foundation rock stone basement rubble union terrain',
    'kiloton': 'blast boom big large bigger giant thunder shell cannon artillery command officer soldier salute war battle missile bomb explosive explosion nuke nuclear radius crater glory fire army',
    'faultline': 'fall falling down gravity slope angle geometry coordinate coordinates position structure structural floor support ledge height elevation altitude physics downhill balance weight footing under collapse',
    'domino': 'science experiment experimental reaction chemical chemistry spark flame burn fire chaos consequence consequences chain theory hypothesis calculation equation variable sample research energy entropy probability logic plan forecast forecasted next sequence'
}
out = {'version': 1, 'status': 'authored; awaiting extensible native faction pools', 'personas': {p: {} for p in signatures}}
used = set()
for kind, source_kind in [('taunt', 'shooting'), ('death', 'death')]:
    for persona, pools in signatures.items():
        out['personas'][persona][kind] = list(pools[kind])
        for line in pools[kind]:
            assert line not in used, line
            used.add(line)
    candidates = []
    for index, line in enumerate(general[source_kind]):
        words = set(re.findall(r'[a-z]+', line['text'].lower()))
        for order, (persona, topic) in enumerate(topics.items()):
            score = len(words & set(topic.split()))
            candidates.append((-score, index, order, persona, line['text']))
    for _, _, _, persona, line in sorted(candidates):
        pool = out['personas'][persona][kind]
        if len(pool) < 100 and line not in used:
            pool.append(line)
            used.add(line)
    for persona in signatures:
        pool = out['personas'][persona][kind]
        assert len(pool) == 100, (persona, kind, len(pool))
        out['personas'][persona][kind] = [{'id': f'{persona}:{kind}:{n:03}', 'text': line} for n, line in enumerate(pool, 1)]
path = ROOT / 'world/Game/persona-voices.json'
path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
print('Authored 1,000 distinct persona lines: 200 new signature lines and 800 curated existing lines; no shared CPU lines.')
