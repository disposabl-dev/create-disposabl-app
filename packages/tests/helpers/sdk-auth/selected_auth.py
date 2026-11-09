"""Verify that the installed auth package is the selected reproducible archive."""
import hashlib
import json
from pathlib import Path
import tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_selected_auth(root, installed=None):
    root = Path(root).resolve()
    selection = json.loads((root / 'package.json').read_text())['catalog']['@convex-dev/auth']
    if not isinstance(selection, str) or not selection.startswith('file:vendor/'):
        raise RuntimeError('Expected a locally selected auth archive')
    archive = (root / selection[5:]).resolve()
    if archive.parent != (root / 'vendor').resolve() or not archive.is_file():
        raise RuntimeError('Invalid selected auth archive')
    expected = {}
    with tarfile.open(archive, 'r:gz') as bundle:
        for member in bundle.getmembers():
            if not member.isfile():
                continue
            path = Path(member.name)
            if len(path.parts) < 2 or path.parts[0] != 'package' or '..' in path.parts:
                raise RuntimeError('Invalid selected auth archive contents')
            name = str(Path(*path.parts[1:]))
            if name in expected:
                raise RuntimeError('Duplicate selected auth archive file')
            expected[name] = digest(bundle.extractfile(member).read())
    if 'package.json' not in expected:
        raise RuntimeError('Selected auth archive has no manifest')
    installed = Path(installed or root / 'node_modules/@convex-dev/auth').resolve()
    actual = {
        str(path.relative_to(installed)): digest(path.read_bytes())
        for path in installed.rglob('*')
        if path.is_file() and 'node_modules' not in path.relative_to(installed).parts
        and str(path.relative_to(installed)) != '.bun-tag'
    }
    if actual != expected:
        raise RuntimeError('Installed auth bytes differ from the selected archive')
    manifest = json.loads((installed / 'package.json').read_text())
    if manifest.get('name') != '@convex-dev/auth':
        raise RuntimeError('Installed auth manifest has an unexpected name')
    return {'archive': str(archive), 'sha256': digest(archive.read_bytes()),
            'version': manifest['version'], 'files': len(expected)}
