"""Author image-2 prompts for native per-part generation; no API calls."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESIGNS = {
    'standard': (20, 5, 'short single cannon, angular breech, one ivory muzzle band'),
    'heavy': (26, 7, 'long heavy cannon, chunky stepped breech, two ivory muzzle bands'),
    'crumble': (22, 8, 'rock-breaker cannon with square crusher teeth and ochre hazard blocks'),
    'riot': (18, 8, 'wide blunt mortar with blue vent slits and a flared shovel-shaped mouth'),
    'ricochet': (24, 7, 'spring-loaded bounce gun with visible silver coil and round orange breech'),
    'sand': (20, 10, 'sand hopper cannon with angular tan funnel above a short nozzle'),
    'baby-nuke': (20, 9, 'compact nuclear launcher, bulbous olive chamber and one bright yellow warning square'),
    'nuke': (27, 11, 'oversized nuclear launcher, thick olive drum, large yellow hazard plate, short dark muzzle'),
    'leapfrog': (24, 8, 'three-step green launcher with three descending chamber humps'),
    'funky': (23, 10, 'asymmetric purple chaos cannon, orange bulb and zigzag muzzle'),
    'mirv': (26, 10, 'five-warhead launcher, stepped stack of slim silver tubes with cyan nose markings'),
    'deaths-head': (28, 11, 'heavy black launcher with ivory skull-like armored shroud and three long teeth'),
    'napalm': (23, 9, 'fuel launcher with one amber cylindrical tank and dark narrow ignition nozzle'),
    'hot-napalm': (25, 10, 'double red fuel tanks above a copper nozzle with orange heat fins'),
    'tracer': (26, 4, 'thin ivory ranging barrel with a small blue sight and bright white muzzle'),
    'baby-roller': (18, 8, 'small roller launcher with round steel drum and one red ball visible'),
    'roller': (23, 9, 'medium roller launcher with large round gray drum and twin red ball marks'),
    'heavy-roller': (27, 11, 'heavy roller launcher with armored wheel-like breech and three red ball marks'),
    'heavy-riot': (27, 10, 'heavy blue excavator mortar with broad toothed scoop-shaped muzzle'),
    'dirt-clod': (18, 7, 'little earthen clod catapult gun with tan cup and short dark stock'),
    'dirt-ball': (22, 9, 'round ochre hopper chamber and short wide soil barrel'),
    'ton-dirt': (27, 11, 'boxy construction hopper full of brown earth with large yellow chute'),
    'liquid-dirt': (24, 10, 'slurry cannon with copper canister and flexible-looking green nozzle'),
    'plasma': (25, 9, 'electric plasma projector with cyan forked muzzle and violet capacitor'),
    'machine-gun': (28, 6, 'long perforated machine-gun barrel, compact drum magazine, brass feed box'),
    'shotgun': (24, 7, 'double-barrel shotgun turret, two squared muzzles and brown pump grip'),
    'flamethrower': (26, 8, 'thin flame lance, orange pilot light and small red pressure tank'),
    'grenade': (19, 8, 'stubby revolving grenade launcher with green cylinder and blunt gray barrel'),
    'cluster-grenade': (24, 10, 'multi-chamber grenade launcher with three green drum lobes'),
    'homing-rocket': (27, 9, 'guided rocket rail with red pointed rocket and cyan tracking optic'),
    'smoke-tracer': (24, 7, 'long smoke canister launcher with pale gray cylinder and violet vent'),
    'escape-charge': (16, 6, 'small emergency orange wedge launcher with a single broad black mouth'),
    'riot-charge': (21, 8, 'blue directional breaching charge projector with fan-shaped muzzle'),
    'riot-blast': (27, 10, 'large directional breacher with twin blue pressure chambers and broad fan muzzle'),
    'dirt-charge': (22, 9, 'yellow soil injector with square brown reservoir and flat extrusion nozzle'),
    'earth-disrupter': (28, 10, 'seismic cannon with copper tuning forks, black anvil chamber and orange coils'),
}


def main():
    shop = json.loads((ROOT / 'world/Game/shop.json').read_text())
    weapons = [i for i in shop['items'] if i['kind'] == 'weapon' and i['enabled']]
    assert {w['id'] for w in weapons} == set(DESIGNS), 'Describe every enabled weapon exactly once'
    parts = []
    for item in weapons:
        width, height, design = DESIGNS[item['id']]
        parts.append({'id': item['id'], 'name': item['name'], 'kind': 'weapon',
                      'targetTemplateId': item['template'], 'width': width, 'height': height,
                      'design': design + '; side-on mounted tank weapon, business end points right; no hands, tank, bullets or lettering'})
    components = [
        ('chassis', 36, 14, 'compact low armored tank hull only, cyan steel plates, dark lower fender and ivory edge highlights; no turret, tracks, wheels or weapons'),
        ('turret', 8, 6, 'round low-profile cyan tank turret bearing cap only, dark lower pivot ring; no barrel or chassis'),
        ('wheel', 5, 5, 'single circular charcoal tank road wheel with steel rim and three bright hub spokes; perfectly side-on'),
        ('jet-pod', 5, 8, 'single compact tank jetpack pod, cyan armored upper casing and orange nozzle at bottom; nozzle points down; no flame'),
        ('jet-flame', 3, 7, 'single tiny downward jet exhaust plume, bright ivory core, yellow middle and orange tip; widest at top, tapered at bottom'),
    ]
    for key, width, height, design in components:
        parts.append({'id': key, 'name': key, 'kind': 'component', 'width': width, 'height': height, 'design': design})
    plan = {'version': 1, 'model': 'gpt-image-2', 'mode': 'Talus native generate_entity per-part image pipeline',
            'style': '1980s arcade pixel graphics; tiny bold pixel clusters, hard edges, no antialiasing, no fine painterly details, no text or logos',
            'parts': parts, 'authoredParts': [{'id': 'tread-link', 'width': 3, 'height': 1,
                'path': 'assets/m13/authored/tread-link.json', 'source': 'authored-pixel-strip'}]}
    dest = ROOT / 'assets/m13/art-plan.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(plan, indent=2) + '\n')
    print(f'Prepared {len(weapons)} distinct weapons and {len(components)} reusable tank components.')


if __name__ == '__main__':
    main()
