#!/usr/bin/env python3
"""List compatible, shut-down iPhone templates, preferring stocked iPhone 17s."""
import json
import sys
from pathlib import Path

runtimes_path, devices_path, minimum = sys.argv[1:]
def version(s):
    return tuple(int(x) for x in s.split('.'))
valid = {}
for runtime in json.loads(Path(runtimes_path).read_text())['runtimes']:
    if runtime.get('isAvailable') and runtime['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-') and version(runtime['version']) >= version(minimum):
        valid[runtime['identifier']] = runtime['version']
rows = []
for runtime, devices in json.loads(Path(devices_path).read_text())['devices'].items():
    if runtime not in valid:
        continue
    for device in devices:
        if device.get('isAvailable') and device.get('state') == 'Shutdown' and device.get('name', '').startswith('iPhone'):
            ver = valid[runtime]
            preference = 0 if ver.startswith('26.4') else 1 if ver.startswith('26.2') else 2
            rows.append((device['name'] != 'iPhone 17', preference, tuple(-n for n in version(ver)), device['name'], device['udid'], runtime))
for _, _, _, name, udid, runtime in sorted(rows):
    print(f'{udid}\t{runtime}\t{name}')
