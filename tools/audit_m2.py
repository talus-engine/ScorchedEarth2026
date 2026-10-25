"""M2 terrain and roster audit; moves the camera to inspect live inventories."""
import argparse
import hashlib
import json
import time
from bridge import ROOT, call


def script(source):
    result = call('engine_run_script', {'source': source, 'timeoutMs': 60000}, timeout=70)
    if result.get('error'):
        raise RuntimeError(result['error'])
    return result.get('value')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', required=True)
    args = parser.parse_args()
    output = ROOT / ('docs/evidence/m2-' + args.label + '.json')
    if output.exists():
        parser.error('Choose a new label to preserve the existing evidence')
    end = time.monotonic() + 180
    while time.monotonic() < end:
        value = script('return {match:talus.state.getJson("indigo.match"),error:talus.state.get("indigo.error")}')
        if value['error']:
            raise RuntimeError(value['error'])
        if value['match'] and value['match']['phase'] == 'ready':
            break
        time.sleep(1)
    else:
        raise TimeoutError('Match did not deploy')
    report = script('''const match=talus.state.getJson('indigo.match');
      return {worldId:talus.world.id,seed:talus.world.seed,params:talus.game.params,match,
        installed:talus.installed.get('indigo'),
        roster:match.roster.map(p=>{const e=talus.entities.get(p.entityId);return {snapshot:e.snapshot(),
          name:e.blackboard.get('name'),control:e.blackboard.get('custom.control'),
          index:e.blackboard.get('custom.indigoPlayer'),angle:e.blackboard.get('custom.angle'),
          power:e.blackboard.get('custom.power'),weapon:e.weapon.state}})}''')
    # Weapon state is intentionally live-only. Visit each durable roster entity
    # instead of treating the null weapon snapshot of a parked tank as a fault.
    for index, player in enumerate(report['match']['roster']):
        report['roster'][index]['liveInspection'] = script('''
          const e=talus.entities.get(%s);
          talus.camera.follow('off'); talus.camera.centerOn(e.position);
          const becameLive=await e.whenLive({timeoutTicks:600});
          await talus.sleepTicks(30);
          return {becameLive,snapshot:e.snapshot(),weapon:e.weapon.state};
        ''' % json.dumps(player['entityId']))
        print(f'Live inventory: {index+1}/{len(report["match"]["roster"])} tanks', flush=True)
    focus = report['match']['roster'][report['match']['focusIndex']]['entityId']
    script('const e=talus.entities.get(%s);talus.camera.centerOn(e.position);return await e.whenLive({timeoutTicks:600})' % json.dumps(focus))
    # Avoid the tank's central footprint: findSurface can see live body matter.
    report['profileSampleDx'] = [0, 64, 96, 160, 192, 255]
    report['profile'] = []
    for start in range(0, 50, 5):
        profile = script(f'''const out=[];
          for(let column={start};column<{start+5};column++){{
            const heights=[];
            for(const dx of [0,64,96,160,192,255])heights.push(await talus.world.findSurface(column*256+dx,512,256));
            out.push({{column,heights,sky:await talus.world.findSurface(column*256+128,0,512),
              floor:await talus.world.findSurface(column*256+128,1279,1)}});
          }}return out;''')
        report['profile'].extend(profile)
        output.write_text(json.dumps(report, indent=2) + '\n')
        print(f'Terrain profile: {start+5}/50 columns', flush=True)
    report['outside'] = script('return [await talus.world.findSurface(-1,0,1280),await talus.world.findSurface(12800,0,1280)]')
    report['scriptStatus'] = call('engine_script_status', {'script': 'match'})
    m = report['match']
    checks = {
        '50 by 5 tile bounds': m['bounds'] == {'x': 0, 'y': 0, 'w': 12800, 'h': 1280},
        'all 50 surface tiles generated': all(all(h is not None and 560 <= h <= 736 for h in p['heights']) for p in report['profile']),
        'all 49 surface seams join': all(abs(report['profile'][i]['heights'][-1] - report['profile'][i+1]['heights'][0]) <= 2 for i in range(49)),
        'sky rows are empty': all(p['sky'] is None for p in report['profile']),
        'bottom row is solid': all(p['floor'] == 1279 for p in report['profile']),
        'no horizontal wrapping': all(y is None for y in report['outside']),
        'terrain varies': len(set(h for p in report['profile'] for h in p['heights'])) >= 3,
        'requested human and computer roster': len(m['roster']) == m['humans'] + m['computers'] and sum(p['control']=='human' for p in m['roster'])==m['humans'],
        'unique durable tank identities': len({p['entityId'] for p in m['roster']}) == len(m['roster']),
        'tanks alive and standing on plateaus': all(r['snapshot']['alive'] and r['snapshot']['health']==100 and abs(r['snapshot']['x']-p['spawnX'])<2 and 12<=p['surfaceY']-r['snapshot']['y']<=16 for p,r in zip(m['roster'],report['roster'])),
        'blackboards retain names roles and aiming': all(r['name']==p['name'] and r['control']==p['control'] and r['index']==p['index'] and r['angle']==45 and r['power']==70 for p,r in zip(m['roster'],report['roster'])),
        'each tank restores with a cannon': all(r['liveInspection']['becameLive'] and r['liveInspection']['weapon'] is not None and len(r['liveInspection']['weapon']['items'])==1 and bool(r['liveInspection']['weapon']['equipped']) for r in report['roster']),
        'names remembered outside the save': report['installed']['namesText']=='\n'.join(p['name'] for p in m['roster']),
        'no script faults': not report['scriptStatus']['faulted'],
    }
    report['checks'] = [{'name': k, 'passed': v} for k,v in checks.items()]
    report['profileSha256'] = hashlib.sha256(json.dumps(report['profile'], separators=(',', ':')).encode()).hexdigest()
    report['accepted'] = all(checks.values())
    output.write_text(json.dumps(report, indent=2) + '\n')
    for name, ok in checks.items():
        print(('PASS ' if ok else 'FAIL ') + name, flush=True)
    if not report['accepted']:
        raise AssertionError('M2 acceptance failed; see ' + str(output))


if __name__ == '__main__':
    main()
