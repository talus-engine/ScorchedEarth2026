"""Place one diagnostic CPU on existing distant terrain before Begin.

This is controlled fixture authoring, not natural deployment evidence. It does
not change terrain, grant stock, start combat, or drive the camera. A fresh
accept_m10_series ledger and an exclusive native lease are prerequisites.
"""
import argparse
import json
from pathlib import Path

from accept_m10_series import read_state, write
from bridge import call


def setup(root):
    ledger = json.loads((root / 'run.json').read_text())
    assert not ledger['restored'] and ledger['prefix'], 'A fresh open diagnostic ledger is required'
    assert not (root / 'fixture-placement.json').exists(), 'Do not move an already-authored fixture again'
    before = read_state()
    m = before['match']
    assert m and m['phase'] == 'ready' and m['turnNumber'] == 0
    assert len(m['roster']) == 2 and all(
        p['control'] == 'cpu' and p['name'].casefold().startswith(ledger['prefix'].casefold())
        and not p['eliminated'] and not p.get('shots') for p in m['roster'])
    assert all(p['live'] and p['health'] == 100 for p in before['live']), 'Inspect unsettled/unhealthy deployment first'
    if before['world'] not in ledger['observedWorlds']:
        ledger['observedWorlds'].append(before['world'])
        write(root / 'run.json', ledger)
    write(root / 'fixture-before.json', before)
    ids = [p['entityId'] for p in m['roster']]
    source = """const expected = EXPECTED;
const m = talus.state.getJson('indigo.match');
if (talus.world.id !== expected.world || !m || m.phase !== 'ready' || m.turnNumber !== 0
    || m.roster.length !== 2 || m.roster.some((p,i) => p.entityId !== expected.ids[i]
      || p.control !== 'cpu' || p.eliminated || p.shots)) throw Error('Diagnostic fixture state changed');
const shooter = talus.entities.get(expected.ids[0]), target = talus.entities.get(expected.ids[1]);
const a = shooter?.snapshot(), b = target?.snapshot();
if (!a?.alive || !b?.alive || a.health !== 100 || b.health !== 100) throw Error('Fixture hull changed');
const surveyed = []; let placement = null;
// findSurface explicitly reads saved/template/WFC terrain outside the active
// ring. Inspect a complete track-width strip; no generation or erasure calls.
for (const dx of [0,64,128,192,256]) {
  const x = Math.round(a.x + 2560 + dx);
  if (x-24 < m.bounds.x || x+24 >= m.bounds.x+m.bounds.w) continue;
  const ys = [];
  for (const offset of [-20,-12,0,12,20]) ys.push(await talus.world.findSurface(x+offset,512,512));
  surveyed.push({x,ys});
  if (ys.some(y => y === null)) continue;
  const low = Math.min(...ys), high = Math.max(...ys);
  if (high-low > 8 || low < 512 || high > 960) continue;
  placement = {x,y:low-48,surfaceMin:low,surfaceMax:high}; break;
}
if (!placement) throw Error('No sufficiently level existing ground in the bounded distant survey');
const current = talus.state.getJson('indigo.match');
if (current.phase !== 'ready' || current.turnNumber !== 0 || current.roster.some(p=>p.eliminated))
  throw Error('Match changed during survey; no placement performed');
target.teleport({x:placement.x,y:placement.y});
return {kind:'controlled-pre-Begin-placement',world:talus.world.id,clock:talus.sim.clock,
  surveyed,placement,separation:placement.x-a.x,before:{shooter:a,target:b},
  after:{shooter:shooter.snapshot(),target:target.snapshot()},camera:talus.camera.view,
  note:'Only the diagnostic target was placed, 48px above surveyed terrain, to settle naturally when resident. Native teleport zeros its velocity. No terrain, health, ammunition, reward or camera override.'};
""".replace('EXPECTED', json.dumps({'world': before['world'], 'ids': ids}))
    result = call('engine_run_script', {'source': source, 'timeoutMs': 60000}, 65)
    write(root / 'fixture-placement.json', result)
    assert result.get('ok'), result.get('error')
    print(json.dumps(result['value']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    args = parser.parse_args()
    setup(args.run_dir)
