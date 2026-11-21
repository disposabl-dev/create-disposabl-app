#!/usr/bin/env python3
import hashlib
import json
import os
import plistlib
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

validator = Path(__file__).with_name('ios-preview-cache-validate.py')
metadata = Path(__file__).with_name('ios-preview-build-number.py')
repack = Path(__file__).with_name('ios-preview-repack.sh')
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    identity = {'repo': 'example/app', 'pr': '92', 'runtime': 'fingerprint-a', 'config_sha256': 'config-a'}
    archive = root / 'app.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        z.writestr('App.app/Info.plist', 'fixture')
    record = {**identity, 'source_sha': 'a' * 40, 'source_run': '123', 'build': '1', 'method': 'native', 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    def check(expected, record_value, success):
        (root / 'identity.json').write_text(json.dumps(expected))
        (root / 'manifest.json').write_text(json.dumps(record_value))
        result = subprocess.run([sys.executable, str(validator), str(root / 'identity.json'), str(root / 'manifest.json'), str(archive)], capture_output=True)
        assert (result.returncode == 0) == success, result.stderr.decode()
    check(identity, record, True)
    check({**identity, 'runtime': 'fingerprint-b'}, record, False)
    check({**identity, 'config_sha256': 'config-b'}, record, False)
    check(identity, {**record, 'archive_sha256': '0' * 64}, False)
    archive.write_bytes(b'not a zip')
    check(identity, {**record, 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, False)

    plist = {'CFBundleVersion': '1', 'CFBundleIdentifier': 'example.app'}
    config = {'ios': {'buildNumber': '1'}, 'android': {'versionCode': 1, 'package': 'example.app'}}
    original = root / 'Original.app'
    repacked = root / 'Repacked.app'
    for app in (original, repacked):
        (app / 'EXConstants.bundle').mkdir(parents=True)
        (app / 'Info.plist').write_bytes(plistlib.dumps(plist, fmt=plistlib.FMT_BINARY))
        (app / 'EXConstants.bundle/app.config').write_text(json.dumps(config))
    args = [sys.executable, str(metadata), str(original), str(repacked), '42', '43']
    subprocess.run(args, check=True)
    assert plistlib.loads((repacked / 'Info.plist').read_bytes()) == {**plist, 'CFBundleVersion': '42'}
    assert json.loads((repacked / 'EXConstants.bundle/app.config').read_text()) == {
        'ios': {'buildNumber': '42'}, 'android': {'versionCode': 43, 'package': 'example.app'}
    }
    assert plistlib.loads((original / 'Info.plist').read_bytes()) == plist
    assert json.loads((original / 'EXConstants.bundle/app.config').read_text()) == config
    result = subprocess.run(args, capture_output=True)
    assert result.returncode != 0 and b'Repacked metadata differs' in result.stderr

    bin_dir = root / 'bin'
    bin_dir.mkdir()
    for command, body in {
        'gh': 'printf "%s\n" "$SOURCE"',
        'xcodebuild': 'echo "Xcode 27.2"',
        'xcrun': 'echo "Fixture SDK"',
        'bun': '''if [[ "$3" == expo ]]; then
          jq -n --arg project "$EXPO_PROJECT_ID" --arg build "$DISPOSABL_IOS_BUILD_NUMBER" \
            --argjson android "$DISPOSABL_ANDROID_VERSION_CODE" \
            '{version:"1.0",extra:{eas:{projectId:$project}},ios:{bundleIdentifier:"example.app",buildNumber:$build},android:{versionCode:$android}}'
        else
          jq -n '{fingerprintSources:[],runtimeVersion:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
        fi''',
    }.items():
        path = bin_dir / command
        path.write_text(f'#!/bin/bash\n{body}\n')
        path.chmod(0o700)
    output = root / 'output'
    env = {
        **os.environ, 'PATH': f'{bin_dir}:{os.environ["PATH"]}', 'RUNNER_TEMP': str(root),
        'GITHUB_WORKSPACE': str(root), 'GITHUB_OUTPUT': str(output), 'GH_REPO': 'example/app',
        'PR_NUMBER': '92', 'SOURCE': 'a' * 40, 'SOURCE_PATH': 'pulls/92', 'CHANNEL': 'pr-92',
        'EXPO_TOKEN': 'fixture-token', 'EXPO_PROJECT_ID': 'fixture-project',
        'CONVEX_URL': 'https://ci.invalid', 'PUBLIC_SITE_URL': 'https://ci.invalid',
        'NATIVE_INPUT_HASH': 'fixture-inputs',
    }
    def key(build, expo_env):
        (root / 'expo.env').write_text(expo_env)
        output.write_text('')
        result = subprocess.run(
            ['bash', str(repack.resolve()), 'identity'],
            env={**env, 'DISPOSABL_IOS_BUILD_NUMBER': str(build), 'DISPOSABL_ANDROID_VERSION_CODE': str(build)},
            capture_output=True, check=True,
        )
        identity_json = (root / 'ios-preview-repack/identity.json').read_text()
        assert 'fixture-token' not in identity_json and 'fixture-value' not in identity_json
        assert not result.stdout and not result.stderr
        return output.read_text().strip()
    static = key(41, 'USE_FRAMEWORKS=static\nTEST_SETTING=fixture-value\n')
    assert static == key(42, '# exported again\nTEST_SETTING=fixture-value\nUSE_FRAMEWORKS=static\n')
    assert static != key(43, 'USE_FRAMEWORKS=dynamic\nTEST_SETTING=fixture-value\n')
print('Verified both build counters, EAS environment changes, archive identity and integrity')
