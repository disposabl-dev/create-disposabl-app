"""Snapshot the candidate and component bytes used by the local-only proof."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files(directory):
    return {str(p.relative_to(directory)): digest(p.read_bytes())
            for p in sorted(directory.rglob('*'))
            if p.is_file() and 'node_modules' not in p.relative_to(directory).parts}


def verify_mcp(source, installed_hashes):
    record_path = source / 'packages/tests/fixtures/account-deletion-convex/local/mcp-provenance.json'
    record = json.loads(record_path.read_text())
    package = json.loads((source / 'package.json').read_text())
    selected = package['catalog']['@convex-dev/mcp']
    dependency = '@convex-dev/mcp@' + selected
    patch = package['patchedDependencies'][dependency]
    match = re.search(r'^\s*"@convex-dev/mcp": (\[.*\]),?$',
                      (source / 'bun.lock').read_text(), re.MULTILINE)
    locked = json.loads(match.group(1)) if match else None
    if (record['name'] != '@convex-dev/mcp' or record['version'] != selected
            or not locked or locked[0] != dependency
            or locked[-1] != record['upstreamIntegrity']
            or patch != record['patch']
            or digest((source / patch).read_bytes()) != record['patchSha256']):
        raise RuntimeError('MCP provenance does not match the selected dependency and patch')
    # Bun installation tags are not package code. Retain their hashes in the
    # run manifest, but compare all other files, including unexpected additions.
    actual = {name: value for name, value in installed_hashes.items()
              if not re.fullmatch(r'\.bun-tag(?:-[0-9a-f]+)?', name)}
    if actual != record['files']:
        raise RuntimeError('Installed MCP bytes differ from the verified patched dependency')
    return {'recordSha256': digest(record_path.read_bytes()),
            'upstreamIntegrity': record['upstreamIntegrity'],
            'patchSha256': record['patchSha256'], 'files': len(actual)}


def prepare(checkout, work):
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
    archive = work / 'source.tar'
    subprocess.run(['git', 'archive', '--format=tar', '--output', str(archive), sha],
                   cwd=checkout, check=True)
    source = work / 'source'
    source.mkdir()
    # This archive was generated above from the selected Git commit, not supplied
    # externally. Use the system tar so the runner also works with macOS Python.
    subprocess.run(['/usr/bin/tar', '-xf', str(archive), '-C', str(source)], check=True)
    manifest = {'commit': sha, 'sourceArchiveSha256': digest(archive.read_bytes()), 'components': {}}
    catalog = json.loads((source / 'package.json').read_text())['catalog']
    modules = source / 'node_modules'
    modules.mkdir()
    for dep in (checkout / 'node_modules').iterdir():
        target = modules / dep.name
        if dep.name.startswith('@') and dep.is_dir():
            target.mkdir()
            for package in dep.iterdir():
                name = f'{dep.name}/{package.name}'
                dest = target / package.name
                if name in ('@convex-dev/auth', '@convex-dev/mcp'):
                    installed = package.resolve()
                    shutil.copytree(installed, dest, ignore=shutil.ignore_patterns('node_modules'))
                    hashes = files(dest)
                    if hashes != files(installed):
                        raise RuntimeError('Component changed while being copied')
                    manifest['components'][name] = hashes
                    # Preserve dependency resolution, but the component's own code is frozen above.
                    (dest / 'node_modules').symlink_to(installed.parent.parent, target_is_directory=True)
                elif name == '@disposabl/disposabl-kit':
                    dest.symlink_to(source / 'packages/disposabl-kit', target_is_directory=True)
                else:
                    dest.symlink_to(package.resolve(), target_is_directory=package.is_dir())
        else:
            target.symlink_to(dep.resolve(), target_is_directory=dep.is_dir())
    selection = catalog['@convex-dev/auth']
    if not selection.startswith('file:vendor/'):
        raise RuntimeError('Fixture expects the selected reproducible auth archive')
    auth_archive = source / selection[5:]
    expected = {}
    with tarfile.open(auth_archive) as bundle:
        for member in bundle.getmembers():
            if member.isfile():
                name = str(Path(member.name).relative_to('package'))
                expected[name] = digest(bundle.extractfile(member).read())
    # Bun adds an installation tag outside the published archive; retain its hash
    # in provenance but compare every package file and reject other extras.
    auth_files = {k: v for k, v in manifest['components']['@convex-dev/auth'].items() if k != '.bun-tag'}
    if auth_files != expected:
        raise RuntimeError('Installed auth bytes differ from the selected archive')
    manifest['authArchiveSha256'] = digest(auth_archive.read_bytes())
    patch = source / 'patches/convex-mcp-account-erasure-alpha7.patch'
    manifest['mcpPatchSha256'] = digest(patch.read_bytes())
    manifest['mcpVerification'] = verify_mcp(source, manifest['components']['@convex-dev/mcp'])
    # Record this isolated instrumentation separately from installed component bytes.
    probe = source / 'packages/tests/fixtures/account-deletion-convex/local/mcp-probe.js'
    shutil.copy2(probe, modules / '@convex-dev/mcp/dist/component/fixtureProbe.js')
    manifest['mcpFixtureProbeSha256'] = digest(probe.read_bytes())
    (work / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (work / 'source-sha.txt').write_text(sha + '\n')
    return source, sha
