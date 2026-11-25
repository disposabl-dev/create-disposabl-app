#!/usr/bin/env python3
"""Refresh the build counters in a disposable, repacked simulator app."""
import json
import plistlib
import re
import sys
from pathlib import Path

original, result, build = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3]
if original == result or original in result.parents or result in original.parents:
    raise SystemExit('Original and result must be separate app bundles')
if not re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,2}', build):
    raise SystemExit('Invalid iOS build number')
android_version = int(sys.argv[4])
if not 1 <= android_version <= 2100000000:
    raise SystemExit('Invalid Android version code')
for app in (original, result):
    if not app.is_dir() or any(p.suffix in ('.app', '.appex') for p in app.rglob('*') if p.is_dir()):
        raise SystemExit('Expected an app without nested applications or extensions')

def read(app):
    plist_path = app / 'Info.plist'
    config_path = app / 'EXConstants.bundle' / 'app.config'
    raw = plist_path.read_bytes()
    plist = plistlib.loads(raw)
    config = json.loads(config_path.read_bytes())
    prior = plist.pop('CFBundleVersion')
    config_prior = config['ios'].pop('buildNumber')
    if not isinstance(prior, str) or prior != config_prior:
        raise SystemExit('Original build number metadata is missing or inconsistent')
    android_prior = config['android'].pop('versionCode')
    if type(android_prior) is not int or not 1 <= android_prior <= 2100000000:
        raise SystemExit('Original Android version code metadata is invalid')
    return plist, config, (prior, android_prior), raw.startswith(b'bplist')

old_plist, old_config, old_counters, _ = read(original)
new_plist, new_config, current_counters, binary = read(result)
if old_counters != current_counters or old_plist != new_plist or old_config != new_config:
    raise SystemExit('Repacked metadata differs from the original')
new_plist['CFBundleVersion'] = build
new_config['ios']['buildNumber'] = build
new_config['android']['versionCode'] = android_version
(result / 'Info.plist').write_bytes(plistlib.dumps(new_plist, fmt=plistlib.FMT_BINARY if binary else plistlib.FMT_XML, sort_keys=False))
(result / 'EXConstants.bundle' / 'app.config').write_text(json.dumps(new_config, ensure_ascii=False, separators=(',', ':')))
verified_plist, verified_config, verified_counters, _ = read(result)
if verified_counters != (build, android_version) or verified_plist != old_plist or verified_config != old_config:
    raise SystemExit('Build counter metadata attestation failed')
print(f'Updated and attested build counters {old_counters} -> {verified_counters}')
