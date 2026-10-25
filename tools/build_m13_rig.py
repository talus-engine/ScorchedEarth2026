"""Build a local native tank-rig proposal; never connects to Talus or installs.

Inputs are the exact current template snapshot and native image-2 part receipts.
Without --pose-contract the output is deliberately a non-installable draft.
That file records ENGINE's confirmed E57 fields, rather than this tool inventing
an engine schema. Its own envelope is:
  {"reference": "native source/contract reference", "confirmed": true,
   "cosmeticPartsWithoutAI": true, "emptyAnchorRestore": true,
   "patches": [{"target": "controller|template|visualBody|visualJoint|track",
                "fields": {<actual documented native fields>}}]}
Only each patch's fields enter native records; the envelope is build metadata.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
PARTS = ("chassis", "turret", "wheel", "tread-link", "jet-pod", "jet-flame")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def rounded(value):
    return round(float(value), 9)


def bounds(pixels):
    require(bool(pixels), "Cannot infer bounds from empty source pixels")
    return {"minLocalX": min(p["localX"] for p in pixels),
            "maxLocalX": max(p["localX"] for p in pixels),
            "minLocalY": min(p["localY"] for p in pixels),
            "maxLocalY": max(p["localY"] for p in pixels)}


def centered_part(receipt, key):
    require(receipt.get("id") == key, f"Wrong receipt for {key}")
    require(receipt.get("model") == "gpt-image-2", f"{key}: expected native image-2 receipt")
    pixels = receipt.get("body", {}).get("pixels", [])
    require(bool(pixels), f"{key}: generated part is empty; regenerate through native importer")
    for p in pixels:
        require(all(isinstance(p.get(k), (int, float)) and math.isfinite(p[k])
                    for k in ("localX", "localY", "elementType")), f"{key}: invalid native pixel")
        require(p["elementType"] > 0, f"{key}: AIR is not a visible part material")
    b = bounds(pixels)
    width = b["maxLocalX"] - b["minLocalX"] + 1
    height = b["maxLocalY"] - b["minLocalY"] + 1
    requested = receipt.get("requested", {})
    require(width <= requested.get("width", 0) and height <= requested.get("height", 0),
            f"{key}: generated art exceeds requested native dimensions")
    if key == "tread-link":
        require(width == 3 and height == 1 and len(pixels) == 3,
                "tread-link must contain exactly three adjacent native pixels (3x1); E58 may still be pending")
    cx = (b["minLocalX"] + b["maxLocalX"]) / 2
    cy = (b["minLocalY"] + b["maxLocalY"]) / 2
    normalized = [{**p, "localX": rounded(p["localX"] - cx),
                   "localY": rounded(p["localY"] - cy)} for p in pixels]
    return {"width": width, "height": height, "pixels": normalized}


def capsule(distance, half_run=15.0, radius=3.5, center_y=3.0):
    """Offline authored keyframes around a rounded track; no runtime solver."""
    straight = 2 * half_run
    arc = math.pi * radius
    circumference = 2 * straight + 2 * arc
    cycles = math.floor(distance / circumference)
    s = distance - cycles * circumference
    if s < straight:
        x, y, angle = -half_run + s, center_y - radius, 0
    elif s < straight + arc:
        a = -math.pi / 2 + (s - straight) / radius
        x, y, angle = half_run + radius * math.cos(a), center_y + radius * math.sin(a), a + math.pi / 2
    elif s < 2 * straight + arc:
        x, y, angle = half_run - (s - straight - arc), center_y + radius, math.pi
    else:
        a = math.pi / 2 + (s - 2 * straight - arc) / radius
        x, y, angle = -half_run + radius * math.cos(a), center_y + radius * math.sin(a), a + math.pi / 2
    return x, y, angle + cycles * math.tau


def build(base, receipts, contract=None, record_ids=None, target_template_id=None):
    base = copy.deepcopy(base.get("record", base))
    body_by_id = {b["bodyIndex"]: b for b in base.get("bodies", [])}
    require(set(body_by_id) == {0, 1}, "Expected exact two-part pre-M13 tank snapshot")
    require(body_by_id[1].get("aimAtTarget") is True, "Preserve existing body1 native aim pivot")
    require(not base.get("particleAnimationLayers") and not base.get("animationControllerId"),
            "Snapshot already has animation; review before replacing authored animation records")
    require(base.get("characterController", {}).get("enabled") is True, "Tank must retain native CCT")
    require(set(PARTS) <= set(receipts), "Missing generated parts: " + ", ".join(sorted(set(PARTS) - set(receipts))))
    art = {key: centered_part(receipts[key], key) for key in PARTS}
    template_id = target_template_id or base["templateId"]
    record_ids = record_ids or {}
    record_references = []

    def make_id(name):
        value = record_ids.get(name) or str(uuid.uuid5(uuid.NAMESPACE_URL, f"scorched-terra/m13/{template_id}/{name}"))
        require(isinstance(value, str) and bool(value), "Record ID must be a nonempty string: " + name)
        return value
    root_box = bounds(body_by_id[0]["pixels"])
    root_center = ((root_box["minLocalX"] + root_box["maxLocalX"]) / 2,
                   (root_box["minLocalY"] + root_box["maxLocalY"]) / 2)
    material = body_by_id[0]["pixels"][0]["elementType"]
    # Generated RGB is artwork; native image classification may choose a
    # reactive substance for a highlight. Every rig frame stays hull material,
    # including the cosmetic exhaust. Never edit the retained source receipts.
    for source in art.values():
        for pixel in source["pixels"]:
            pixel["elementType"] = material
    bodies = [copy.deepcopy(body_by_id[0]), copy.deepcopy(body_by_id[1])]
    bodies[0]["pixels"] = []
    joints = copy.deepcopy(base.get("joints", []))
    require(all(j["bodyA"] in (-1, 0, 1) and j["bodyB"] in (0, 1) for j in joints),
            "Unexpected existing joint; no existing rig parts may be discarded")
    visual_indices, new_joints, layers, sets, static_frames, clips = [], [], [], [], [], []
    components = []

    def frame_set(key, part_key, dx=0.0, dy=0.0):
        source = art[part_key]
        pixels = [{**p, "localX": rounded(p["localX"] + dx), "localY": rounded(p["localY"] + dy)}
                  for p in source["pixels"]]
        set_id = make_id("set/" + key)
        sets.append({"id": set_id, "name": "m13-" + key,
                     "frames": [{"width": source["width"], "height": source["height"], "pixels": pixels}],
                     "frameRate": 1})
        return set_id

    def sprite_layer(key, body_index, set_id, box, offset=(0, 0), collision=False, always=True):
        layer_id = make_id("sprite/" + key)
        layers.append({"id": layer_id, "name": "m13-" + key, "layerType": "particle-frame",
                       "bindBodyIndex": body_index, "animationSetId": set_id, "loop": True,
                       "offsetX": rounded(offset[0]), "offsetY": rounded(offset[1]),
                       "collision": {"enabled": collision, "shape": "box", "elementType": material,
                                     **box, "padding": 0, "inset": 0}})
        track = {"particleLayerId": layer_id, "animationSetId": set_id, "frameRate": 1}
        if always:
            static_frames.append(track)
        return track

    hull_set = frame_set("hull", "chassis", root_center[0], -7)
    sprite_layer("hull", 0, hull_set, root_box, collision=True)

    def part(key, art_key, x, y, pivot_y=0):
        idx = len(bodies)
        bodies.append({"bodyIndex": idx, "name": "M13 " + key, "role": "other",
                       "isStatic": False, "indestructible": True, "pixels": []})
        visual_indices.append(idx)
        box = bounds(art[art_key]["pixels"])
        set_id = frame_set(key, art_key)
        sprite_layer(key, idx, set_id, box, (x, y))
        joint = {"type": "hinge", "bodyA": 0, "bodyB": idx,
                 "anchorALocalX": rounded(x - root_center[0]),
                 "anchorALocalY": rounded(y + pivot_y - root_center[1]),
                 "anchorBLocalX": 0, "anchorBLocalY": pivot_y,
                 "contactsEnabled": False, "motorSpeed": 0, "motorMaxTorque": 0, "stiffness": 1}
        joints.append(joint)
        new_joints.append(joint)
        components.append({"bodyIndex": idx, "part": art_key, "name": key,
                           "neutralTemplateCenter": {"x": rounded(x), "y": rounded(y)},
                           "frameWidth": art[art_key]["width"], "frameHeight": art[art_key]["height"]})
        return idx, box

    cap, _ = part("turret-bearing", "turret", root_center[0], root_center[1] - 10)
    wheel_indices = [part("wheel-" + str(n), "wheel", x, 3)[0]
                     for n, x in enumerate((-13, -4.5, 4.5, 13))]
    circumference = 60 + 7 * math.pi
    tread_indices, tread_phases = [], []
    for n in range(22):
        phase = circumference * n / 22
        x, y, _ = capsule(phase)
        tread_indices.append(part("tread-" + str(n), "tread-link", x, y)[0])
        tread_phases.append(phase)
    pod_indices, flame_frames = [], []
    for side, x in (("left", -16), ("right", 16)):
        pod, box = part("jet-" + side, "jet-pod", x, -7, pivot_y=-3.5)
        pod_indices.append(pod)
        flame_set = frame_set("flame-" + side, "jet-flame", dy=7.5)
        # The flame's *frame pixels* extend below the nozzle. Keep its hidden
        # anchor envelope equal to its pod's so it cannot move that body's CoM.
        flame_frames.append(sprite_layer("flame-" + side, pod, flame_set, box, (x, -7), always=False))

    def track(idx, frames):
        return {"bodyIndex": idx, "keyframes": frames}

    def pose(percent, x=0, y=0, angle=0, easing="linear"):
        return {"percent": rounded(percent), "offsetX": rounded(x), "offsetY": rounded(y),
                "angle": rounded(angle), "easing": easing}

    def clip(key, duration, tracks, frames=None):
        clip_id = make_id("clip/" + key)
        record_references.append({"kind": "animationClip", "key": "clip/" + key, "id": clip_id})
        value = {"clipId": clip_id, "clipName": "m13-" + key, "entityTemplateId": template_id,
                 "duration": rounded(duration), "iterationCount": 0, "direction": "normal",
                 "fillMode": "both", "delay": 0, "rootMotion": False, "tracks": tracks}
        if frames:
            value["frameTracks"] = frames
        clips.append(value)
        return clip_id

    base_clip = clip("base", 1, [track(cap, [pose(0), pose(100)])], static_frames)
    tread_idle, tread_run = [], []
    for idx, phase in zip(tread_indices, tread_phases):
        x0, y0, a0 = capsule(phase)
        tread_idle.append(track(idx, [pose(0, angle=a0), pose(100, angle=a0)]))
        keys = []
        for n in range(65):
            x, y, a = capsule(phase + circumference * n / 64)
            keys.append(pose(100 * n / 64, x - x0, y - y0, a))
        tread_run.append(track(idx, keys))
    speed = base["characterController"]["runSpeed"]
    require(isinstance(speed, (int, float)) and speed > 0, "Native runSpeed must be positive")
    tread_idle_id = clip("treads-idle", 1, tread_idle)
    tread_run_id = clip("treads-run", circumference / speed, tread_run)
    wheels_idle_id = clip("wheels-idle", 1, [track(i, [pose(0), pose(100)]) for i in wheel_indices])
    wheel_radius = max(art["wheel"]["width"], art["wheel"]["height"]) / 2
    wheels_run_id = clip("wheels-run", math.tau * wheel_radius / speed,
                         [track(i, [pose(n * 25, angle=n * math.pi / 2) for n in range(5)]) for i in wheel_indices])
    folded_id = clip("jets-folded", 1, [track(i, [pose(0, angle=a), pose(100, angle=a)])
                                       for i, a in zip(pod_indices, (math.pi / 2, -math.pi / 2))])
    deployed_id = clip("jets-deployed", 1, [track(i, [pose(0), pose(100)]) for i in pod_indices], flame_frames)

    def state(name, clip_id):
        return {"stateName": name, "clipId": clip_id, "speed": 1, "loop": True}

    def locomotion(name, mask, idle_id, run_id):
        return {"name": name, "blendMode": "override", "weight": 1, "bodyMask": mask,
                "blendTree": {"type": "1d", "parameter": "speed", "entries": [
                    {"threshold": 0, "clipId": idle_id, "speed": 1},
                    {"threshold": 0.05, "clipId": run_id, "speed": 1},
                    {"threshold": 1, "clipId": run_id, "speed": 1}]}}

    transitions = [{"fromState": a, "toState": b,
                    "conditions": [{"parameter": "levitating", "op": "==", "value": v}],
                    "crossfadeDuration": 0.18, "hasExitTime": False,
                    "exitTimePercent": 0, "interruptible": True}
                   for a, b, v in (("folded", "deployed", True), ("deployed", "folded", False))]
    controller = {"controllerId": make_id("controller"), "entityTemplateId": template_id,
                  "parameters": {"speed": {"type": "float", "default": 0},
                                 "direction": {"type": "float", "default": 0},
                                 "levitating": {"type": "bool", "default": False}},
                  "layers": [
                      {"name": "base-art", "blendMode": "override", "weight": 1, "bodyMask": [cap],
                       "stateMachine": {"defaultState": "idle", "states": [state("idle", base_clip)], "transitions": []}},
                      locomotion("treads", tread_indices, tread_idle_id, tread_run_id),
                      locomotion("wheels", wheel_indices, wheels_idle_id, wheels_run_id),
                      {"name": "jetpack", "blendMode": "override", "weight": 1, "bodyMask": pod_indices,
                       "stateMachine": {"defaultState": "folded", "states": [state("folded", folded_id),
                                                                                 state("deployed", deployed_id)],
                                        "transitions": transitions}}]}
    record_references.append({"kind": "animationController", "key": "controller", "id": controller["controllerId"]})
    patch = {"pixels": [], "bodies": bodies, "joints": joints,
             "particleAnimationSets": sets, "particleAnimationLayers": layers,
             "animationControllerId": controller["controllerId"]}
    unresolved = ["E57 confirmed parent-local pose composition fields are required",
                  "E57 must select cosmetic parts on this generic tank without adding patrol AI",
                  "E57 must retain neutral offsets for empty sprite-anchor parts on park/restore"]
    if contract is not None:
        require(contract.get("confirmed") is True and bool(contract.get("reference")), "E57 contract must cite confirmed native schema")
        require(contract.get("cosmeticPartsWithoutAI") is True and contract.get("emptyAnchorRestore") is True,
                "Contract must confirm generic cosmetic-body ownership and empty-anchor restore semantics")
        require(bool(contract.get("patches")), "Supply actual native opt-in field patches")
        targets = {"controller": [controller], "template": [patch],
                   "visualBody": [b for b in bodies if b["bodyIndex"] in visual_indices],
                   "visualJoint": new_joints, "track": [t for c in clips for t in c["tracks"]]}
        for change in contract["patches"]:
            require(change.get("target") in targets and bool(change.get("fields")), "Invalid E57 patch target or empty fields")
            for target in targets[change["target"]]:
                require(not (set(change["fields"]) & set(target)), "E57 opt-in cannot overwrite existing authored rig fields")
                target.update(copy.deepcopy(change["fields"]))
        unresolved = []
    require(bodies[1] == body_by_id[1], "Existing native aim body must remain exact")
    require(joints[:len(base.get("joints", []))] == base.get("joints", []), "Existing aim joint must remain exact")
    return {"version": 1, "status": "ready-for-native-review" if not unresolved else "draft-blocked-on-E57",
            "readyForInstall": not unresolved, "targetTemplateId": template_id,
            "sourceTemplateId": base["templateId"], "recordReferences": record_references,
            "baseSnapshotSha256": digest(base), "artSha256": {k: digest(receipts[k]) for k in PARTS},
            "nativeContract": copy.deepcopy(contract), "unresolved": unresolved,
            "templatePatch": patch, "clips": clips, "controller": controller,
            "manifest": {"components": components, "rootBounds": root_box, "rootAnchorCenter": root_center,
                         "bodyCount": len(bodies), "treadLinkCount": len(tread_indices), "treadLinkSize": [3, 1],
                         "wheelCount": len(wheel_indices), "wheelSize": [art["wheel"]["width"], art["wheel"]["height"]],
                         "trackCircumferencePx": circumference, "nominalTravelPxPerSecond": speed,
                         "controllerPreserved": base["characterController"], "heldItemAnchorPreserved": base.get("heldItemAnchor"),
                         "notes": ["No network calls, live mutations, script pose loops or gameplay changes.",
                                   "Base frame tracks keep every static sprite component visible; flames are thrust-only.",
                                   "Native speed blend crosses to the nominal run loop by 0.05; cosmetic motion is not exact odometry.",
                                   "Native grounded movement controls facing and mirrors clip travel/angles; a second world-direction reversal would double-flip left movement.",
                                   "Root bounds preserve the authored hull AABB; existing native CCT insets remain untouched.",
                                   "Aim body1, existing aim joint and all nonvisual template fields remain unchanged.",
                                   "Every visual frame uses the original hull element, preserving generated RGB; exhaust is cosmetic.",
                                   "Native record save upserts deterministic IDs; --record-ids also supports explicit installer allocation."]}}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", type=Path, default=ROOT / "assets/m13/before/tank-base.json")
    parser.add_argument("--parts-dir", type=Path, default=ROOT / "assets/m13/generated")
    parser.add_argument("--pose-contract", type=Path)
    parser.add_argument("--target-template-id", help="Owned prototype or palette variant receiving this proposal")
    parser.add_argument("--record-ids", type=Path, help="JSON map of recordReferences logical keys to allocated native IDs")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/m13/rig-proposal.json")
    parser.add_argument("--require-ready", action="store_true", help="Refuse a draft while E57 is unresolved")
    args = parser.parse_args()
    missing = [str(args.parts_dir / (k + ".json")) for k in PARTS if not (args.parts_dir / (k + ".json")).exists()]
    require(not missing, "Native part receipts are still required:\n" + "\n".join(missing))
    receipts = {k: json.loads((args.parts_dir / (k + ".json")).read_text()) for k in PARTS}
    contract = json.loads(args.pose_contract.read_text()) if args.pose_contract else None
    record_ids = json.loads(args.record_ids.read_text()) if args.record_ids else None
    proposal = build(json.loads(args.base.read_text()), receipts, contract, record_ids, args.target_template_id)
    require(not args.require_ready or proposal["readyForInstall"], "; ".join(proposal["unresolved"]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proposal, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "status": proposal["status"],
                      "bodies": proposal["manifest"]["bodyCount"], "clips": len(proposal["clips"]),
                      "unresolved": proposal["unresolved"]}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as exc:
        raise SystemExit("M13 rig proposal refused: " + str(exc))
