"""Bounded read-only generation observer, attached to a fresh acceptance ledger."""
import argparse
import json
import time
from pathlib import Path
from accept_m10_series import read_state, write


def observe(root, seconds):
    ledger = json.loads((root / 'run.json').read_text())
    assert not ledger['restored'], 'Capture a fresh baseline first'
    end = time.monotonic() + seconds
    previous = None
    seen_world = False
    while time.monotonic() < end:
        try:
            state = read_state()
        except RuntimeError as error:
            booting = 'engine tools not ready (page still booting)' in str(error)
            initial_navigation = not seen_world and 'page connection lost mid-call' in str(error)
            if not booting and not initial_navigation:
                raise
            time.sleep(2)
            continue
        match = state.get('match')
        if match:
            seen_world = True
            assert all(p['control'] == 'cpu' and p['name'].casefold().startswith(ledger['prefix'].casefold())
                       for p in match['roster']), 'Refusing an unrelated match'
            if state['world'] not in ledger['observedWorlds']:
                ledger['observedWorlds'].append(state['world'])
                write(root / 'run.json', ledger)
            write(root / 'generation-state.json', state)
            status = {'world': state['world'], 'phase': match['phase'], 'message': match['message'],
                      'completed': (match.get('procedural') or {}).get('completed'), 'error': state.get('error')}
            if status != previous:
                print(json.dumps(status), flush=True)
                previous = status
            if match['phase'] in ('ready', 'fault'):
                write(root / 'generation-summary.json', status)
                return 0 if match['phase'] == 'ready' else 1
        time.sleep(5)
    raise TimeoutError('Generation observation deadline; world left unchanged')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--seconds', type=int, default=600)
    args = parser.parse_args()
    assert 1 <= args.seconds <= 1200
    raise SystemExit(observe(args.run_dir, args.seconds))
