"""Build native jointed tank data. Existing floating CCT owns propulsion.

Track assemblies and wheels are rigid bodies on joints, with no terrain
collisions. Native frame layers animate the 3x1 tread pattern; native hinge
motors rotate wheels and articulate pods. No runtime pose script is required.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
PARTS = ('chassis', 'turret', 'wheel', 'tread-link', 'jet-pod', 'jet-flame')


def load_parts(parts_dir=ROOT / 'assets/m13/generated'):
    return {k: json.loads(((ROOT / 'assets/m13/authored' if k == 'tread-link' else parts_dir)
                          / (k + '.json')).read_text()) for k in PARTS}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def bounds(pixels):
    require(bool(pixels), 'Cannot infer bounds from empty pixels')
    return {'minLocalX': min(p['localX'] for p in pixels), 'maxLocalX': max(p['localX'] for p in pixels),
            'minLocalY': min(p['localY'] for p in pixels), 'maxLocalY': max(p['localY'] for p in pixels)}


def centered_part(receipt, key, material):
    require(receipt.get('id') == key, 'Part identity mismatch: ' + key)
    if key == 'tread-link':
        require(receipt.get('source') == 'authored-pixel-strip', 'Expected authored tread strip')
    else:
        require(receipt.get('model') == 'gpt-image-2', 'Expected native image-2 receipt: ' + key)
    pixels = copy.deepcopy(receipt['body']['pixels'])
    b = bounds(pixels)
    width, height = b['maxLocalX'] - b['minLocalX'] + 1, b['maxLocalY'] - b['minLocalY'] + 1
    require(width <= receipt['requested']['width'] and height <= receipt['requested']['height'], 'Part exceeds requested size: ' + key)
    if key == 'tread-link':
        require(width == 3 and height == 1 and len(pixels) == 3, 'Tread image must be three adjacent pixels')
    cx, cy = (b['minLocalX'] + b['maxLocalX']) / 2, (b['minLocalY'] + b['maxLocalY']) / 2
    for p in pixels:
        p.update(localX=p['localX'] - cx, localY=p['localY'] - cy, elementType=material)
    return {'width': width, 'height': height, 'pixels': pixels}


def capsule(distance, half_run=4.5, radius=3):
    straight, arc = 2 * half_run, math.pi * radius
    s = distance % (2 * straight + 2 * arc)
    if s < straight:
        return -half_run + s, -radius, 0
    if s < straight + arc:
        a = -math.pi / 2 + (s - straight) / radius
        return half_run + radius * math.cos(a), radius * math.sin(a), a + math.pi / 2
    if s < 2 * straight + arc:
        return half_run - (s - straight - arc), radius, math.pi
    a = math.pi / 2 + (s - 2 * straight - arc) / radius
    return -half_run + radius * math.cos(a), radius * math.sin(a), a + math.pi / 2


def belt_frames(link):
    circumference, count, phases = 18 + 6 * math.pi, 12, 3
    frames = []
    for phase in range(phases):
        cells = {}
        for n in range(count):
            x, y, a = capsule(circumference * (n + phase / phases) / count)
            for p in link['pixels']:
                px = round(x + p['localX'] * math.cos(a) - p['localY'] * math.sin(a))
                py = round(y + p['localX'] * math.sin(a) + p['localY'] * math.cos(a))
                cells[(px, py)] = {**p, 'localX': px, 'localY': py}
        frames.append({'width': 19, 'height': 9, 'pixels': list(cells.values())})
    return frames, circumference / count


def build(base, receipts, record_ids=None, target_template_id=None, palette=None):
    base = copy.deepcopy(base.get('record', base))
    require({b['bodyIndex'] for b in base['bodies']} == {0, 1}, 'Use an exact pre-M13 tank record')
    require(base['bodies'][1].get('aimAtTarget'), 'Native aim pivot required')
    require(base.get('characterController', {}).get('enabled'), 'Existing CCT required')
    require(set(PARTS) <= set(receipts), 'Missing native part receipts: ' + ', '.join(set(PARTS) - set(receipts)))
    material = base['bodies'][0]['pixels'][0]['elementType']
    art = {k: centered_part(receipts[k], k, material) for k in PARTS}
    # Tint cyan paint only. Neutral steel highlights and weapon art remain intact.
    if palette:
        import colorsys
        rgb = [int(palette['body'][n:n+2], 16) / 255 for n in (1, 3, 5)]
        hue, saturation, value = colorsys.rgb_to_hsv(*rgb)
        for key in ('chassis', 'turret', 'jet-pod'):
            for p in art[key]['pixels']:
                c = p['color']; r, g, b = c & 255, (c >> 8) & 255, (c >> 16) & 255
                if g > r * 1.1 and b > r * 1.1:
                    brightness = max(r, g, b) / 255
                    nr, ng, nb = [round(v * 255) for v in colorsys.hsv_to_rgb(hue, saturation, min(1, brightness * (0.55 + value * 0.65)))]
                    p['color'] = (255 << 24) | (nb << 16) | (ng << 8) | nr
    template_id = target_template_id or base['templateId']
    record_ids = record_ids or {}
    def uid(name):
        return record_ids.get(name) or str(uuid.uuid5(uuid.NAMESPACE_URL, f'scorched-terra/m13/{template_id}/{name}'))
    box = bounds(base['bodies'][0]['pixels'])
    center = ((box['minLocalX'] + box['maxLocalX']) / 2, (box['minLocalY'] + box['maxLocalY']) / 2)
    bodies = copy.deepcopy(base['bodies']); bodies[0]['pixels'] = []
    joints = copy.deepcopy(base['joints'])
    sets, layers, clips, static_frames, components = [], [], [], [], []
    centers = {0: center}

    def animation_set(key, frames, fps=1):
        result = uid('set/' + key)
        sets.append({'id': result, 'name': 'm13-' + key, 'frames': frames, 'frameRate': fps,
                     'pivotX': (frames[0]['width'] - 1) / 2,
                     'pivotY': (frames[0]['height'] - 1) / 2})
        return result

    def sprite_layer(key, idx, set_id, sprite_box, position, always=True, collision=False):
        layer_id = uid('layer/' + key)
        layers.append({'id': layer_id, 'name': 'm13-' + key, 'layerType': 'particle-frame',
                       'bindBodyIndex': idx, 'animationSetId': set_id, 'frameRate': 1, 'loop': True,
                       'offsetX': position[0], 'offsetY': position[1],
                       'collision': {'enabled': collision, 'shape': 'box', 'elementType': material,
                                     **sprite_box, 'padding': 0, 'inset': 0}})
        ft = {'particleLayerId': layer_id, 'animationSetId': set_id, 'frameRate': 1}
        if always:
            static_frames.append(ft)
        return ft

    hull = copy.deepcopy(art['chassis'])
    for p in hull['pixels']:
        p['localY'] += -8 - center[1]
    root_local_box = {k: v - center[0 if k.endswith('X') else 1] for k, v in box.items()}
    sprite_layer('hull', 0, animation_set('hull', [hull]), root_local_box, center, collision=True)

    def part(key, frame, position, parent=0, joint_type='hinge', limits=None, pivot=(0, 0), always=True, fps=1):
        idx = len(bodies)
        bodies.append({'bodyIndex': idx, 'name': 'M13 ' + key, 'role': 'other', 'isStatic': False,
                       'indestructible': True, 'gravityScale': 0, 'maskBits': 0,
                       'friction': 0, 'restitution': 0, 'linearDamping': 0.1, 'angularDamping': 0.1,
                       'pixels': []})
        centers[idx] = position
        sprite_box = bounds(frame['pixels'])
        # Bounds are centered, stable proxies. Source frame geometry can be asymmetric.
        w, h = frame['width'], frame['height']
        sprite_box = {'minLocalX': -(w-1)/2, 'maxLocalX': (w-1)/2,
                      'minLocalY': -(h-1)/2, 'maxLocalY': (h-1)/2}
        set_id = animation_set(key, [frame], fps)
        ft = sprite_layer(key, idx, set_id, sprite_box, position, always=always)
        ax, ay = centers[parent]
        joint = {'type': joint_type, 'bodyA': parent, 'bodyB': idx,
                 'anchorALocalX': position[0] + pivot[0] - ax, 'anchorALocalY': position[1] + pivot[1] - ay,
                 'anchorBLocalX': pivot[0], 'anchorBLocalY': pivot[1], 'contactsEnabled': False,
                 'motorSpeed': 0, 'motorMaxTorque': 100, 'stiffness': 1}
        if limits:
            joint.update(hingeLimitMin=limits[0], hingeLimitMax=limits[1])
        joints.append(joint)
        components.append({'bodyIndex': idx, 'name': key, 'parent': parent, 'center': position,
                           'width': w, 'height': h, 'terrainCollision': False})
        return idx, ft, sprite_box

    cap, _, _ = part('turret-bearing', art['turret'], (center[0], -16), joint_type='fixed')
    belt, pitch = belt_frames(art['tread-link'])
    slow_set = animation_set('belt-slow', belt, 27)
    fast_set = animation_set('belt-run', belt, 54)
    modules, wheels, belt_idle, belt_slow, belt_fast = [], [], [], [], []
    for side, mx in (('rear', -10), ('front', 10)):
        module, ft, _ = part('track-' + side, belt[0], (mx, 2), limits=(-0.045, 0.045), always=False)
        modules.append(module); belt_idle.append(ft)
        belt_slow.append({**ft, 'animationSetId': slow_set, 'frameRate': 27})
        belt_fast.append({**ft, 'animationSetId': fast_set, 'frameRate': 54})
        for n, offset in enumerate((-4.5, 4.5)):
            wheel, _, _ = part('wheel-' + side + '-' + str(n), art['wheel'], (mx + offset, 2), parent=module)
            wheels.append(wheel)
    pods, flame_tracks = [], []
    for side, x in (('left', -16), ('right', 16)):
        pod, _, pod_box = part('jet-' + side, art['jet-pod'], (x, -7), limits=(-0.45, 0.45), pivot=(0, -3))
        pods.append(pod)
        flame = copy.deepcopy(art['jet-flame'])
        for p in flame['pixels']:
            p['localY'] += 6
        flame_tracks.append(sprite_layer('flame-' + side, pod, animation_set('flame-' + side, [flame]), pod_box, (x, -7), always=False))

    def motor_track(idx, speed):
        return {'bodyIndex': idx, 'keyframes': [{'percent': 0, 'motorSpeed': speed, 'easing': 'linear'},
                                               {'percent': 100, 'motorSpeed': speed, 'easing': 'linear'}]}

    def clip(key, tracks, frames=None, duration=1):
        clip_id = uid('clip/' + key)
        value = {'clipId': clip_id, 'clipName': 'm13-' + key, 'entityTemplateId': template_id,
                 'duration': duration, 'iterationCount': 0, 'direction': 'normal', 'fillMode': 'both',
                 'delay': 0, 'rootMotion': False, 'tracks': tracks}
        if frames:
            value['frameTracks'] = frames
        clips.append(value)
        return clip_id

    base_clip = clip('base', [], static_frames)
    speed = base['characterController']['runSpeed']
    wheel_omega = speed / (max(art['wheel']['width'], art['wheel']['height']) / 2)
    idle = clip('drive-idle', [motor_track(i, 0) for i in modules + wheels], belt_idle)
    slow = clip('drive-slow', [motor_track(i, wheel_omega/2) for i in wheels] + [motor_track(i, 0) for i in modules], belt_slow)
    rock = [{'bodyIndex': i, 'keyframes': [{'percent': p, 'motorSpeed': v, 'easing': 'step'}
                                         for p, v in [(0, .45), (50, -.45), (100, .45)]]} for i in modules]
    run = clip('drive-run', [motor_track(i, wheel_omega) for i in wheels] + rock, belt_fast, .4)
    folded = clip('jets-rest', [motor_track(i, v) for i, v in zip(pods, (6, -6))])
    deployed = clip('jets-thrust', [motor_track(i, v) for i, v in zip(pods, (-6, 6))], flame_tracks)
    def state(name, c):
        return {'stateName': name, 'clipId': c, 'speed': 1, 'loop': True}
    controller = {'controllerId': uid('controller'), 'entityTemplateId': template_id,
                  'parameters': {'speed': {'type': 'float', 'default': 0}, 'levitating': {'type': 'bool', 'default': False}},
                  'layers': [
                      {'name': 'base-art', 'blendMode': 'override', 'weight': 1,
                       'stateMachine': {'defaultState': 'idle', 'states': [state('idle', base_clip)], 'transitions': []}},
                      {'name': 'locomotion', 'blendMode': 'override', 'weight': 1, 'bodyMask': modules + wheels,
                       'blendTree': {'type': '1d', 'parameter': 'speed', 'entries': [
                           {'threshold': 0, 'clipId': idle, 'speed': 1},
                           {'threshold': .45, 'clipId': slow, 'speed': 1},
                           {'threshold': 1, 'clipId': run, 'speed': 1}]}},
                      {'name': 'jetpack', 'blendMode': 'override', 'weight': 1, 'bodyMask': pods,
                       'stateMachine': {'defaultState': 'rest', 'states': [state('rest', folded), state('thrust', deployed)],
                                        'transitions': [{'fromState': a, 'toState': b,
                                                         'conditions': [{'parameter': 'levitating', 'op': '==', 'value': v}],
                                                         'crossfadeDuration': .1, 'hasExitTime': False,
                                                         'exitTimePercent': 0, 'interruptible': True}
                                                        for a, b, v in [('rest', 'thrust', True), ('thrust', 'rest', False)]]}}]}
    # Native spawning discovers the controller by its owning entityTemplateId.
    patch = {'pixels': [], 'bodies': bodies, 'joints': joints, 'particleAnimationSets': sets,
             'particleAnimationLayers': layers}
    return {'version': 2, 'status': 'native-prototype-ready', 'targetTemplateId': template_id,
            'baseSnapshotSha256': digest(base), 'templatePatch': patch, 'clips': clips, 'controller': controller,
            'manifest': {'components': components, 'bodyCount': len(bodies), 'trackModules': len(modules),
                         'visibleLinksPerModule': 12, 'linkSize': [3, 1], 'wheelCount': len(wheels),
                         'nominalSpeed': speed, 'wheelMotorRadiansPerSecond': wheel_omega,
                         'beltSpeedPixelsPerSecond': pitch * 54 / 3,
                         'rootBounds': box, 'characterControllerPreserved': base['characterController'],
                         'propulsion': 'existing floating character controller', 'terrainCollisions': 'root only',
                         'runtimePoseScript': False}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, default=ROOT / 'assets/m13/before/tank-base.json')
    parser.add_argument('--parts-dir', type=Path, default=ROOT / 'assets/m13/generated')
    parser.add_argument('--target-template-id')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/m13/rig-proposal.json')
    args = parser.parse_args()
    receipts = load_parts(args.parts_dir)
    proposal = build(json.loads(args.base.read_text()), receipts, target_template_id=args.target_template_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proposal, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'manifest': proposal['manifest']}, indent=2))


if __name__ == '__main__':
    main()
