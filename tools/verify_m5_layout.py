"""Verify compact deployment on fresh all-CPU games; leave a two-CPU ready game."""
import json
from bridge import ROOT, call
from audit_m2 import script
from m4_support import launch, state

out = ROOT / 'docs/evidence/m5-compact-layout.json'
assert not out.exists(), 'Preserve prior evidence; choose a fresh report path for a replay.'
baseline = script("return {preferences:talus.installed.get('indigo'),scores:talus.installed.get('indigo.scores')}")
report = {'baseline': baseline, 'runs': []}

def save():
    out.write_text(json.dumps(report, indent=2) + '\n')

try:
    for count in [16, 2]:
        print('Deploying', count, 'CPU tanks', flush=True)
        names = [f'M5 Layout {i + 1}' for i in range(count)]
        if count == 2:
            remembered = (baseline['preferences'] or {}).get('namesText', '').splitlines()
            if len(remembered) >= 2:
                names = remembered[:2]
        ready = launch('compact-' + str(count), count, 7, seconds=30, names=names, version=5)
        observed = script("""const m=talus.state.getJson('indigo.match'), samples=[];
          for(let n=0;n<120;n++){
            if(n%6===0)samples.push(m.roster.map(p=>{
              const e=talus.entities.get(p.entityId);return {id:e.id,live:e.isLive,residency:e.residency,snapshot:e.snapshot()};
            }));await talus.sleepTicks(1);
          }return samples;""")
        xs = [p['spawnX'] for p in ready['match']['roster']]
        checks = {
            'distinct starting positions': len(set(xs)) == count,
            'hulls fit proposed 1600px viewport': max(xs) - min(xs) + 40 <= 1600,
            'minimum tank separation': all(b - a > 40 for a, b in zip(xs, xs[1:])),
            'all roster actors live in every idle sample': all(p['live'] for sample in observed for p in sample),
            'all healthy': all(p['snapshot']['health'] == 100 for sample in observed for p in sample),
            'no script fault': not state()['error'],
        }
        report['runs'].append({'count': count, 'ready': ready, 'samples': observed,
                               'camera': call('engine_describe_context')['camera'], 'checks': checks})
        save()
        assert all(checks.values()), checks
        print('PASS', count, 'CPU deployment and idle residency', flush=True)
finally:
    report['restored'] = script("talus.installed.set('indigo'," + json.dumps(baseline['preferences']) + ");return {preferences:talus.installed.get('indigo'),scores:talus.installed.get('indigo.scores')}")
    save()
    assert report['restored'] == baseline, 'Remembered names/settings and scores must remain unchanged'
print('Evidence', out, flush=True)
