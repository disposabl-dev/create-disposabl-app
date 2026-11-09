#!/usr/bin/env python3
"""Inspect an isolated iOS simulator fixture; build records are attestations, not proof of a build."""
import argparse
import hashlib
import json
import plistlib
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def inspect(app, record, source, app_id, group, backend, site, hermesc):
    for url in (backend, site):
        parsed = urlsplit(url)
        if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError('backend and site must be explicit HTTP 127.0.0.1 ports')
    if not app_id.endswith('.preview') or group != 'local.' + app_id:
        raise ValueError('expected isolated preview app ID and local keychain group')
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    if info['CFBundleIdentifier'] != app_id:
        raise ValueError('bundle ID mismatch')
    binary = app / info['CFBundleExecutable']
    if 'platform IOSSIMULATOR' not in run('xcrun', 'vtool', '-arch', 'arm64', '-show-build', str(binary)):
        raise ValueError('arm64 iOS simulator platform required')
    sections = run('otool', '-arch', 'arm64', '-l', str(binary))
    if not all('sectname ' + name in sections for name in ('__entitlements', '__ents_der')):
        raise ValueError('missing simulated entitlement sections')
    output = run('otool', '-arch', 'arm64', '-s', '__TEXT', '__entitlements', str(binary))
    raw = bytearray()
    for line in output.splitlines():
        parts = line.split()
        if parts and re.fullmatch(r'[0-9a-fA-F]{16}', parts[0]):
            for word in parts[1:]:
                if not re.fullmatch(r'[0-9a-fA-F]{8}', word):
                    raise ValueError('unexpected entitlement section format')
                raw.extend(bytes.fromhex(word)[::-1])
    start, end = raw.find(b'<?xml'), raw.find(b'</plist>')
    if start < 0 or end < 0:
        raise ValueError('missing simulator entitlement plist')
    entitlements = plistlib.loads(raw[start:end + len(b'</plist>')])
    if entitlements.get('application-identifier') != group or entitlements.get('keychain-access-groups') != [group]:
        raise ValueError('simulator entitlement identity mismatch')
    if plistlib.loads((app / 'Expo.plist').read_bytes()).get('EXUpdatesEnabled') is not False:
        raise ValueError('updates must be disabled')
    bundle = (app / 'main.jsbundle').read_bytes()
    # Hermes packs adjacent strings without delimiters. Use its string table,
    # not raw substrings, so a longer port or path cannot satisfy the check.
    dump = run(hermesc, '-b', '-dump-bytecode', str(app / 'main.jsbundle'))
    strings = set(re.findall(r'^s\d+\[ASCII, \d+\.\.\d+\]: ([^\r\n]*)$', dump, re.MULTILINE))
    if not all(url in strings for url in (backend, site)):
        raise ValueError('embedded backend URLs missing')
    expected = {'source_revision': run('git', '-C', str(source), 'rev-parse', 'HEAD').strip(),
                'js_sha256': hashlib.sha256(bundle).hexdigest(), 'app_id': app_id,
                'backend': backend, 'site': site, 'e2e': True, 'telemetry_disabled': True,
                'updates_disabled': True, 'payments_disabled': True}
    flags = ('e2e', 'telemetry_disabled', 'updates_disabled', 'payments_disabled')
    if not isinstance(record, dict) or any(type(record.get(flag)) is not bool for flag in flags) or record != expected or not re.fullmatch(r'[0-9a-f]{40}', expected['source_revision']):
        raise ValueError('build record does not match requested inputs and embedded JS')
    return expected


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ('app', 'record', 'source', 'app-id', 'group', 'backend', 'site', 'hermesc'):
        p.add_argument('--' + arg, required=True)
    a = p.parse_args()
    try:
        result = inspect(Path(a.app), json.loads(Path(a.record).read_text()), Path(a.source), a.app_id, a.group, a.backend, a.site, a.hermesc)
        print(json.dumps(result, indent=2))
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as e:
        p.exit(1, f'preflight failed: {e}\n')


if __name__ == '__main__':
    main()
