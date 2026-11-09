"""Run synthetic telemetry HTTP requests only on a fresh owned backend."""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[4]
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home())}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["guarded_fixture"]()'
    # An inherited flag cannot bypass the OS sandbox.
    os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE,
        sys.executable, '-c', entry, __file__], env)


def guarded_fixture():
    harness = load(ROOT / 'packages/tests/fixtures/billing-handoff-browser/run.py', 'handoff_runner')
    owner = load(ROOT / 'packages/tests/helpers/sdk-auth/run.py', 'sdk_owner')
    with harness.disk_guard():
        run_fixture(harness, owner)


def run_fixture(harness, owner):
    command = lambda argv, **kw: harness.command(owner, argv, **kw)
    if shutil.disk_usage('/tmp').free < harness.MIN_FREE:
        raise RuntimeError('Need at least 2.5 GiB free')
    if command(['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('Commit the fixture before qualification')
    for port in (3540, 3541):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    binary = Path.home() / '.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'
    sha = command(['git', 'rev-parse', 'HEAD'], cwd=ROOT).strip()
    work = Path(tempfile.mkdtemp(prefix='disposabl-telemetry-http-', dir='/tmp')).resolve()
    work.chmod(0o700)
    marker = work / 'ownership.json'
    marker.write_text('{}')
    marker.chmod(0o600)
    source = work / 'source'
    source.mkdir()
    command(['git', 'archive', '--output', str(work / 'source.tar'), sha], cwd=ROOT)
    command(['/usr/bin/tar', '-xf', str(work / 'source.tar'), '-C', str(source)])
    selected = load(source / 'packages/tests/helpers/sdk-auth/selected_auth.py', 'selected_auth')
    auth = selected.verify_selected_auth(source, ROOT / 'node_modules/@convex-dev/auth')
    print(f"Source {sha}; selected Auth {auth['version']}; {auth['files']} matching files", flush=True)
    modules = source / 'node_modules'
    modules.mkdir()
    for dep in (ROOT / 'node_modules').iterdir():
        if dep.name == '@disposabl' and dep.is_dir():
            scope = modules / dep.name
            scope.mkdir()
            for package in dep.iterdir():
                target = source / 'packages/disposabl-kit' if package.name == 'disposabl-kit' else package.resolve()
                (scope / package.name).symlink_to(target, target_is_directory=target.is_dir())
        else:
            (modules / dep.name).symlink_to(dep.resolve(), target_is_directory=dep.is_dir())
    here = source / 'packages/tests/fixtures/telemetry-http-convex'
    fixture = work / 'fixture'
    shutil.copytree(source / 'packages/tests/fixtures/ephemeral-deletion-convex/convex', fixture / 'convex')
    shutil.copy2(here / 'http.ts', fixture / 'convex/http.ts')
    shutil.copy2(here / 'users-internal.ts', fixture / 'convex/users/internal.ts')
    (fixture / 'convex/telemetry.ts').write_text('export * from "../../../../backend/convex/telemetry";\n')
    (fixture / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
    for path in (fixture / 'convex').rglob('*.ts'):
        path.write_text(path.read_text().replace('../../../../backend/convex/', str(source / 'packages/backend/convex') + '/'))
    (fixture / 'package.json').write_text('{"name":"telemetry-http-fixture","private":true,"dependencies":{"convex":"^1.49.0"}}')
    env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home()),
           'E2E_TELEMETRY_DISABLED': '1', 'DO_NOT_TRACK': '1', 'BOAT_API_KEY': ''}
    name, secret = 'telemetry-http-synthetic', secrets.token_hex(32)
    key = command([str(binary), 'keygen', 'admin-key', '--instance-name', name,
                   '--instance-secret', secret], env=env).strip()
    env.update(CONVEX_SELF_HOSTED_URL='http://127.0.0.1:3540', CONVEX_SELF_HOSTED_ADMIN_KEY=key)
    database = work / 'database.sqlite3'
    with (work / 'backend.log').open('w') as log, owner.owned_backend([
        str(binary), '--interface', '127.0.0.1', '--port', '3540', '--site-proxy-port', '3541',
        '--instance-name', name, '--instance-secret', secret, '--disable-beacon',
        '--local-storage', str(work / 'storage'), str(database)], env=env,
        stdout=log, stderr=subprocess.STDOUT) as proc:
        marker.write_text(json.dumps({'version': 1, 'launcherPid': os.getpid(),
            'backendPid': proc.pid, 'database': str(database)}))
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError('Owned backend exited before readiness')
            try:
                urllib.request.urlopen('http://127.0.0.1:3540/version', timeout=1)
                break
            except Exception:
                time.sleep(.1)
        else:
            raise RuntimeError('Owned backend did not start')
        cli = str(source / 'node_modules/.bin/convex')
        expected = {'E2E_TELEMETRY_DISABLED': '1', 'BOAT_API_KEY': '',
                    'POSTHOG_PROJECT_TOKEN': 'phc_fixture_public', 'POSTHOG_HOST': 'https://us.i.posthog.com'}
        for name, value in expected.items():
            command([cli, 'env', 'set', name, value], cwd=fixture, env=env)
        output = command([cli, 'env', 'list'], cwd=fixture, env=env)
        if dict(line.split('=', 1) for line in output.splitlines() if '=' in line) != expected:
            raise RuntimeError('Unexpected provider configuration')
        command([cli, 'dev', '--once', '--typecheck', 'disable', '--codegen', 'disable'],
                cwd=fixture, env=env, log=work / 'sync.log')
        env.update(TELEMETRY_HTTP_FIXTURE_URL='http://127.0.0.1:3540', TELEMETRY_HTTP_OWNERSHIP_FILE=str(marker))
        command(['bun', 'test', str(source / 'packages/tests/telemetry-http-integration.test.ts')],
                cwd=fixture, env=env, log=work / 'tests.log')
    print('Passed; owned backend and children stopped. Evidence:', work, flush=True)


if __name__ == '__main__':
    main()
