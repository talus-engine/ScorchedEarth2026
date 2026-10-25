"""Bounded physical sweep in an already-faulted, owned diagnostic world only."""
import argparse
import json
from pathlib import Path
from bridge import script


def main(root):
    ledger = json.loads((root / 'run.json').read_text())
    assert not ledger['restored']
    source = r'''
const m=talus.state.getJson('indigo.match');
if(!m || m.phase!=='fault' || m.roster.some(p=>p.control!=='cpu' || !p.name.startsWith(PREFIX)) || !WORLDS.includes(talus.world.id))throw new Error('Unowned/non-idle diagnostic');
if(!talus.game.saveStatus.allowed)throw new Error('Wait for existing native work');
const catalog=m.procedural.catalog;
const ids=(await talus.world.resources.catalogs()).find(c=>c.id===catalog).manifest.entries.filter(e=>e.kind==='growth').map(e=>e.id);
const rows=[];
for(let n=0;n<ids.length;n++){
 const id=ids[n],p=await talus.world.resources.read(catalog,'growth',id);
 const x=400+n*512,ground=await talus.world.findSurface(x,256,768);
 if(ground===null)throw new Error('Missing test ground');
 const scaled=p.stroke.sizeMode==='scatter'||p.stroke.sizeMode==='attribute'&&p.stroke.sizeAttribute==='tubesPerStep';
 const max=scaled?(64-p.sheet.startTubes)*p.stroke.sizeReference/Math.max(p.sheet.tubesPerStep,1/p.stroke.sizeReference):128;
 const radius=Math.min(64,Math.floor(max));
 const rate=scaled?Math.max(p.sheet.tubesPerStep,1/p.stroke.sizeReference)*radius/p.stroke.sizeReference:p.sheet.tubesPerStep;
 const points=Math.min(16,Math.max(1,Math.ceil((1-p.sheet.startTubes)/Math.max(.01,rate))));
 const path=Array.from({length:points},(_,i)=>({x:x-(points-1)+i*2,y:ground-1}));
 const spec={kind:'growth',catalog,shape:{x:x-256,y:ground-480,w:512,h:512},bounds:{x:0,y:0,w:12800,h:1024},replacement:'empty',targetLayer:'world',layerPolicy:'authored',
 seed:2541102+n,budget:{cells:262144,particles:262144,pixels:524288,work:786432},growth:{presetId:id,origin:{x,y:ground},path,radius,steps:4096,jobs:64,fragments:262144,
 ...(p.sheet.timeClip?{liveSeconds:Math.min(60,p.sheet.endTime+1/60)}:p.sheet.flowSpeed>0?{liveSeconds:2}:{})}};
 const receipt=await talus.world.terrainWork(spec);rows.push({id,spec,receipt});
}
return rows;
'''.replace('PREFIX', json.dumps(ledger['prefix'])).replace('WORLDS', json.dumps(ledger['observedWorlds']))
    result = script(source, 120)
    (root / 'growth-sweep.json').write_text(json.dumps(result, indent=2) + '\n')
    if result.get('error'):
        raise RuntimeError(result['error'])
    for row in result['value']:
        receipt = row['receipt']
        print(row['id'], receipt['status'], receipt.get('accepted'), receipt.get('reason'))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run-dir', type=Path, required=True)
    main(p.parse_args().run_dir)
