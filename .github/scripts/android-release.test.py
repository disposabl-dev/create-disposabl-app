#!/usr/bin/env python3
"""Exercise signing and submission branches without credentials or network."""
import hashlib
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[2]
script = (root / '.github/scripts/mobile.sh').read_text()
functions = script.split('case "${1:?operation required}" in')[0]
with tempfile.TemporaryDirectory() as temp:
    path = pathlib.Path(temp)
    keytool = path / 'keytool'
    keytool.write_text('#!/bin/bash\ncase "$1" in -exportcert) printf certificate;; esac\n')
    keytool.chmod(0o755)
    env = {'PATH': f'{temp}:/usr/bin:/bin:/usr/sbin:/sbin', 'RUNNER_TEMP': temp, 'HOME': temp}
    def check(extra, success, expected=''):
        result = subprocess.run(['/bin/bash', '-c', functions + '\nsigning; printf "mode=%s id=%s" "$ANDROID_SIGNING_MODE" "$ANDROID_SIGNING_ID"'], env=env | extra, capture_output=True, text=True)
        assert (result.returncode == 0) == success, result.stderr
        assert expected in result.stdout, result.stdout
    check({}, True, 'mode=fallback id=fallback')
    check({'ANDROID_KEY_ALIAS': 'dummy'}, False)
    check({'DISPOSABL_ANDROID_SIGNING': '{}'}, False)
    check({'ANDROID_KEYSTORE_BASE64': 'eA==', 'ANDROID_KEYSTORE_PASSWORD': 'dummy', 'ANDROID_KEY_ALIAS': 'dummy', 'ANDROID_KEY_PASSWORD': 'dummy'}, True, 'mode=release id=')
    mobile = path / 'apps/mobile'
    mobile.mkdir(parents=True)
    (path / 'dist/release').mkdir(parents=True)
    (path / 'dist/release/android.aab').write_text('fixture')
    digest = hashlib.sha256(b'fixture').hexdigest()
    (path / 'dist/release/android.json').write_text('{"signing":"release","signingId":"' + 'a' * 64 + '","aabSha256":"' + digest + '"}')
    (mobile / 'eas.json').write_text('{"submit":{"production":{"android":{}}}}')
    for name, content in {'gh': 'printf source', 'bun': 'printf submitted'}.items():
        stub = path / name
        stub.write_text('#!/bin/bash\n' + content + '\n')
        stub.chmod(0o755)
    submit_env = env | {'EXPO_TOKEN': 'dummy', 'EXPO_PROJECT_ID': 'dummy', 'GH_REPO': 'fixture', 'SOURCE_PATH': 'fixture', 'SOURCE': 'source', 'EAS_CLI': 'fixture', 'ANDROID_PLAY_TRACK': 'internal', 'ANDROID_PLAY_UPLOAD_CERT_SHA256': 'a' * 64}
    command = ['/bin/bash', str(root / '.github/scripts/mobile.sh'), 'android-submit']
    result = subprocess.run(command, cwd=mobile, env=submit_env, capture_output=True, text=True)
    assert result.returncode != 0 and 'ANDROID_PLAY_SERVICE_ACCOUNT' in result.stderr
    submit_env['ANDROID_PLAY_SERVICE_ACCOUNT'] = '{"type":"service_account","client_email":"fixture","private_key":"fixture"}'
    mismatch = subprocess.run(command, cwd=mobile, env=submit_env | {'ANDROID_PLAY_UPLOAD_CERT_SHA256': 'b' * 64}, capture_output=True, text=True)
    assert mismatch.returncode != 0 and 'certificate mismatch' in mismatch.stderr
    result = subprocess.run(command, cwd=mobile, env=submit_env, capture_output=True, text=True)
    assert result.returncode == 0 and 'submitted' in result.stdout, result.stderr
    assert not (path / 'play-service-account.json').exists()
    workflow = (root / '.github/workflows/pipeline.yml').read_text()
    assert "vars.ANDROID_PLAY_SUBMIT == 'true'" in workflow
    assert "github.repository == 'disposabl-dev/create-disposabl-app' && vars.DISPOSABL_ANDROID_PLAY_ENABLED == 'true'" in workflow
    assert 'wanted.signing === "fallback"' in script and 'signingId: $signingId' in script
    assert 'ANDROID_PLAY_SERVICE_ACCOUNT:?' in script and 'ANDROID_PLAY_TRACK:?' in script
    assert 'EXPO_PUBLIC_CONVEX_URL' in workflow and 'DISPOSABL_ANDROID_CHANNEL: *channel' in workflow
    assert 'com.yastai.disposabl' not in (root / 'apps/mobile/eas.json').read_text()
print('Android release scenarios passed')
