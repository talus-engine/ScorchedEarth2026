"""Check actual generated mixed terrain and all 50 bottom-row tiles."""
from m4_support import *
import argparse
p=argparse.ArgumentParser();p.add_argument('--label',default='mixed-terrain-seed1');p.add_argument('--current',action='store_true');a=p.parse_args()
label=a.label
assert not (ROOT/('docs/evidence/m4-'+label+'.json')).exists()
r={'initial':state() if a.current else launch(label,3,1),'samples':[]}
for start in range(0,50,2):
    center=(start+1)*256
    script(f'talus.camera.follow("off");talus.camera.centerOn({{x:{center},y:1152}});await talus.sleepTicks(30);return true')
    points=[{'x':col*256+dx,'y':y}for col in range(start,start+2)for dx in (1,128,254)for y in (1024,1152,1279)]
    points += [{'x':col*256+dx,'y':y}for col in range(start,start+2)for dx in (32,96,160,224)for y in (800,864,928,992)]
    sample=call('engine_sample_points',{'points':points})
    r['samples'].extend(sample['samples']);evidence(label,r)
    print('Terrain',start+2,'/ 50',flush=True)
bottom=[p for p in r['samples']if p['y']>=1024]
interior=[p for p in r['samples']if p['y']<1024]
r['checks']={'every bottom tile sampled':len(bottom)==450,
 'bottom samples all resident stone':all(p['resident'] and p['name']=='STONE'for p in bottom),
 'interior contains dirt sand and stone':{'DIRT','SAND','STONE'}<={p['name']for p in interior if p['resident']}}
r['accepted']=all(r['checks'].values());evidence(label,r)
script('const m=talus.state.getJson("indigo.match");talus.camera.centerOn(talus.entities.get(m.roster[m.focusIndex].entityId).position);return true')
for k,v in r['checks'].items():print(('PASS 'if v else'FAIL ')+k,flush=True)
assert r['accepted']
