#!/usr/bin/env python3
"""Exercise signing and submission branches without credentials or network."""
import hashlib
import base64
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[2]
script = (root / '.github/scripts/mobile.sh').read_text()
functions = script.split('case "${1:?operation required}" in')[0]
real_keytool = shutil.which('keytool')
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
        assert not list(path.glob('android-signing.*')), 'Signing left private temporary files'
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
    original_eas = '{"submit":{"production":{"android":{}}}}'
    (mobile / 'eas.json').write_text(original_eas)
    # Signature verification is tested with real signed JAR bytes below.
    for name, content in {'gh': 'printf source', 'bun': 'printf submitted', 'node': 'exit 0'}.items():
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
    assert not list(path.glob('android-submit.*'))
    assert (mobile / 'eas.json').read_text() == original_eas
    (path / 'bun').write_text('#!/bin/bash\nexit 23\n')
    result = subprocess.run(command, cwd=mobile, env=submit_env, capture_output=True, text=True)
    assert result.returncode == 23
    assert not list(path.glob('android-submit.*'))
    assert (mobile / 'eas.json').read_text() == original_eas
    workflow = (root / '.github/workflows/pipeline.yml').read_text()
    assert "vars.ANDROID_PLAY_SUBMIT == 'true'" in workflow
    assert 'DISPOSABL_ANDROID_PLAY_ENABLED' not in workflow
    assert 'python3 .github/scripts/android-release.test.py' in workflow
    assert 'wanted.signing === "fallback"' in script and 'signingId: $signingId' in script
    assert 'ANDROID_PLAY_SERVICE_ACCOUNT:?' in script and 'ANDROID_PLAY_TRACK:?' in script
    assert 'EXPO_PUBLIC_CONVEX_URL' in workflow and 'DISPOSABL_ANDROID_CHANNEL: *channel' in workflow
    assert 'com.yastai.disposabl' not in (root / 'apps/mobile/eas.json').read_text()
    # Use a disposable real JKS with distinct store/key passwords. Nothing here
    # reads or changes a developer's signing credentials.
    keytool.unlink()
    real_env = dict(os.environ, HOME=temp, RUNNER_TEMP=temp)
    real_env['STORE_PASSWORD'] = 'fixture-store-password'
    real_env['KEY_PASSWORD'] = 'fixture-key-password'
    keystore = path / 'fixture.jks'
    subprocess.run([real_keytool, '-genkeypair', '-keystore', str(keystore),
                    '-storetype', 'JKS', '-storepass:env', 'STORE_PASSWORD',
                    '-keypass:env', 'KEY_PASSWORD', '-alias', 'fixture',
                    '-dname', 'CN=Disposable fixture', '-keyalg', 'RSA',
                    '-keysize', '2048', '-validity', '2'], env=real_env,
                   capture_output=True, check=True, timeout=30)
    encoded = base64.b64encode(keystore.read_bytes()).decode()
    values = {'ANDROID_KEYSTORE_BASE64': encoded,
              'ANDROID_KEYSTORE_PASSWORD': real_env['STORE_PASSWORD'],
              'ANDROID_KEY_PASSWORD': real_env['KEY_PASSWORD'],
              'ANDROID_KEY_ALIAS': 'fixture'}
    certificate = subprocess.run([real_keytool, '-exportcert', '-keystore', str(keystore),
                    '-storepass:env', 'STORE_PASSWORD', '-alias', 'fixture'], env=real_env,
                    capture_output=True, check=True, timeout=30).stdout
    digest = hashlib.sha256(certificate).hexdigest()
    env = real_env
    check(values, True, 'mode=release id=' + digest)
    bundle = dict(zip(['keystoreBase64', 'storePassword', 'keyAlias', 'keyPassword'],
                      [encoded, real_env['STORE_PASSWORD'], 'fixture', real_env['KEY_PASSWORD']]))
    check({'DISPOSABL_ANDROID_SIGNING': json.dumps(bundle)}, True, 'mode=release id=' + digest)
    for name, bad in [('ANDROID_KEYSTORE_BASE64', '!'), ('ANDROID_KEYSTORE_PASSWORD', 'bad-store'),
                      ('ANDROID_KEY_PASSWORD', 'bad-key'), ('ANDROID_KEY_ALIAS', 'missing')]:
        check(values | {name: bad}, False)
    check(values | {'DISPOSABL_ANDROID_SIGNING': json.dumps(bundle)}, False)
    # A signed ZIP exercises the actual JAR signature verifier used for AABs;
    # it is deliberately not represented as a valid Android application bundle.
    import zipfile
    signed = path / 'signed.aab'
    with zipfile.ZipFile(signed, 'w') as archive:
        archive.writestr('fixture.txt', 'owned signing fixture')
    subprocess.run(['jarsigner', '-keystore', str(keystore), '-storepass:env', 'STORE_PASSWORD',
                    '-keypass:env', 'KEY_PASSWORD', str(signed), 'fixture'], env=real_env,
                   capture_output=True, check=True, timeout=30)
    verify = ['node', str(root / '.github/scripts/android-signatures.mjs'), str(signed)]
    result = subprocess.run(verify + [digest], env=real_env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0 and result.stdout.strip() == digest, result.stderr
    assert subprocess.run(verify + ['0' * 64], env=real_env, capture_output=True, timeout=30).returncode != 0
    with zipfile.ZipFile(signed, 'a') as archive:
        archive.writestr('unsigned.txt', 'must reject')
    assert subprocess.run(verify + [digest], env=real_env, capture_output=True, timeout=30).returncode != 0
print('Android release scenarios passed')
