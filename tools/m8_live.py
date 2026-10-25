"""CPU-only M8 diagnostics against the running Talus app; no cloned profile."""
import base64
import json
import sys
from bridge import ROOT, call
from audit_m2 import script
from m4_support import launch, wait_state, state
from m6_support import navigate_game

def capture(label):
    s = state()
    s['economy'] = script("return talus.installed.get('indigo.economy')")
    s['weapons'] = script("return talus.state.getJson('indigo.match')?.roster.map(p=>({name:p.name,weapon:talus.entities.get(p.entityId)?.weapon.state}))")
    s['camera'] = script('return talus.camera.view')
    s['explosions'] = script("return talus.state.getJson('m8.explosions')")
    s['frames'] = script("return talus.state.getJson('m8.frames')")
    (ROOT/f'docs/evidence/m8-{label}.json').write_text(json.dumps(s,indent=2)+'\n')
    return s

def screen(label):
    r = call('engine_screenshot',{'format':'jpeg','maxWidth':1200})
    path = ROOT/f'artifacts/m8-{label}.jpg'
    path.write_bytes(base64.b64decode(r['mcpImage']['data']))
    print('screenshot',str(path),flush=True)

def observe():
    wid=state()['worldId']
    source="""if(!talus.editor.available){
      const explosions=[];const frames=[];let tick=0;
      talus.on('explosion',e=>{explosions.push({clock:talus.sim.clock,x:e.x,y:e.y,damage:e.damage,radius:e.radius,carve:e.carve,carveRadius:e.carveRadius,carvedCells:e.carvedCells,source:e.source?.id});talus.state.setJson('m8.explosions',explosions.slice(-200))});
      talus.on('tick.sim.post',()=>{if(++tick%30)return;const m=talus.state.getJson('indigo.match');if(!m)return;const v=talus.camera.view,b=v.simulationBounds;const alive=m.roster.filter(p=>!p.eliminated).map(p=>talus.entities.get(p.entityId)?.snapshot());frames.push({clock:talus.sim.clock,phase:m.phase,turn:m.turnNumber,zoom:v.zoom,active:alive.every(s=>s?.residency==='live'&&b&&s.x-20>=b.x&&s.x+20<b.x+b.w&&s.y-20>=b.y&&s.y+20<b.y+b.h)});if(frames.length>1000)frames.shift();talus.state.setJson('m8.frames',frames)})
    }"""
    call('write_world_file',{'worldId':wid,'path':'Scripts/m8-observer.ts','content':source})
    print('observer',wid,flush=True)

