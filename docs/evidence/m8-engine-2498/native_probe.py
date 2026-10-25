import sys,json,time
from pathlib import Path
sys.path.insert(0,'/Users/tonygermaneri/gh/indigo/tools')
from bridge import call,WORLD_ID
ROOT=Path('/private/tmp/indigo-m8-engine')
def run(source):
 r=call('engine_run_script',{'source':source,'timeoutMs':120000},timeout=130)
 if r.get('error'):raise RuntimeError(r['error'])
 return r.get('value')
def save(label,value):
 (ROOT/(label+'.json')).write_text(json.dumps(value,indent=2)+'\n')
 print(label,json.dumps(value)[:3000],flush=True)
def wait(test,secs=120):
 deadline=time.monotonic()+secs
 while time.monotonic()<deadline:
  try:
   result=test()
   if result:return result
  except RuntimeError as e:
   if not any(x in str(e) for x in ['NO_ENGINE','not booted','HTTP 502','HTTP 503','booting']):raise
  time.sleep(.5)
 raise TimeoutError('readiness')
a=sys.argv[1]
if a=='prepare':
 call('engine_set_mode',{'mode':'editor','template':WORLD_ID})
 wait(lambda:run('return talus.editor.available && talus.world.id === '+json.dumps(WORLD_ID)))
 source={'basedOn':'indigo/m5-shell','name':'indigo/m8-native-fuse-probe','patch':{'itemData':{'modSpec':{'projectile':{'detonate':{'fuse':4}}}}},'allowNewKeys':True}
 save('fuse-dryrun',call('save_entity_template',{**source,'dryRun':True}))
 save('fuse-dryrun-read',call('run_sql_readonly',{'sql':"SELECT template_id FROM entity_templates WHERE template_name='indigo/m8-native-fuse-probe'"}))
 save('fuse-save',call('save_entity_template',source))
 save('fuse-readback',call('run_sql_readonly',{'sql':"SELECT template_id,joint_data FROM entity_templates WHERE template_name='indigo/m8-native-fuse-probe'"}))
 t=call('save_entity_template',{'basedOn':'indigo/m8-tank','name':'indigo/m8-native-controller-probe',
  'patch':{'characterController':{'levitationEnabled':True,'levitationStartEmpty':True,'levitationTime':12000,'levitationRecoveryRate':0,'levitationAccel':500,'levitationMaxSpeed':120},'stats':{'levitation:max':12}},'allowNewKeys':True})
 save('probe-template',t)
 save('editor-save',run('await talus.editor.save();return true'))
 call('engine_new_game',{'template':WORLD_ID,'name':'Indigo M8 native engine diagnostics','seed':1729})
 wait(lambda:run("return !talus.editor.available && talus.ui.get().installed && talus.world.id"))
 save('probe-world',run("talus.ui.closeMenu();talus.camera.setZoom(.25);talus.camera.follow('off');talus.camera.centerOn(6200,400);return {worldId:talus.world.id,view:talus.camera.view}"))
elif a=='controller':
 template=json.loads((ROOT/'probe-template.json').read_text())['templateId']
 source=(ROOT/'controller-probe.js').read_text().replace('TEMPLATE_ID',json.dumps(template))
 save('controller-native',run(source))
elif a=='script':
 path=Path(sys.argv[2]);save(path.stem,run(path.read_text()))
