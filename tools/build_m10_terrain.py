"""Author seeded native zone/maze sources; no pre-rendered replacement terrain."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
elements = json.loads((ROOT / 'docs/evidence/m10-2533/elements.json').read_text())
stone, dirt, sand = (elements[n] for n in ('STONE', 'DIRT', 'SAND'))
bounds = dict(x=0, y=0, w=12800, h=1280)
foundation = dict(height=256, element=stone)
recipes = [dict(id='wfc', label='Mixed Reach · WFC', family='template', weight=24, bounds=bounds),
           dict(id='brush', label='Brush Reach · semantic / neural / living', family='template', weight=24,
                bounds=dict(bounds, x=16384))]

for key, label, noise, amplitude, freq, mix in [
    ('dune-sea', 'Dune sea', 'simplex', 90, .004, (.15,.45)),
    ('shattered-highlands', 'Shattered highlands', 'ridged', 155, .006, (.52,.85)),
    ('bramble-badlands', 'Bramble badlands', 'perlin', 110, .005, (.28,.85)),
    ('crater-country', 'Crater country', 'cellular', 135, .008, (.35,.85)),
]:
    terrain = dict(enabled=True, noiseType=noise, frequency=freq, amplitude=100, octaves=3,
                   persistence=.5, lacunarity=2, ridgedGain=2, cellularJitter=.85,
                   surface=dict(directions=['s'], baseline=640, amplitude=amplitude, blendWidth=0))
    zone = dict(id=key, name=label, priority=1, minX=0, maxX=12800, minY=0, maxY=1280,
                terrain=terrain, materials=[dict(elementType=stone,minValue=0,maxValue=mix[0]),
                dict(elementType=dirt,minValue=mix[0],maxValue=mix[1]),
                dict(elementType=sand,minValue=mix[1],maxValue=1)], features=[])
    params = {
        'height':dict(path='zones.0.terrain.surface.amplitude',label='Ridge height',min=20,max=180),
        'frequency':dict(path='zones.0.terrain.frequency',label='Ridge frequency',min=.001,max=.02),
        'octaves':dict(path='zones.0.terrain.octaves',label='Noise detail',min=1,max=6,integer=True),
        'blend':dict(path='zones.0.terrain.surface.blendWidth',label='Surface blend',min=0,max=12),
    }
    recipes.append(dict(id=key,label=label,family='zone',weight=6,bounds=bounds,
                        foundation=foundation,zones=[zone],parameters=params))

for key, label, algorithm, extra in [
    ('bunker-grid','Bunker grid','recursive-division',{}),
    ('rat-run','Rat run','braid',dict(braidChance=.65)),
    ('cavern-war','Cavern war','cellular-cave',dict(fillProbability=.48,smoothSteps=4)),
    ('terrace-siege','Terrace siege','platform',dict(platformGapChance=.2,platformDropChance=.4,
        platformDividerWallChance=.2,platformFilledBayChance=.1,platformMinVerticalGapTiles=3,
        platformMaxVerticalGapTiles=5,platformFloorThicknessTiles=1,platformDropWidthTiles=2)),
]:
    options = dict(keysEnabled=False,doorCount=0,doorPlacementMode='off',secretDensity=0,
                   entranceSizeTiles=3,entranceNorth=True,entranceSouth=False,
                   entranceWest=True,entranceEast=True,**extra)
    noise = dict(algorithm='simplex',frequency=.035,octaves=3,persistence=.5,lacunarity=2,
                 bands=[dict(elementId=stone,endPos=.4),dict(elementId=dirt,endPos=.85),dict(elementId=sand,endPos=1)])
    maze = dict(algorithm=algorithm,seedSalt='terra:'+key,cellSizePx=48,generate=options,
                mappings=[dict(layerId='world',kind='noise',mazeKind='wall',elementId=stone,
                               materialElementId=stone,noiseSpec=noise),
                          dict(layerId='world',kind='none',mazeKind='floor',elementId=0,materialElementId=0)],strokes=[])
    params = {'cellSize':dict(path='maze.cellSizePx',label='Cell size',min=40,max=96,integer=True)}
    for name, value in extra.items():
        params[name] = dict(path='maze.generate.'+name,label=name,
                           min=1 if isinstance(value,int) else 0,max=6 if isinstance(value,int) else 1,
                           integer=isinstance(value,int))
    # Open sky and one horizontal artillery corridor. The native maze still
    # supplies the supporting walls/caves below it. Foundation is always last.
    clearances = [dict(x=0,y=0,w=12800,h=448),dict(x=5760,y=448,w=1280,h=128)]
    recipes.append(dict(id=key,label=label,family='maze',weight=7,bounds=bounds,
                        foundation=foundation,clearances=clearances,maze=maze,parameters=params))

(ROOT / 'world/Game/terrain-recipes.json').write_text(json.dumps(
    dict(version=1,defaultRecipe='random',recipes=recipes),indent=2)+'\n')
print('Authored',len(recipes),'native source selections')