if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'launch':
        s = launch('economy',3,7,20,['M8 Alpha','M8 Bravo','M8 Charlie'],8)
        capture('opening'); screen('opening')
        print('ready',s['worldId'],flush=True)
    elif action == 'capture':
        s=capture(sys.argv[2]); screen(sys.argv[2])
        print(json.dumps({'world':s['worldId'],'phase':s['match']['phase'],'turn':s['match']['turnNumber'],'error':s['error']}),flush=True)
    elif action == 'shop-check':
        before=capture('before-purchase')
        call('engine_mouse',{'action':'click','x':1263,'y':378})
        after=capture('purchase')
        w=after['economy']['players']['m8 alpha']
        assert w['cash']==30 and w['stock']['heavy']==6,w
        call('engine_mouse',{'action':'click','x':864,'y':582})
        assert capture('unaffordable')['economy']==after['economy']
        call('engine_mouse',{'action':'click','x':342,'y':874})
        screen('loadout')
        print('PASS real shop purchase and unaffordable-button protection',flush=True)
    elif action == 'finish':
        s=wait_state(lambda s:s.get('match') and s['match']['phase'] in ('finished','fault'),300)
        label=sys.argv[2] if len(sys.argv)>2 else 'finished'
        capture(label); screen(label)
        assert s['match']['phase']=='finished',s['error']
        print('finished',s['match']['winner'],'turn',s['match']['turnNumber'],flush=True)
    elif action == 'observe':
        observe()
    elif action == 'effects-round':
        launch('native-effects',3,7,20,['M8 Native A','M8 Native B','M8 Native C'],8)
        observe()
        capture('effects-ready')
        call('engine_mouse',{'action':'click','x':342,'y':874})
        call('engine_mouse',{'action':'click','x':1316,'y':924})
        s=wait_state(lambda s:s.get('match') and s['match']['phase'] in ('finished','fault'),300)
        capture('effects-finished');screen('effects-finished')
        assert not s['error'],s['error']
        print('native effects finished',s['match']['turnNumber'],flush=True)
    elif action == 'dialogue-check':
        reports=[]
        for n in (1,2):
            launch('dialogue-'+str(n),2,7,20,['M8 Shuffle A','M8 Shuffle B'],8)
            before=script("return talus.installed.get('indigo.dialogue')")
            call('engine_mouse',{'action':'click','x':342,'y':874})
            call('engine_mouse',{'action':'click','x':1316,'y':924})
            s=wait_state(lambda s:s.get('match') and any(e['kind']=='quip' for e in s['events'] or []),45)
            script('talus.sim.pause();return true')
            report=capture('dialogue-'+str(n));report['deckBefore']=before
            report['deckAfter']=script("return talus.installed.get('indigo.dialogue')")
            report['firstQuip']=next(e for e in report['events'] if e['kind']=='quip')
            reports.append(report)
            (ROOT/f'docs/evidence/m8-dialogue-{n}.json').write_text(json.dumps(report,indent=2)+'\n')
            screen('dialogue-'+str(n))
            script('talus.sim.resume();return true')
        assert reports[0]['worldId']!=reports[1]['worldId']
        assert reports[0]['match']['seed']==reports[1]['match']['seed']==7
        assert reports[1]['deckBefore']==reports[0]['deckAfter'],'New game reset the installed deck'
        assert reports[1]['firstQuip']['id']!=reports[0]['firstQuip']['id']
        assert len(reports[1]['deckAfter']['bags']['shooting'])==len(reports[0]['deckAfter']['bags']['shooting'])-1
        print('PASS same-seed fresh worlds continue the installed shuffled deck:',[r['firstQuip']['id'] for r in reports],flush=True)
    elif action == 'begin-check':
        call('engine_mouse',{'action':'click','x':91,'y':227})
        assert state()['match']['roster'][0]['weaponId']=='standard'
        call('engine_mouse',{'action':'click','x':203,'y':227})
        assert state()['match']['roster'][0]['weaponId']=='heavy'
        # Controlled native damage before combat sets up a real CPU repair.
        script("const p=talus.state.getJson('indigo.match').roster[0];const t=talus.entities.get(p.entityId);return t.damage(40,{source:t,type:'true'})")
        capture('repair-setup')
        call('engine_mouse',{'action':'click','x':1316,'y':924})
        s=wait_state(lambda s:s.get('match') and s['match']['phase']=='flight',45)
        assert any(e['kind']=='utility' and e['healed']==30 for e in s['events'])
        # Exercise actual self-damage during combat; do not inject event callbacks.
        before=script("const p=talus.state.getJson('indigo.match').roster[0];return {cash:p.cashEarned,breakdown:p.cashBreakdown}")
        script("const p=talus.state.getJson('indigo.match').roster[0];const t=talus.entities.get(p.entityId);return t.damage(10,{source:t,type:'true'})")
        after=capture('self-damage')
        p=after['match']['roster'][0]
        assert p['cashEarned']==before['cash']+60,(before,p)
        assert after['economy']['players']['m8 alpha']['stock']['battery']==1
        assert after['economy']['players']['m8 alpha']['stock']['heavy']==5
        screen('combat')
        print('PASS real gun selection, CPU repair, paid ammo consumption and $60 self-hit award',flush=True)
    elif action == 'next-round':
        before=capture('before-reopen')
        assert before['match']['phase']=='finished'
        call('engine_mouse',{'action':'click','x':780,'y':130})
        saved=call('engine_key',{'key':'s','modifiers':['meta'],'settleMs':1800})
        assert saved['focused']
        navigate_game(before['worldId'])
        wait_state(lambda s:s.get('match') and s['match']['phase']=='finished' and s['ui'].get('shop'),90)
        reopened=capture('reopened')
        assert reopened['economy']==before['economy'],'Reload changed bank or repeated CPU purchases'
        assert reopened['scores']==before['scores'],'Reload repeated score award'
        screen('reopened')
        call('engine_mouse',{'action':'click','x':823,'y':872})
        call('engine_key',{'key':'a','modifiers':['meta']})
        call('engine_type',{'text':'123'})
        call('engine_mouse',{'action':'click','x':1244,'y':872})
        s=wait_state(lambda s:s['worldId']!=before['worldId'] and s.get('match') and s['match']['phase'] in ('ready','fault') and s['ui'].get('shop'),120)
        assert not s['error'],s['error']
        after=capture('round-two');screen('round-two')
        assert after['match']['round']==2 and after['match']['seed']==123
        assert [p['name'] for p in after['match']['roster']]==[p['name'] for p in before['match']['roster']]
        assert all(r['health']==100 for r in after['roster'])
        assert after['economy']['rounds']==before['economy']['rounds']
        for key,w in after['economy']['players'].items():
            old=before['economy']['players'][key]
            assert w['earned']==old['earned']
            assert w['cash']==600+w['earned']-w['spent']
            for item,stock in old['stock'].items():assert w['stock'][item]>=stock
        print('PASS completed-save reload is idempotent; round 2 seed 123 carries names, cash and supplies',flush=True)
