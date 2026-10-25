"""Shared local HTTP helpers for CPU-only M4 acceptance; no runtime game changes."""
import json
import time
from bridge import ROOT, WORLD_ID, call
from audit_m2 import script

def state():
    return script("const m=talus.state.getJson('indigo.match');return {worldId:talus.world.id,match:m,error:talus.state.get('indigo.error'),events:talus.state.getJson('indigo.events'),ui:talus.ui.get(),paused:talus.sim.paused,clock:talus.sim.clock,roster:m?.roster.map(p=>p.entityId?talus.entities.get(p.entityId).snapshot():null),scores:talus.installed.get('indigo.scores')}")

def wait_state(predicate, seconds=90):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        try:
            s=state()
            if predicate(s):return s
        except RuntimeError as e:
            if not any(t in str(e)for t in ('HTTP 502','HTTP 503','page still booting','NO_ENGINE','no app page open','engine not booted')):raise
        time.sleep(.3)
    raise TimeoutError('M4 wait: '+json.dumps(state())[:1500])

def launch(label,count,seed,seconds=20,names=None,version=4):
    previous=call('engine_describe_context')['world']['worldId']
    result=call('engine_new_game',{'template':WORLD_ID,'name':f'Indigo M{version} '+label,'seed':seed})
    # Navigation is asynchronous. Wait for the new setup world, then its script menu.
    setup=wait_state(lambda s:s['worldId']!=previous and s['match'] is None and 'installed' in s['ui'])
    wid=setup['worldId']
    screen=call('engine_screenshot',{'format':'jpeg','maxWidth':800})
    w,h=screen['window']['width'],screen['window']['height']
    assert (w,h)in ((1920,1018),(1600,968)),'Inspect changed UI geometry'
    dx,dy=(w-1920)/2,(h-1018)/2
    # Keep the identifying suffix within the game's 32-character name limit.
    name_prefix=('M4 Test '+label)[:28]
    names='\n'.join(name_prefix+' '+str(i+1)for i in range(count)) if names is None else '\n'.join(names)
    for x,y,value in [(1045,400,0),(1265,400,count),(1045,500,seconds),(1265,500,seed),(1150,620,names)]:
        call('engine_mouse',{'action':'click','x':round(x+dx),'y':round(y+dy)})
        call('engine_key',{'key':'a','modifiers':['meta']})
        call('engine_type',{'text':str(value)})
    call('engine_mouse',{'action':'click','x':round(1285+dx),'y':round(790+dy)})
    s=wait_state(lambda s:s['worldId']!=wid and (s['ui'].get('error') or (s['match'] is not None and (
        s['match']['phase']=='fault' or (s['match']['phase']=='ready' and s['ui'].get('ready')
        and any(e['kind']=='match-ready' for e in s['events'] or [])
        and all(r is not None and r['health'] is not None for r in s['roster']))))),120)
    assert not s['ui'].get('error'),s['ui'].get('error')
    assert not s['error'],s['error']
    assert s['match']['version']==version and s['match']['humans']==0 and s['match']['computers']==count
    assert all(r['health']==100 for r in s['roster'])
    return s

def begin():
    window=call('engine_screenshot',{'format':'jpeg','maxWidth':400})['window']
    call('engine_mouse',{'action':'click','x':window['width']-200,'y':window['height']-44})
def save_world():call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800})
def evidence(label,report):
    path=ROOT/('docs/evidence/m4-'+label+'.json');path.write_text(json.dumps(report,indent=2)+'\n')
