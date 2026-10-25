import sys,json,pathlib,time,base64
sys.path.insert(0,'/Users/tonygermaneri/gh/indigo/tools')
from bridge import call
from audit_m2 import script
r=pathlib.Path('/private/tmp/indigo-m9-collapse');out=r/'cpu-terrain-2530.json';assert not out.exists();report={'samples':[]};last=None;audited=False;captured=set();deadline=time.monotonic()+1200
read="""const m=talus.state.getJson('indigo.match');return {world:talus.world.id,clock:talus.sim.clock,match:m,paused:talus.sim.paused,checkpoint:talus.state.get('m9.terrainCheckpoint'),payloads:talus.state.getJson('m9.terrainPhysicalPayloads'),audit:talus.state.getJson('m9.terrainAudit'),error:talus.state.get('indigo.error'),bank:talus.installed.get('indigo.economy'),status:talus.game.saveStatus};"""
def write():out.write_text(json.dumps(report,indent=2)+'\n')
while time.monotonic()<deadline:
 s=script(read);report['latest']=s;m=s['match'];report['samples'].append({'clock':s['clock'],'phase':m['phase'],'turn':m['turnNumber'],'message':m['message'],'error':s['error']});report['samples']=report['samples'][-600:];write()
 key=(m['phase'],m['turnNumber'])
 if key!=last:print(key,m['message'],s['error'],flush=True);last=key
 if s['error'] or m['phase']=='fault':raise Exception('Diagnostic fault: '+str(s['error']))
 for payload in s['payloads'] or []:
  weapon=payload['weapon']
  if weapon in captured:continue
  captured.add(weapon)
  im=call('engine_screenshot',{'format':'png','maxWidth':1600});(r/('cpu-'+weapon+'-2530.png')).write_bytes(base64.b64decode(im['mcpImage']['data']))
  print('Captured physical effect',weapon,payload['receipt'],flush=True)
 if s['checkpoint'] and not audited:
  assert s['paused'] and s['status']['allowed'];report['checkpoint']=s;write()
  report['foundation']=script("""const view=talus.camera.view,counts=[];let stone=0;for(let cy=16;cy<20;cy++)for(let cx=90;cx<110;cx++){let n=0;for(let y=cy*64;y<(cy+1)*64;y++)for(let x=cx*64;x<(cx+1)*64;x++)if(talus.world.cell(x,y)?.element?.name==='STONE')n++;stone+=n;counts.push({cx,cy,stone:n})}return {stone,counts,view};""");write()
  im=call('engine_screenshot',{'format':'png','maxWidth':1600});(r/'cpu-checkpoint-2530.png').write_bytes(base64.b64decode(im['mcpImage']['data']))
  report['foundationGpu']=call('engine_test_helper',{'method':'pmapTypeCensusGpu','args':[{'x':5760,'y':1024,'w':1280,'h':256},0,0]})['result'];write()
  assert report['foundationGpu']['counts']=={'9':327680},report['foundationGpu']
  audited=True;print('All 327680 foundation cells remain STONE after twelve terrain payloads',flush=True)
  script('talus.sim.resume();return true')
 if m['phase']=='finished':break
 time.sleep(2)
else:raise Exception('Bounded 20-minute combat deadline; inspect retained save')
p=report['checkpoint']['payloads'];a=s['audit'];weapons=['riot-charge','riot-blast','dirt-charge','earth-disrupter'];purchases=json.loads((r/'cpu-ui-purchases-2530.json').read_text())
checks={
 'freshFourCPU':s['match']['humans']==0 and s['match']['computers']==4,
 'actualPaidPurchases':len(purchases)==4 and {v['weapon']for v in purchases}==set(weapons),
 'paidStockConsumedExactly':all(s['bank']['players'][v['after']['account']]['stock'].get(v['weapon'],0)==0 for v in purchases),
 'threeNativePayloadsPerBundle':all(sum(e['weapon']==w and e['receipt']['status']=='completed' for e in p)==3 for w in weapons),
 'actualRiotSmoke':all(any(e['weapon']==w and e['receipt']['removed']>0 and e['receipt']['removed']==e['receipt']['added'] and e['materials'].get('SMOKE',0)>0 for e in p) for w in ['riot-charge','riot-blast']),
 'actualDirtReadback':all(e['materials'].get('DIRT',0)+e['materials'].get('MUD',0)>0 for e in p if e['weapon']=='dirt-charge'),
 'actualFracturedBodies':all(sum(b['cells'] for b in e['bodies'] if b)==e['receipt'].get('fractured',0) and e['receipt'].get('fractured',0)>0 for e in p if e['weapon']=='earth-disrupter'),
 'allStructuralMaterialRetained':all(e['receipt']['accepted']==e['receipt'].get('fractured',0)+e['receipt'].get('pulverized',0) and e['receipt']['removed']==0 and e['receipt']['added']==0 for e in p if e['weapon']=='earth-disrupter'),
 'foundationIntact':report['foundationGpu']['counts']=={'9':327680},
 'survivorsContinuouslyLiveAt25Percent':a['violations']==0,
 'allProjectilesEndOnce':a['ends']==a['launches'] and a['duplicateEnds']==0,
 'matchFinishedAndSaveSafe':m['phase']=='finished' and s['status']['allowed'],
}
report['checks']=checks;write();print(json.dumps(checks),flush=True);assert all(checks.values())
