#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

validator = Path(__file__).with_name('ios-preview-cache-validate.py')
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
print('Validated matching cache and rejected fingerprint, config, digest and ZIP mismatches')
