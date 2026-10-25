#!/usr/bin/env python3
"""Talus HTTP client. Credentials stay on this machine, outside the repository."""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORLD_ID = "d9fa0363-0172-a96e-9b10-0b0c3d9a1f58"

def call(name, args=None, timeout=120):
    token_file = Path(os.environ.get("TALUS_TOKEN_FILE", str(Path.home() / "Library/Application Support/Talus/bridge-token")))
    token = token_file.read_text().strip()
    base = os.environ.get("TALUS_BRIDGE_URL", "http://127.0.0.1:3702")
    req = urllib.request.Request(base + "/v1/tools/" + name,
        data=json.dumps(args or {}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{name}: HTTP {error.code}: {error.read().decode()}") from None
    if isinstance(result, dict) and (result.get("ok") is False or result.get("isError") is True):
        raise RuntimeError(f"{name}: {json.dumps(result)}")
    return result

def script(source, timeout=120):
    return call("engine_run_script", {"source": source, "timeoutMs": timeout * 1000}, timeout + 10)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("tool")
    p.add_argument("arguments", nargs="?", default="{}", help="JSON or @path")
    p.add_argument("--output")
    a = p.parse_args()
    raw = Path(a.arguments[1:]).read_text() if a.arguments.startswith("@") else a.arguments
    result = call(a.tool, json.loads(raw))
    output = json.dumps(result, indent=2)
    if a.output:
        Path(a.output).write_text(output + "\n")
        print(json.dumps({"saved": a.output, "bytes": len(output)}))
    else:
        print(output)
