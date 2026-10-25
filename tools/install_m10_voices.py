"""Attach n typed voice pools to the five existing native persona factions."""
import json
from bridge import ROOT, WORLD_ID, call

context = call('engine_describe_context')['world']
assert context['isEditorMode'] and context['templateId'] == WORLD_ID, context
personas = json.loads((ROOT / 'world/Game/personas.json').read_text())
voices = json.loads((ROOT / 'world/Game/persona-voices.json').read_text())
report = []
for persona in personas['personas']:
    registry = [{**{k: v for k, v in t.items() if k in ('id','label')},
                 'metadata': {k: v for k, v in t.items() if k not in ('id','label')}}
                for t in personas['shoutTypes']]
    pools = {kind: {'neutral': [line['text'] for line in lines]}
             for kind, lines in voices['personas'][persona['id']].items()}
    source = "const r=await talus.editor.records.get('faction'," + json.dumps(persona['factionId']) + ");"
    source += "if(!r)throw new Error('Missing persona faction');r.shouts.types=" + json.dumps(registry) + ";"
    source += 'r.shouts.defaultPools=' + json.dumps(pools) + ';'
    source += "const saved=await talus.editor.records.save('faction',r);return {id:saved.factionId,types:saved.shouts.types,pools:saved.shouts.defaultPools}"
    result = call('engine_run_script', {'source':source,'timeoutMs':10000}, timeout=20)
    assert not result.get('error'), result
    assert result['value']['pools'] == pools
    report.append({'faction':persona['factionId'],'types':len(registry),'lines':sum(len(v['neutral']) for v in pools.values()),'nativeReadback':True})
    print('Attached',persona['id'],report[-1]['lines'],'lines',flush=True)
call('engine_run_script', {'source':'await talus.editor.save();return true','timeoutMs':10000}, timeout=20)
(ROOT / 'docs/evidence/m10-2533/faction-pools.json').write_text(json.dumps(report,indent=2)+'\n')
