import sys,json,time,base64,concurrent.futures
from pathlib import Path
sys.path.insert(0,'/Users/tonygermaneri/gh/indigo/tools')
from bridge import call
from audit_m2 import script
from m4_support import state,wait_state
root=Path('/private/tmp/indigo-m8-engine');path=root/'cpu8-roundtrip.json'
report=json.loads(path.read_text()) if path.exists() else {}
def persist():path.write_text(json.dumps(report,indent=2)+'\n')
def bank():return script("return {economy:talus.installed.get('indigo.economy'),scores:talus.installed.get('indigo.scores'),dialogue:talus.installed.get('indigo.dialogue'),world:talus.world.id,view:talus.camera.view,match:talus.state.getJson('indigo.match')}")
def foundation(label):
 rect={'x':5376,'y':1024,'w':2560,'h':256};tag='m8:audit-release-'+label
 source='talus.sim.resume();const a=talus.sim.anchor({label:"M8 bounded foundation audit",rect:'+json.dumps(rect)+'});try{if(!await a.whenLoaded({timeoutTicks:1800}))throw new Error("audit load");talus.sim.pause();talus.state.set("m8.audit.ready",'+json.dumps(label)+');await new Promise(r=>talus.on('+json.dumps(tag)+',()=>r()));return a.status}finally{a.release();talus.state.set("m8.audit.ready","")}'
 with concurrent.futures.ThreadPoolExecutor()as pool:
  f=pool.submit(call,'engine_run_script',{'source':source,'timeoutMs':120000},130)
  try:
   for _ in range(200):
    if f.done():raise RuntimeError(str(f.result()))
    if script("return talus.state.get('m8.audit.ready')")==label:break
    time.sleep(.3)
   else:raise TimeoutError('audit ready')
   v=call('engine_test_helper',{'method':'pmapTypeCensusGpu','args':[rect,0]})
   report[label]={'rect':rect,'census':v};persist();print(label,json.dumps(v),flush=True)
  finally:script('talus.emit('+json.dumps(tag)+',{});return true')
  report[label]['anchor']=f.result();persist()
if 'before' not in report:
 report['before']=bank();assert report['before']['match']['phase']=='finished';persist()
 foundation('foundationBefore')
 call('engine_mouse',{'action':'click','x':780,'y':30});report['save']=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':2200});assert report['save']['focused'];persist()
 marker=str(time.monotonic());script('talus.ui.set("__m8Nav",'+json.dumps(marker)+');return true');call('engine_continue_game',{'worldId':report['before']['world']});time.sleep(1)
else:marker='resume-after-navigation'
wait_state(lambda s:s['worldId']==report['before']['world'] and s.get('match') and s['match']['phase']=='finished' and s['ui'].get('shop') and s['ui'].get('__m8Nav')!=marker,120)
report['reopened']=bank();persist();assert report['before']['economy']==report['reopened']['economy'],'Payout or purchase duplicated';assert report['before']['scores']==report['reopened']['scores'],'Scores duplicated'
foundation('foundationAfter')
# Type the next seed before the purchase so the navigation follows it immediately.
call('engine_mouse',{'action':'click','x':823,'y':872});call('engine_key',{'key':'a','modifiers':['meta']});call('engine_type',{'text':'123'})
report['purchaseBefore']=bank();persist();script('talus.sim.resume();return true')
start=time.monotonic();report['buy']=call('engine_mouse',{'action':'click','x':1263,'y':378,'settleMs':0});report['navigate']=call('engine_mouse',{'action':'click','x':1244,'y':872,'settleMs':0});report['navigationSeconds']=time.monotonic()-start;persist()
s=wait_state(lambda s:s['worldId']!=report['before']['world'] and s.get('match') and s['match']['phase'] in ['ready','fault'] and s['ui'].get('shop'),180)
report['next']=bank();report['state']=s;persist();assert not s['error'],s['error'];assert s['match']['seed']==123 and s['match']['round']==2
assert [p['name']for p in s['match']['roster']]==[p['name']for p in report['before']['match']['roster']]
a=report['purchaseBefore']['economy']['players']['m8 jet c'];b=report['next']['economy']['players']['m8 jet c']
assert b['cash']==a['cash']-240 and b['stock']['heavy']==a['stock'].get('heavy',0)+3,(a,b)
assert report['next']['economy']['rounds']==report['before']['economy']['rounds'];assert report['next']['scores']==report['before']['scores'];assert all(e['health']==100 for e in s['roster'])
report['passed']=True;persist();screen=call('engine_screenshot',{'format':'jpeg','maxWidth':1600});(root/'cpu8-next-round.jpg').write_bytes(base64.b64decode(screen['mcpImage']['data']));print('PASS finished reload, immediate purchase/navigation, seed, stock, names, scores',flush=True)
