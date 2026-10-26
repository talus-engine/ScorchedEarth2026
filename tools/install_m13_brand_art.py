"""Install large branding images using bounded public-API byte writes and native readback."""
import json
import hashlib
import argparse
from bridge import ROOT, WORLD_ID, call, script

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--title-bands', action='store_true', help='Install the particle logo image and prepared material masks')
args = parser.parse_args()
if args.title_bands:
    manifest = json.loads((ROOT / 'assets/m13/title-particle-logo.json').read_text())
    paths = (manifest['particleImage']['file'], *(a['file'] for a in manifest['assets']))
else:
    paths = ('Art/scorched-terra-title.png', 'Art/scorched-terra-title.webp', 'Game/Publishing/icon.png')
context = call('engine_describe_context')
assert context['world']['isEditorMode'] and context['world']['templateId'] == WORLD_ID
receipts = []
for path in paths:
    data = (ROOT / 'world' / path).read_bytes()
    # Keep each HTTP request below the bridge limit; the public file API
    # joins each prefix in the engine realm, without any private DB access.
    for offset in range(0, len(data), 256 * 1024):
        chunk = data[offset:offset + 256 * 1024]
        source = ('const path=' + json.dumps(path) + ',hex=' + json.dumps(chunk.hex()) + ';'
                  'const previous=' + ('await talus.files.readBytes(path)' if offset else 'new Uint8Array(0)') + ';'
                  'if(!previous||previous.length!==' + str(offset) + ')throw Error("Upload prefix mismatch");'
                  'const bytes=new Uint8Array(previous.length+hex.length/2);bytes.set(previous);'
                  'for(let i=0;i<hex.length/2;i++)bytes[previous.length+i]=parseInt(hex.slice(i*2,i*2+2),16);'
                  'await talus.files.writeBytes(path,bytes);return bytes.length;')
        uploaded = script(source, timeout=120)
        assert uploaded['ok'] and uploaded['value'] == offset + len(chunk), uploaded.get('error')
    expected = 2166136261
    for b in data:
        expected = ((expected ^ b) * 16777619) & 0xffffffff
    source = ('const path=' + json.dumps(path) + ';const actual=await talus.files.readBytes(path);'
              'if(!actual)throw Error("Missing image");let hash=2166136261;'
              'for(const b of actual)hash=Math.imul(hash^b,16777619)>>>0;'
              'return {path,bytes:actual.length,hash};')
    result = script(source, timeout=120)
    assert result['ok'], result.get('error')
    assert result['value']['bytes'] == len(data) and result['value']['hash'] == expected, 'Native image readback mismatch'
    receipts.append({**result['value'], 'sha256': hashlib.sha256(data).hexdigest(), 'nativeReadback': True})
    print(json.dumps(result['value']), flush=True)
dest = ROOT / 'assets/m13' / ('title-bands-install.json' if args.title_bands else 'branding-install.json')
dest.write_text(json.dumps(receipts, indent=2) + '\n')
