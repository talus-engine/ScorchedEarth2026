"""Install the deliberately simple M1 cannon fixture through Talus HTTP."""
import json
from pathlib import Path
from bridge import call, script, ROOT, WORLD_ID

def save_template(name, base, patch):
    # Names include built-in weapons that list_assets excludes from its character list.
    existing = call('run_sql_readonly', {'sql': 'SELECT template_id, template_name FROM entity_templates WHERE template_name = ' + "'" + name.replace("'", "''") + "'"})
    text = json.dumps(existing)
    # The patch API resolves names itself; keep the existing record on repeat installs.
    found = name in text
    args = {'template': name} if found else {'basedOn': base, 'name': name}
    result = call('save_entity_template', {**args, 'patch': patch, 'allowNewKeys': True})
    print(name, result)
    return result['templateId']

def main():
    context = call('engine_describe_context')
    assert context['world']['isEditorMode'] and context['world']['templateId'] == WORLD_ID
    elements = call('engine_list_elements')
    (ROOT/'artifacts').mkdir(exist_ok=True)
    (ROOT/'artifacts/elements.json').write_text(json.dumps(elements, indent=2))
    # Resolve the material by name inside the engine: IDs belong to the world.
    iron = script('return talus.elements.get("IRON").id')['value']
    def rect(x, y, w, h, color):
        return [{'localX':xx,'localY':yy,'elementType':iron,'color':color}
                for yy in range(y,y+h) for xx in range(x,x+w)]
    shell = save_template('indigo/m1-shell', 'built-in/weapon-mods/mod_bullet', {
      'itemData': {'modSpec': {'powerCost':0, 'recoilDelta':0, 'projectile': {
        'kind':'rigid-body','bodySizePx':4,'speed':1800,'speedAtMinPower':100,
        'speedVariance':0,'gravityScale':1,'drag':0,'lifetime':30,'range':0,
        'damage':80,'damageType':'blast','aoeRadius':100,'carveRadius':48,
        'carveMode':'erase','spread':0,'knockback':0,'spawnOffset':36,
        'detonate':{'onTerrain':True,'onBody':True,'atLifetime':False}
      }}}
    })
    cannon = save_template('indigo/m1-cannon', 'built-in/weapons/item_rifle', {
      'itemData': {'startingMods':['indigo/m1-shell'], 'weaponBaseStats':{
        'spread':0,'autoFire':False,'castDelay':0.5,'rechargeTime':0,'powerMax':100,'powerChargeRate':100
      }}
    })
    base_controller = json.loads((ROOT/'assets/m1-controller.json').read_text())
    controller = {**base_controller, 'walkSpeed':55,'runSpeed':55,
      'jumpSpeed':0,'jumpsPerGrounding':0,'dashEnabled':False,'wallMovesEnabled':False,
      'wallJumpEnabled':False,'climbEnabled':False,'colliderInsetTop':0,'colliderInsetBottom':0}
    pixels = rect(-20,-8,40,16,0xff463b2f) + rect(-17,-14,34,6,0xffad6863) + rect(-8,-20,16,6,0xffcf9084)
    tank = save_template('indigo/m1-tank', 'built-in/characters/npcs/demo_guard', {
      'aiType':None,'isPlayer':False,'isStatic':False,'ragdollOnDeath':False,'indestructible':True,
      'freezeOffRing':False,'startingItems':['indigo/m1-cannon'],
      'stats':{'maxHealth':100,'health':100,'breath:max':10000},
      'characterController':controller,'heldItemAnchor':None,
      'bodies':[{'bodyIndex':0,'name':'M1 tank hull','isStatic':False,'pixels':pixels}],
      'joints':[], 'description':'Single-body instrumented M1 fixture; production artwork is later game work.'
    })
    assets={'tank':tank,'cannon':cannon,'shell':shell}
    (ROOT/'assets').mkdir(exist_ok=True)
    (ROOT/'assets/m1-ids.json').write_text(json.dumps(assets,indent=2)+'\n')

    # A flat test strip long enough to unload the shooter. Real WFC artwork is M2.
    svg='''<svg xmlns="http://www.w3.org/2000/svg" xmlns:talus="https://talus.dev/ns/world" viewBox="0 0 256 256">
    <g class="wfc-tile" talus:tile="m1-ground" talus:area="indigo-m1" talus:size="4x4" talus:origin="0 0" talus:sockets="open open open open">
      <rect x="0" y="128" width="256" height="128" talus:element="STONE"/>
    </g>
    <g class="wfc-area" talus:area="indigo-m1" talus:boundary="open" talus:chunkX0="0" talus:chunkY0="8" talus:chunkX1="199" talus:chunkY1="11"/>
    </svg>'''
    (ROOT/'assets/m1-ground.svg').write_text(svg)
    terrain=call('import_wfc_tiles',{'svg':svg,'tileSizeChunks':4,'interiorSocket':'open'})
    (ROOT/'artifacts/m1-terrain-import.json').write_text(json.dumps(terrain,indent=2))
    print('terrain',json.dumps(terrain)[:1800])
    print(script('await talus.editor.layout.setParallelWorlds("none"); await talus.editor.layout.setNewGameLocation({x:400,y:590,playerTemplateId:null}); await talus.editor.layout.setMetadata({description:"Indigo artillery game — M1 test fixture"}); await talus.editor.save(); return await talus.editor.layout.describe()'))
    source=(ROOT/'world/Scripts/m1.ts').read_text().replace('__TANK_ID__',tank)
    print(call('write_world_file',{'worldId':WORLD_ID,'path':'Scripts/m1.ts','content':source}))
    print('M1 fixtures installed; terrain generation and the flight test still need validation.')

if __name__ == '__main__': main()
