#!/usr/bin/env python3
"""Run product web/backend E2E against a fresh owned local Convex backend.

Requires an already verified local backend binary and cached browser. This runner
never downloads a binary or configures a cloud deployment. Retained evidence is
private; apply an OS network sandbox externally if outbound denial is required.
"""
import importlib.util
import errno
import json
import os
import re
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from contextlib import ExitStack

ROOT = Path(__file__).resolve().parents[2]
PORTS = (3520, 3521)
MIN_FREE = int(2.5 * 1024**3)


def verify_isolation():
    if sys.platform.startswith('linux') and os.geteuid() == 0:
        raise RuntimeError('The isolated test process must not run as root')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        with socket.create_connection(listener.getsockname(), timeout=1):
            pass
    for family, target in ((socket.AF_INET, ('1.1.1.1', 443)),
                           (socket.AF_INET6, ('2606:4700:4700::1111', 443))):
        try:
            with socket.socket(family) as probe:
                probe.settimeout(1)
                result = probe.connect_ex(target)
        except OSError as exc:
            result = exc.errno
        if result not in (errno.ENETUNREACH, errno.EACCES, errno.EPERM, errno.EAFNOSUPPORT):
            raise RuntimeError('External network denial was not verified')


def report_e2e(path):
    text = re.sub(r'\x1b\[[0-9;]*m', '', path.read_text(errors='replace'))
    line = next((line for line in text.splitlines() if re.match(r'\s*Tests\s+', line)), '')
    counts = {name: int(value) for value, name in re.findall(r'(\d+)\s+(passed|failed|skipped)', line)}
    print('E2E counts: ' + (', '.join(f'{name}={counts[name]}' for name in ('passed', 'failed', 'skipped') if name in counts) or 'unavailable'), flush=True)



def report_failure(path, source):
    """Print fixed error categories and committed flow locations, never raw payloads."""
    text = path.read_text(errors='replace') if path.exists() else ''
    categories = {
        'connection-refused': r'ECONNREFUSED|Connection refused',
        'address-in-use': r'EADDRINUSE|Address already in use',
        'missing-file': r'ENOENT|No such file or directory',
        'browser-not-installed': r"Executable doesn.t exist|playwright install",
        'missing-library': r'error while loading shared libraries',
        'timeout': r'TimeoutError|timed out|Timeout exceeded',
        'assertion': r'AssertionError|expect\(|assertion failed',
        'network-denied': r'ENETUNREACH|Network is unreachable|Operation not permitted',
    }
    matched = [name for name, pattern in categories.items() if re.search(pattern, text)]
    print('Failure categories: ' + (', '.join(matched) or 'unclassified'), flush=True)
    report = source / 'packages/tests/.e2e/report.json'
    if not report.is_file():
        return
    try:
        results = json.loads(report.read_text())['run']['results']
        allowed = {f'flows/{file.name}': len(file.read_text().splitlines())
                   for file in (source / 'packages/tests/flows').glob('*.e2e.ts')}
        locations = set()
        for result in results:
            if result.get('status') in ('passed', 'skipped'):
                continue
            location = result.get('source') or {}
            file, line = location.get('file'), location.get('line')
            if file in allowed and type(line) is int and 0 < line <= allowed[file]:
                locations.add(f'{file}:{line}')
        for location in sorted(locations):
            print('Failed flow declaration: ' + location, flush=True)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        print('Failure report could not be summarized safely', flush=True)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_ports():
    for port in PORTS:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', port))


def listeners(port):
    result = subprocess.run(['lsof', '-nP', '-tiTCP:' + str(port), '-sTCP:LISTEN'],
                            capture_output=True, text=True)
    if result.returncode not in (0, 1) or result.stderr.strip():
        raise RuntimeError(f'Cannot inspect listeners on {port}')
    return result.stdout.split()


