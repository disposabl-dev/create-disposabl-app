#!/usr/bin/env python3
"""Validate cached native preview archive before extracting or repacking."""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath

identity, manifest, archive = map(Path, sys.argv[1:])
expected = json.loads(identity.read_bytes())
record = json.loads(manifest.read_bytes())
metadata = {'source_sha', 'archive_sha256', 'source_run', 'build', 'method'}
if {k: v for k, v in record.items() if k not in metadata} != expected:
    raise SystemExit('Cached identity mismatch')
if not (record.get('method') == 'native' and re.fullmatch(r'[a-f0-9]{40}', record.get('source_sha', '')) and re.fullmatch(r'[0-9]+', record.get('source_run', '')) and re.fullmatch(r'[0-9]+(?:\.[0-9]+){0,2}', record.get('build', ''))):
    raise SystemExit('Invalid native cache provenance')
digest = hashlib.sha256()
with archive.open('rb') as data:
    for chunk in iter(lambda: data.read(1024 * 1024), b''):
        digest.update(chunk)
if digest.hexdigest() != record.get('archive_sha256'):
    raise SystemExit('Cached archive digest mismatch')
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        path = PurePosixPath(entry.filename)
        if path.is_absolute() or '..' in path.parts:
            raise SystemExit('Unsafe cache archive path')
    if z.testzip() is not None:
        raise SystemExit('Corrupt cache archive')
print('Native cache identity, provenance and archive verified')
