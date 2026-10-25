import sys,time,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,'/Users/tonygermaneri/gh/indigo/tools');from bridge import call
from audit_m2 import script
root=Path('/private/tmp/indigo-m8-engine');out=root/'remote-impact8.json';assert not out.exists()
with concurrent.futures.ThreadPoolExecutor()as pool:
 f=pool.submit(call,'engine_run_script',{'source':(root/'remote-impact8.js').read_text(),'timeoutMs':120000},130)
 try:
  for _ in range(300):
   if f.done():raise RuntimeError(str(f.result()))
   if script("return talus.state.get('m8.remote-impact8.ready')"):break
   time.sleep(.25)
  else:raise TimeoutError('impact readback')
  r=script("return talus.state.getJson('m8.remote-impact8')")
  r['gpu']=call('engine_test_helper',{'method':'pmapTypeCensusGpu','args':[r['region'],3]});out.write_text(json.dumps(r,indent=2)+'\n')
  sand=script("return talus.elements.get('SAND').id");stone=script("return talus.elements.get('STONE').id")
  assert r['gpu']['result']['counts'][str(sand)]==r['sand']['added'];assert r['gpu']['result']['counts'][str(stone)]==512
  assert r['camera']['center']==r['cameraAfter']['center'] if 'center'in r['camera']else r['camera']==r['cameraAfter']
  r['passed']=True;out.write_text(json.dumps(r,indent=2)+'\n');print('PASS real remote shell impact + native noise bank',r['gpu']['result']['counts'],flush=True)
 finally:script("talus.emit('m8:remote-impact8-release',{});return true")
 print('operation',f.result().get('ok'),flush=True)
