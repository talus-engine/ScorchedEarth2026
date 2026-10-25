"""Restore only this execution's captured baseline, refusing changed real accounts."""
import json,time
from bridge import ROOT,WORLD_ID,call
D=ROOT/'docs/evidence/m10-completion'
baseline=dict(json.loads((D/'installed-baseline-raw.json').read_text()))
context=call('engine_describe_context')['world']
assert context.get('isEditorMode') and context.get('templateId')==WORLD_ID,context
sql="SELECT key,value_json FROM installed_game_state WHERE game_id='"+WORLD_ID+"' AND key IN ('indigo','indigo.scores','indigo.economy','indigo.dialogue')"
current=dict(call('run_sql_readonly',{'sql':sql})['results'][0]['rows'])
for key in ['indigo.economy','indigo.scores']:
 old=json.loads(baseline[key]);now=json.loads(current[key])
 for name,player in old.get('players',{}).items():
  assert now.get('players',{}).get(name)==player, 'Original account changed; refusing restore: '+name
 for name in set(now.get('players',{}))-set(old.get('players',{})):
  assert name.startswith('m10c '),'Unexpected non-diagnostic account; refusing restore: '+name
# Confirm the script API is scoped to this same installed game before writing.
source='const same=(a,b)=>a===b || (a!==null&&b!==null&&typeof a==="object"&&typeof b==="object"&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));return '+json.dumps(list(current.items()))+'.map(([k,raw])=>({key:k,equal:same(talus.installed.get(k),JSON.parse(raw))}))'
checks=call('engine_run_script',{'source':source,'timeoutMs':5000})['value']
assert all(row['equal'] for row in checks), checks
(D/'diagnostic-accounts-before-restore.json').write_text(json.dumps(current,indent=2)+'\n')
source='for(const [key,raw] of '+json.dumps(list(baseline.items()))+')talus.installed.set(key,JSON.parse(raw));return true'
call('engine_run_script',{'source':source,'timeoutMs':5000})
for _ in range(30):
 restored=dict(call('run_sql_readonly',{'sql':sql})['results'][0]['rows'])
 if restored==baseline:break
 time.sleep(.2)
else:raise AssertionError('Exact raw baseline restoration did not flush')
(D/'restoration.json').write_text(json.dumps({'keys':list(baseline),'exactRawEquality':True,'originalAccountsUnchanged':True},indent=2)+'\n')
print('Restored all four exact raw baselines; original player accounts unchanged.')
