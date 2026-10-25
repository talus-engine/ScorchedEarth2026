"""Deterministic game content authoring. Engine asset IDs are assigned by install_m9."""
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads((ROOT/p).read_text())
def save(p,v):(ROOT/p).write_text(json.dumps(v,indent=2)+'\n')
shop=load('fixtures/m8/Game/shop.json');items=shop['items'];by={i['id']:i for i in items}
for i in items:i['category']='Support' if i['kind']=='utility' else 'Artillery'
for id,name,original in [('standard','Baby Missile','Baby Missile'),('heavy','Missile','Missile'),('riot','Riot Bomb','Riot Bomb'),('battery','Battery','Battery'),('magnet','Mag Deflector','Mag Deflector'),('shield','Shield','Shield')]:by[id].update(name=name,original=original)
base=dict(kind='rigid-body',bodySizePx=4,speed=1800,speedAtMinPower=100,speedVariance=0,gravityScale=1,drag=0,lifetime=20,range=0,damage=80,damageType='blast',aoeRadius=100,carveRadius=48,carveMode='erase',spread=0,knockback=0,spawnOffset=36,independent=True,detonate=dict(onTerrain=True,onBody=True,atLifetime=True))
# Material names are resolved by the engine at installation, never hard-coded IDs.
def weapon(id,name,description,price=240,bundle=3,category='Artillery',behavior=None,original=True,**patch):
    i=dict(id=id,name=name,kind='weapon',price=price,bundle=bundle,enabled=True,category=category,description=description,projectile={**base,**patch})
    if original:i['original']=name
    if behavior:i['behavior']=behavior
    items.append(i);return i
for i in items:
    if i['kind']=='weapon':i['projectile']={**base,**i.get('projectile',{})}
weapon('baby-nuke','Baby Nuke','A compact nuclear shell: 150 peak damage and a 104-pixel crater.',360,damage=150,aoeRadius=200,carveRadius=104)
weapon('nuke','Nuke','A very large nuclear shell: 220 peak damage and a 176-pixel crater.',600,2,damage=220,aoeRadius=280,carveRadius=176)
weapon('leapfrog','Leap Frog','Three consecutive explosive hops. The second and third warheads launch from the previous impact.',300,behavior=dict(mode='leap',hops=3),damage=70,aoeRadius=95,carveRadius=42)
weapon('funky','Funky Bomb','A chaotic blast scattering seven live secondary warheads.',420,behavior=dict(mode='cluster',count=7,childDamage=55,childRadius=70,childCarve=28,speed=280),damage=65,aoeRadius=95,carveRadius=42)
weapon('mirv','MIRV','Splits into five descending warheads at the apex. An obstructed carrier fizzles before it can split.',400,behavior=dict(mode='apex',count=5,childDamage=80,childRadius=105,childCarve=48,spread=130),damage=0,aoeRadius=0,carveRadius=0,carveMode='none')
weapon('deaths-head',"Death’s Head",'Nine large warheads at the apex. Allow plenty of clearance.',750,1,behavior=dict(mode='apex',count=9,childDamage=145,childRadius=185,childCarve=96,spread=125),damage=0,aoeRadius=0,carveRadius=0,carveMode='none')
for id,name,radius in [('napalm','Napalm',48),('hot-napalm','Hot Napalm',80)]:
    weapon(id,name,'Deposits real burning fuel at impact. Fire and oil continue simulating after the turn.',280 if radius==48 else 400,category='Materials',behavior=dict(mode='deposit',element='CRUDE_OIL',radius=radius,ignite=True),damage=15,damageType='fire',aoeRadius=35,carveRadius=0,carveMode='none')
