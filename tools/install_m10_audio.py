"""Generate tiny original arcade cues and import through the native audio API.
No external assets, profile copies or engine builds.
"""
import io, json, math, random, struct, wave
from bridge import ROOT, WORLD_ID, call
assert call('engine_describe_context')['world']['isEditorMode']
dest=ROOT/'assets/audio';dest.mkdir(exist_ok=True)
ids_path=ROOT/'world/Game/audio.json'
ids=json.loads(ids_path.read_text()) if ids_path.exists() else {}
for name,duration in [('turn',.25),('fire',.18),('death',.65),('victory',.8),('buy',.12)]:
    rng=random.Random(name);data=[];rate=16000
    for n in range(int(duration*rate)):
        t=n/rate;env=(1-t/duration)**2
        if name=='turn': hz=[440,660,880][min(2,int(t/duration*3))]
        elif name=='victory': hz=[523,659,784,1046][min(3,int(t/duration*4))]
        elif name=='buy': hz=880+t*4000
        else: hz=180*(1-t/duration)+35
        square=1 if math.sin(t*hz*math.tau)>=0 else -1
        value=(square*.65+(rng.random()*2-1)*.35 if name in ['fire','death'] else square)*env*.22
        data.append(struct.pack('<h',int(value*32767)))
    raw=io.BytesIO()
    with wave.open(raw,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(b''.join(data))
    wav=raw.getvalue();(dest/(name+'.wav')).write_bytes(wav)
    source='const a=await talus.audio.import(new Uint8Array('+json.dumps(list(wav))+'),{name:'+json.dumps('terra-'+name+'.wav')+'});'
    if ids.get(name):source+='const r=await talus.editor.records.get("sound",'+json.dumps(ids[name])+');r.audioId=a.audioId;'
    else:source+='const r=await talus.editor.records.create("sound",'+json.dumps('Scorched Terra '+name)+',{audioId:a.audioId});'
    source+='return await talus.editor.records.save("sound",r)'
    r=call('engine_run_script',{'source':source,'timeoutMs':10000},timeout=20)
    assert not r.get('error'),r
    ids[name]=str(r['value']['id']);print(name,ids[name],len(wav),flush=True)
ids_path.write_text(json.dumps(ids,indent=2)+'\n')
call('write_world_file',{'worldId':WORLD_ID,'path':'Game/audio.json','content':ids_path.read_text()})
print('Imported five original cues; total bytes',sum(p.stat().st_size for p in dest.glob('*.wav')))