def main():
    if len(sys.argv) != 1:
        raise RuntimeError('No arguments accepted; supply CONVEX_LOCAL_BINARY and PLAYWRIGHT_BROWSERS_PATH')
    binary = Path(os.environ.get('CONVEX_LOCAL_BINARY', '')).resolve()
    browsers = Path(os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '')).resolve()
    if not os.environ.get('CONVEX_LOCAL_BINARY') or not os.environ.get('PLAYWRIGHT_BROWSERS_PATH') or not binary.is_file() or not os.access(binary, os.X_OK) or not browsers.is_dir():
        raise RuntimeError('Supply an executable verified local backend and cached browser directory')
    if os.environ.get('PRODUCT_BROWSER_FROZEN_INSTALL') != '1':
        raise RuntimeError('Caller must complete bun install --frozen-lockfile before running')
    if os.environ.get('PRODUCT_BROWSER_REQUIRE_ISOLATION') == '1':
        verify_isolation()
    if shutil.disk_usage('/tmp').free < MIN_FREE:
        raise RuntimeError('Insufficient free space (<2.5 GiB)')
    changes = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=ROOT, text=True).splitlines()
    if changes:
        bytecode = sum('__pycache__/' in change and change.endswith('.pyc') for change in changes)
        raise RuntimeError(f'A clean committed checkout is required ({len(changes)} changed entries; {bytecode} Python cache files)')
    check_ports()
    owner = load(ROOT / 'packages/tests/helpers/sdk-auth/run.py', 'owned_runner')
    selected = load(ROOT / 'packages/tests/helpers/sdk-auth/selected_auth.py', 'selected_auth')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    auth = selected.verify_selected_auth(ROOT)
    work = Path(tempfile.mkdtemp(prefix='disposabl-product-browser-', dir='/tmp')).resolve()
    work.chmod(0o700)
    source = work / 'source'
    source.mkdir()
    home = work / 'home'
    home.mkdir()
    env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(home), 'TMPDIR': str(work),
           'LANG': 'en_US.UTF-8', 'CI': '1', 'DO_NOT_TRACK': '1', 'DISPOSABL_TELEMETRY_DISABLED': '1',
           'E2E_TELEMETRY_DISABLED': '1', 'DISABLE_BEACON': '1', 'EXPO_NO_TELEMETRY': '1',
           'EXPO_NO_DOTENV': '1', 'PLAYWRIGHT_BROWSERS_PATH': str(browsers)}
    print(f"source {sha}; auth {auth['version']} sha256 {auth['sha256']} ({auth['files']} files); non-Auth dependencies linked from caller frozen install; private evidence {work}", flush=True)

    sequence = 0
    def command(argv, *, cwd, environment=env, log=None, sensitive=False):
        nonlocal sequence
        sequence += 1
        name = log or f'preparation-{sequence}.log'
        with tempfile.TemporaryFile(mode='w+') if sensitive else (work / name).open('w+') as out:
            with owner.owned_backend(argv, process_group=True, stop_timeout=.1, cwd=cwd, env=environment,
                                     stdout=out, stderr=subprocess.STDOUT) as proc:
                code = proc.wait()
                out.flush()
                if log == 'e2e.log':
                    report_e2e(work / log)
                if code:
                    if not sensitive:
                        report_failure(work / name, source)
                    raise RuntimeError(f'Fixture command failed (exit {code}); inspect {name if not sensitive else "private key generation"}')
            out.seek(0)
            return out.read()

    archive = work / 'source.tar'
    command(['git', 'archive', '--format=tar', '--output', str(archive), sha], cwd=ROOT)
    command(['tar', '-xf', str(archive), '-C', str(source)], cwd=ROOT)
    modules = source / 'node_modules'
    modules.mkdir()
    for dep in (ROOT / 'node_modules').iterdir():
        if dep.name != '@disposabl':
            (modules / dep.name).symlink_to(dep.resolve(), target_is_directory=dep.is_dir())
            continue
        scope = modules / dep.name
        scope.mkdir()
        for package in dep.iterdir():
            targets = [base / package.name for base in (source / 'packages', source / 'apps')]
            target = next((p for p in targets if p.is_dir()), None)
            if target is None:
                raise RuntimeError('Unknown workspace package ' + package.name)
            (scope / package.name).symlink_to(target, target_is_directory=True)
    selected.verify_selected_auth(source, ROOT / 'node_modules/@convex-dev/auth')
    if shutil.disk_usage('/tmp').free < MIN_FREE:
        raise RuntimeError('Insufficient free space after snapshot')
    command(['bun', 'run', 'build'], cwd=source / 'packages/create-disposabl-app', log='generator.log')
    name, secret = 'product-browser-fixture', secrets.token_hex(32)
    key = command([str(binary), 'keygen', 'admin-key', '--instance-name', name, '--instance-secret', secret], cwd=source, sensitive=True).strip()
    if not key:
        raise RuntimeError('Local admin key generation failed')
    backend = source / 'packages/backend'
    admin = env | {'CONVEX_SELF_HOSTED_URL': 'http://127.0.0.1:3520', 'CONVEX_SELF_HOSTED_ADMIN_KEY': key}
    testenv = env | {'E2E_CONVEX_URL': 'http://127.0.0.1:3520', 'E2E_CONVEX_SITE_URL': 'http://127.0.0.1:3521',
                     'CONVEX_URL': 'http://127.0.0.1:3520', 'CONVEX_SITE_URL': 'http://127.0.0.1:3521'}
    with ExitStack() as stack:
        log = stack.enter_context((work / 'backend.log').open('w'))
        proc = stack.enter_context(owner.owned_backend([str(binary), '--interface', '127.0.0.1', '--port', '3520',
            '--site-proxy-port', '3521', '--convex-origin', 'http://127.0.0.1:3520', '--convex-site', 'http://127.0.0.1:3521',
            '--instance-name', name, '--instance-secret', secret, '--disable-beacon', '--local-storage', str(work / 'storage'),
            str(work / 'database.sqlite3')], env=env, stdout=log, stderr=subprocess.STDOUT))
        for _ in range(100):
            if proc.poll() is not None:
                log.flush()
                report_failure(work / 'backend.log', source)
                raise RuntimeError('Owned backend exited before readiness')
            try:
                urllib.request.urlopen('http://127.0.0.1:3520/version', timeout=1).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            log.flush()
            report_failure(work / 'backend.log', source)
            raise RuntimeError('Owned backend readiness timed out')
        for port in PORTS:
            pids = listeners(port)
            if pids != [str(proc.pid)]:
                raise RuntimeError(f'Listener ownership mismatch on {port}')
        marker = work / 'ownership.json'
        marker.write_text(json.dumps({'version': 1, 'launcherPid': os.getpid(), 'backendPid': proc.pid,
                                      'database': str(work / 'database.sqlite3'), 'ports': list(PORTS)}))
        marker.chmod(0o600)
        cli = str(source / 'node_modules/.bin/convex')
        for name, value in [('E2E_TELEMETRY_DISABLED', '1'), ('BOAT_API_KEY', '')]:
            command([cli, 'env', 'set', name, value], cwd=backend, environment=admin)
        values = command([cli, 'env', 'list'], cwd=backend, environment=admin)
        if dict(line.split('=', 1) for line in values.splitlines() if '=' in line) != {'E2E_TELEMETRY_DISABLED': '1', 'BOAT_API_KEY': ''}:
            raise RuntimeError('Unexpected backend environment')
        print('Owned listeners verified; backend telemetry disabled, Boat blank, other provider values absent', flush=True)
        command([cli, 'dev', '--once', '--typecheck', 'disable', '--codegen', 'disable'], cwd=backend, environment=admin, log='sync.log')
        command(['bun', 'run', 'e2e', 'run', '--target', 'web,backend', '--retries', '0', '--no-cache'], cwd=source, environment=testenv, log='e2e.log')
        print('Product web/backend E2E passed', flush=True)
    if any(listeners(port) for port in PORTS):
        raise RuntimeError('Listener still present after backend teardown')
    print('Owned backend stopped; ports 3520/3521 released', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Never print child command lines: keygen arguments contain the local secret.
        print(f'Product browser fixture failed: {exc}', file=sys.stderr)
        sys.exit(1)
