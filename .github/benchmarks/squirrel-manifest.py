import hashlib
import json
import os
from pathlib import Path
from zipfile import ZipFile

root = Path('dist')
archives = list((root / 'update/production/win32/x64').glob('*-full.nupkg'))
setups = list((root / 'release').glob('*Setup.exe'))
if len(archives) != 1 or len(setups) != 1:
    raise SystemExit('Expected one full update package and one Setup.exe')
archive, setup = archives[0], setups[0]
data = archive.read_bytes()
release_archive = root / 'release' / archive.name
if not release_archive.is_file() or release_archive.read_bytes() != data:
    raise SystemExit('Staged update package differs from release package')
release = (archive.parent / 'RELEASES').read_text(encoding='utf-8-sig').strip()
if (root / 'release/RELEASES').read_text(encoding='utf-8-sig').strip() != release:
    raise SystemExit('Staged RELEASES differs from release record')
if release != f'{hashlib.sha1(data).hexdigest().upper()} {archive.name} {len(data)}':
    raise SystemExit('RELEASES SHA-1, filename or byte count is wrong')
if setup.read_bytes()[:2] != b'MZ':
    raise SystemExit('Setup is not a PE executable')
with ZipFile(archive) as z:
    corrupt = z.testzip()
    if corrupt:
        raise SystemExit(f'Corrupt ZIP entry: {corrupt}')
    entries = {p.filename: hashlib.sha256(z.read(p)).hexdigest() for p in z.infolist()
               if p.filename.lower().startswith('lib/net45/') and not p.is_dir()}
if not entries:
    raise SystemExit('No extracted application files in full package')
result = {'entries': entries, 'package_size': len(data), 'setup_size': setup.stat().st_size,
          'package_sha256': hashlib.sha256(data).hexdigest(),
          'setup_sha256': hashlib.sha256(setup.read_bytes()).hexdigest(), 'release': release}
Path(os.environ['RUNNER_TEMP'], 'squirrel-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
print(f'Verified {len(entries)} application entries; package={len(data)} bytes; Setup={setup.stat().st_size} bytes')