weapon('smoke-tracer','Smoke Tracer','A harmless ranging shell leaving a native smoke-particle trail.',100,5,category='Support',trailMaterial='SMOKE',trailRate=36,damage=0,aoeRadius=0,carveRadius=0,carveMode='none')
weapon('tracer','Tracer','A harmless ballistic ranging shell. Its final location remains in the hit readout.',60,5,category='Support',damage=0,aoeRadius=0,carveRadius=0,carveMode='none')
for id,name,dmg,radius in [('baby-roller','Baby Roller',55,65),('roller','Roller',90,110),('heavy-roller','Heavy Roller',130,150)]:
    weapon(id,name,'Rolls and bounces down slopes; detonates on a hull or after coming to rest. A safety fuse bounds the wait.',200 if dmg<90 else 280,category='Artillery',damage=dmg,aoeRadius=radius,carveRadius=radius//2,bouncing=100,lifetime=10,detonate=dict(onTerrain=False,onBody=True,onRest=True,fuse=8,atLifetime=True))
weapon('heavy-riot','Heavy Riot Bomb','Clears a wide crater without blast damage.',220,category='Excavation',damage=0,aoeRadius=0,carveRadius=144)
for id,name,rad,element in [('dirt-clod','Dirt Clod',40,'DIRT'),('dirt-ball','Dirt Ball',72,'DIRT'),('ton-dirt','Ton of Dirt',112,'DIRT'),('liquid-dirt','Liquid Dirt',96,'SAND')]:
    weapon(id,name,'Deposits real '+element.lower()+' in empty cells; native particles can bury tanks and fill valleys.',120+rad,category='Materials',behavior=dict(mode='deposit',element=element,radius=rad),damage=0,aoeRadius=0,carveRadius=0,carveMode='none')
weapon('plasma','Plasma Blast','A self-centered blast. Uses one Battery as well as one charge; aim does not change its center.',300,category='Energy',behavior=dict(mode='battery-blast'),speed=0,speedAtMinPower=0,spawnOffset=0,damage=130,damageType='electric',aoeRadius=180,carveRadius=65,detonate=dict(onBody=False,onTerrain=False,fuse=.04,atLifetime=True))
# The laser's native material, not scripted circle erasure, performs cutting.
laser=weapon('laser','Laser','A straight material-cutting LASER beam. Uses one Battery per shot.',300,category='Energy',behavior=dict(mode='battery'),kind='particle',bodySizePx=2,material='LASER',projectilesPerShot=18,damage=8,damageType='fire',aoeRadius=0,carveRadius=0,carveMode='none',caImpact=True,speed=3000,speedAtMinPower=3000,lifetime=.75,gravityScale=0,spawnOffset=40)
laser.update(enabled=False,requires='E23',category='In development',description='In development: a native straight cutting beam powered by a Battery.')
weapon('machine-gun','Machine Gun','Twelve actual bullets over 0.88 seconds; one purchased magazine per turn.',160,4,category='Rapid fire',original=False,behavior=dict(mode='burst',count=12,interval=.08,jitter=.018),damage=9,damageType='kinetic',aoeRadius=4,carveRadius=3,gravityScale=.1,speed=2200,speedAtMinPower=2200,lifetime=3)
weapon('shotgun','Shotgun','Nine simultaneous pellets in a spread. Best at close range.',170,4,category='Rapid fire',original=False,projectilesPerShot=9,spread=.075,damage=15,damageType='kinetic',aoeRadius=10,carveRadius=5,speed=1400,speedAtMinPower=1400,lifetime=3,gravityScale=.3)
weapon('flamethrower','Flamethrower','A stream of actual FIRE particles over 1.4 seconds. Fire may persist after the attack.',200,3,category='Rapid fire',original=False,behavior=dict(mode='burst',count=15,interval=.1,jitter=.1),kind='particle',material='FIRE',projectilesPerShot=12,damage=3,damageType='fire',aoeRadius=0,carveRadius=0,carveMode='none',caImpact=True,speed=420,speedAtMinPower=420,lifetime=2,gravityScale=0,spawnOffset=40)
weapon('grenade','Grenade','A bouncing three-second fused grenade.',150,4,original=False,bouncing=20,lifetime=4,damage=90,aoeRadius=105,carveRadius=50,detonate=dict(onTerrain=False,onBody=False,fuse=3,atLifetime=True))
weapon('cluster-grenade','Cluster Grenade','A fused grenade scattering five smaller live grenades.',260,3,original=False,behavior=dict(mode='cluster',count=5,childDamage=40,childRadius=60,childCarve=24,speed=230),bouncing=20,lifetime=4,damage=65,aoeRadius=85,carveRadius=40,detonate=dict(onTerrain=False,onBody=False,fuse=3,atLifetime=True))
weapon('homing-rocket','Homing Rocket','A native steering rocket seeks the selected opponent. Deflectors can still bend metal rockets.',350,3,original=False,behavior=dict(mode='homing'),homing=2,homingDelay=.3,damage=95,aoeRadius=115,carveRadius=52)
# Every original catalogue item is accounted for; engine-dependent behavior is
# deliberately non-purchasable rather than substituted with look-alike scripts.
blocked=[

('riot-charge','Riot Charge','weapon','E22','directional wedge excavation from the turret'),('riot-blast','Riot Blast','weapon','E22','large directional wedge excavation'),
('baby-digger','Baby Digger','weapon','E23','native underground projectile tunneling'),('digger-shell','Digger','weapon','E23','native underground projectile tunneling'),('heavy-digger','Heavy Digger','weapon','E23','wide underground projectile tunneling'),
('baby-sandhog','Baby Sandhog','weapon','E23','splitting subterranean warheads'),('sandhog','Sandhog','weapon','E23','splitting subterranean warheads'),('heavy-sandhog','Heavy Sandhog','weapon','E23','large splitting subterranean warheads'),
('dirt-charge','Dirt Charge','weapon','E22','directional wedge deposition'),('earth-disrupter','Earth Disrupter','weapon','E22','bounded structural collapse of suspended terrain'),
('heat-guidance','Heat Guidance','utility','E24','attach guidance to the next purchased shot'),('ballistic-guidance','Ballistic Guidance','utility','E24','finite ballistic correction for the next purchased shot'),('horz-guidance','Horz Guidance','utility','E24','horizontal guidance input for one shot'),('vert-guidance','Vert Guidance','utility','E24','vertical guidance input for one shot'),
('lazy-boy','Lazy Boy','utility','E24','finite automatic targeting assistance'),('parachute','Parachute','utility','E25','finite native fall protection and drag'),('fuel-tank','Fuel Tank','utility','E25','native fuel accounting for ground propulsion'),('contact-trigger','Contact Trigger','utility','E24','attach contact detonation to the next purchased shot')]
for id,name,kind,issue,need in blocked:items.append(dict(id=id,name=name,original=name,kind=kind,category='In development',price=0,bundle=1,enabled=False,requires=issue,description='In development: '+need+'.'))
lazy=next(i for i in items if i['id']=='lazy-boy')
lazy.update(enabled=True,category='Support',price=180,bundle=3,description='Sets a native ballistic firing solution. One charge only when a supported aim is found; you choose when to shoot.')
lazy.pop('requires',None)
# Shield variants are real finite charge packs of the same native component.
for id,name,target,units,price in [('force-shield','Force Shield','shield',2,440),('heavy-shield','Heavy Shield','shield',3,600),('super-mag','Super Mag','magnet',3,850)]:
    items.append(dict(id=id,name=name,original=name,kind='utility',category='Support',price=price,bundle=1,enabled=True,grants=dict(item=target,units=units),description=f'Adds {units} standard {target} charges to your reserve. The native field draws from that reserve.'))
items.append(dict(id='auto-defense',name='Auto Defense',original='Auto Defense',kind='utility',category='Support',price=120,bundle=1,enabled=True,description='At the start of the round, automatically activates your stocked shield and mag field. Consumed only if a field activates.'))
shop['version']=2
shop['cpu']['weapons']=['mirv','nuke','machine-gun','funky','napalm','heavy-roller','deaths-head','shotgun','dirt-ball','homing-rocket','flamethrower','heavy','cluster-grenade']
shop['categories']=['All','Artillery','Rapid fire','Materials','Excavation','Energy','Support','In development']
save('world/Game/shop.json',shop)
arena=load('fixtures/m8/Game/arena.json');arena['combat'].update(x=5920,w=960,spawnInset=40)
arena['generation']={'default':'wfc','brushOriginX':16384,'brushWidth':12800,'brushHeight':1280,'surfaceY':640,'amplitude':144,'cellWidth':512,'detailSize':[64,128],'recipes':['indigo-mixed-earth','builtin-brush-hills','builtin-brush-cliffside'],'growthPresets':['builtin-bramble','builtin-oak-sapling'],'neuralModel':'builtin-nca-eight','status':{'recipes':'native-runtime','neural':'E22','livingGrowth':'E22'}}
save('world/Game/arena.json',arena)
# Native recipe noise is world-coordinate seeded, so adjacent jobs share peaks.
mixed=next(i for i in load('assets/m9-brush-library.json')['recipes'] if i['id']=='indigo-mixed-earth')
# Native runtime operates on the world plane. These authored recipes expressly
# contain only that plane; editor recipes with raster washes must be refused.
foundation={'id':'indigo-m9-foundation','name':'Solid foundation','description':'Permanent bottom tile row','tags':['stone'],'macro':{'mode':'volumetric','support':'none','strata':[{'element':'STONE','thickness':[1,1]}]},'micro':{'noise':{'algorithm':'value','frequency':.02,'octaves':1,'persistence':.5,'lacunarity':2}}}
fill=copy.deepcopy(mixed);fill['id']='indigo-m9-fill';fill['macro']['mode']='volumetric';fill['macro']['support']='none'
for k in ['raster','scatter']:fill.pop(k,None)
fill['macro']['strata']=[s for s in fill['macro']['strata'] if s.get('layer','world') in ['world','active']]
surface=copy.deepcopy(fill);surface['id']='indigo-m9-ridge';surface['macro'].update(mode='surface',support='fill-below',surface={'amplitude':144,'frequency':.006,'octaves':3,'blendWidth':0})
surface['macro']['surface']['directions']=['s']
# Use cellular noise for site-driven peak modulation, simplex material texture.
details=[]
for name in ['hills','cliffside','forest-floor']:
    choices=[r for r in load('assets/m9-brush-library.json')['recipes'] if r['id'].endswith('-'+name)]
    if not choices:continue
    recipe=copy.deepcopy(choices[0]);recipe['macro']['mode']='volumetric';recipe['macro']['support']='none';recipe['macro'].pop('surface',None)
    recipe['macro']['strata']=[s for s in recipe['macro']['strata'] if s.get('layer','world') in ['world','active']]
    recipe.pop('raster',None);recipe.pop('scatter',None)
    details.append(recipe)
save('world/Game/generation.json',{'version':1,'foundation':foundation,'fill':fill,'surface':surface,'details':details})
coverage={'source':'Scorched Earth 1.5 manual','originalWeapons':[i['name'] for i in items if i.get('original') and i['kind']=='weapon'],'originalAccessories':[i['name'] for i in items if i.get('original') and i['kind']=='utility'],'enabled':len([i for i in items if i['enabled']]),'blocked':len([i for i in items if not i['enabled']])}
save('assets/m9-coverage.json',coverage)
print(coverage)
