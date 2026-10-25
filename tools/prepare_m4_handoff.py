"""Remove only identified M4 diagnostic scores and leave a named CPU-only ready save."""
import base64
import argparse
from m4_support import *

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--label',default='ready-handoff')
a=p.parse_args()
assert not (ROOT/('docs/evidence/m4-'+a.label+'.json')).exists()
diagnostic_worlds=set()
def collect(value):
    if isinstance(value,dict):
        m=value.get('match')
        if value.get('worldId') and isinstance(m,dict) and m.get('roster') and all(p['name'].startswith('M4 Test ') for p in m['roster']):
            diagnostic_worlds.add(value['worldId'])
        for child in value.values():collect(child)
    elif isinstance(value,list):
        for child in value:collect(child)
for path in (ROOT/'docs/evidence').glob('m4-*.json'):
    collect(json.loads(path.read_text()))
before=script("return {scores:talus.installed.get('indigo.scores'),preferences:talus.installed.get('indigo')}")
scores=json.loads(json.dumps(before['scores'] or {'players':{},'matches':{}}))
removed_players={key:value for key,value in scores['players'].items() if value['name'].startswith('M4 Test ')}
removed_matches={key:value for key,value in scores['matches'].items() if key in diagnostic_worlds}
for key in removed_players:del scores['players'][key]
for key in removed_matches:del scores['matches'][key]
preferences=json.loads((ROOT/'docs/evidence/m3-ready-to-play.json').read_text())['value']['preferences']
preferences={**preferences,'humans':0,'computers':2}
report={'before':before,'removedPlayers':removed_players,'removedMatches':removed_matches,'retainedScores':scores,'preferences':preferences}
evidence(a.label+'-cleanup',report)
script('talus.installed.set("indigo.scores",'+json.dumps(scores)+');return true')
names=preferences['namesText'].splitlines()[:2]
assert len(names)==2
ready=launch('ready',2,7,seconds=preferences['turnSeconds'],names=names)
script('talus.installed.set("indigo",'+json.dumps(preferences)+');return true')
save_world()
final=state()
assert final['match']['phase']=='ready' and final['match']['humans']==0
assert final['scores']==scores
report={'state':final,'preferences':script("return talus.installed.get('indigo')")}
report['weapon']=script("const m=talus.state.getJson('indigo.match');return talus.entities.get(m.roster[m.focusIndex].entityId).weapon.state")
assert report['weapon']['pinned'] and abs(report['weapon']['power']-.7)<1e-6
evidence(a.label,report)
screen=call('engine_screenshot',{'format':'jpeg','maxWidth':1200})
(ROOT/('docs/evidence/m4-'+a.label+'.jpg')).write_bytes(base64.b64decode(screen['mcpImage']['data']))
print(json.dumps({'worldId':final['worldId'],'roster':[p['name'] for p in final['match']['roster']],'phase':final['match']['phase'],'removedDiagnosticPlayers':len(removed_players),'removedDiagnosticMatches':len(removed_matches)}),flush=True)
