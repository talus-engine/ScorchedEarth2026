"""Author game-owned native CA device element types; never edit stock elements."""
import argparse
import json
from pathlib import Path
from bridge import ROOT, WORLD_ID, call, script


def apply(validate_only, output):
    config = json.loads((ROOT / 'world/Game/landscape-devices.json').read_text())
    if not validate_only:
        context = call('engine_describe_context')['world']
        assert context['isEditorMode'] and context['templateId'] == WORLD_ID, 'Indigo editor required'
    source = r'''
const defs=DEFINITIONS, rows=[];
for(const d of defs){
 const base=talus.elements.get(d.basedOn);if(!base)throw new Error('Missing base '+d.basedOn);
 const fields=JSON.parse(JSON.stringify(d.fields));
 if(d.emits){const e=talus.elements.get(d.emits);if(!e)throw new Error('Missing material '+d.emits);fields.params.emitElement=e.id;}
 const exists=talus.elements.get(d.name),target=exists||base;
 const validation=await target.validate(fields);if(!validation.ok)throw new Error(JSON.stringify({name:d.name,validation}));
 rows.push({name:d.name,basedOn:d.basedOn,fields,existing:!!exists});
}
if(VALIDATE_ONLY)return {validated:true,rows};
if(!talus.editor.available || talus.world.id!==TEMPLATE)throw new Error('Indigo editor changed');
for(const row of rows){
 let e=talus.elements.get(row.name);
 if(e){
  const saved=JSON.parse(await e.exportJson());
  for(const [key,value] of Object.entries(row.fields)){
   if(key==='params'){for(const [k,v] of Object.entries(value))if(saved.params?.[k]!==v)throw new Error('Existing device differs: '+row.name+'.params.'+k);}
   else if(JSON.stringify(saved[key])!==JSON.stringify(value))throw new Error('Existing device differs: '+row.name+'.'+key);
  }
 }else e=await talus.elements.create({name:row.name,basedOn:row.basedOn,fields:row.fields});
 row.id=e.id;row.saved=JSON.parse(await e.exportJson());
}
await talus.editor.save();return {installed:true,rows};
'''.replace('DEFINITIONS', json.dumps(config['devices'])).replace('VALIDATE_ONLY', str(validate_only).lower()).replace('TEMPLATE', json.dumps(WORLD_ID))
    result = script(source, 60)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    if result.get('error'):
        raise RuntimeError(result['error'])
    print(json.dumps({'validated': bool(result.get('value')), 'installed': not validate_only, 'evidence': str(output)}))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--validate-only', action='store_true')
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    apply(args.validate_only, args.output)
