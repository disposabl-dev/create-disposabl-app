"""Run the browser handoff against a fresh, supervised local-only backend."""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from contextlib import ExitStack, contextmanager

ROOT = Path(__file__).resolve().parents[4]
MIN_FREE = int(2.5 * 1024**3)
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    # Always enter the OS sandbox. No inherited flag can skip this boundary.
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] not in ('handoff', 'receipt')):
        raise SystemExit('Usage: run.py [handoff|receipt]')
    mode = sys.argv[1] if len(sys.argv) == 2 else 'handoff'
    env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home()),
           'CONVEX_LOCAL_BINARY': os.environ.get('CONVEX_LOCAL_BINARY', ''),
           'PLAYWRIGHT_BROWSERS_PATH': os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '')}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["guarded_fixture"](sys.argv[2])'
    os.execve('/usr/bin/sandbox-exec',
              ['sandbox-exec', '-p', PROFILE, sys.executable, '-c', entry, __file__, mode], env)


@contextmanager
def disk_guard():
    stopped = threading.Event()
    previous = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}

    def cancel(signum, _frame):
        raise SystemExit(128 + signum)

    def monitor():
        while not stopped.wait(.5):
            if shutil.disk_usage('/tmp').free < MIN_FREE:
                print('Disk threshold reached; cancelling owned fixture', flush=True)
                os.kill(os.getpid(), signal.SIGTERM)
                return

    for sig in previous:
        signal.signal(sig, cancel)
    watcher = threading.Thread(target=monitor, daemon=True)
    watcher.start()
    try:
        yield
    finally:
        stopped.set()
        watcher.join()
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def command(owner, argv, *, cwd=None, env=None, log=None):
    # Supervise preparation commands too, including archive, extraction and keygen.
    with tempfile.TemporaryFile(mode='w+') if log is None else log.open('w+') as out:
        with owner.owned_backend(argv, process_group=True, stop_timeout=.1,
                                 cwd=cwd, env=env, stdout=out, stderr=subprocess.STDOUT) as child:
            if child.wait():
                raise RuntimeError('Fixture command failed; inspect retained logs')
        out.seek(0)
        return out.read()


def guarded_fixture(mode="handoff"):
    owner = load(ROOT / 'packages/tests/helpers/sdk-auth/run.py', 'sdk_runner')
    with disk_guard():
        run_fixture(owner, mode)


def run_fixture(owner, mode):
    if mode not in ("handoff", "receipt"):
        raise ValueError("Unknown fixture mode")
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('1.1.1.1', 443)) != 1:
            raise RuntimeError('Outbound sandbox is not enforced')
    if command(owner, ['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('Commit the candidate before running the fixture')
    if shutil.disk_usage('/tmp').free < MIN_FREE:
        raise RuntimeError('Insufficient free space (<2.5 GiB)')
    for port in (3530, 3531):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(('127.0.0.1', port))
    binary = Path(os.environ.get('CONVEX_LOCAL_BINARY', ''))
    if not binary.is_file():
        raise RuntimeError('Set CONVEX_LOCAL_BINARY to the cached backend')
    browsers = os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '')
    if not browsers or not Path(browsers).is_dir():
        raise RuntimeError('Set PLAYWRIGHT_BROWSERS_PATH to the cached browser directory')
    sha = command(owner, ['git', 'rev-parse', 'HEAD'], cwd=ROOT).strip()
    work = Path(tempfile.mkdtemp(prefix='disposabl-billing-local-', dir='/tmp')).resolve()
    work.chmod(0o700)
    marker = work / 'ownership.json'
    marker.write_text('{}')
    marker.chmod(0o600)
    source = work / 'source'
    source.mkdir()
    archive = work / 'source.tar'
    command(owner, ['git', 'archive', '--format=tar', '--output', str(archive), sha], cwd=ROOT)
    command(owner, ['/usr/bin/tar', '-xf', str(archive), '-C', str(source)])
    selected = load(source / 'packages/tests/helpers/sdk-auth/selected_auth.py', 'selected_auth')
    auth = selected.verify_selected_auth(source, ROOT / 'node_modules/@convex-dev/auth')
    owner = load(source / 'packages/tests/helpers/sdk-auth/run.py', 'sdk_runner')
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
    if mode == 'handoff':
        (source / '.billing-handoff-local-fixture').touch()
    (work / 'home').mkdir()
    shutil.copyfile(source / 'packages/tests/fixtures/account-deletion-convex/local/block-remote.cjs', work / 'block-remote.cjs')
    env = {'HOME': str(work / 'home'), 'PATH': os.environ['PATH'], 'TMPDIR': str(work),
           'LANG': 'en_US.UTF-8', 'CI': '1', 'DO_NOT_TRACK': '1', 'DISPOSABL_TELEMETRY_DISABLED': '1',
           'E2E_TELEMETRY_DISABLED': '1', 'DISABLE_BEACON': '1', 'EXPO_NO_TELEMETRY': '1',
           'EXPO_NO_DOTENV': '1', 'NODE_OPTIONS': '--require=' + str(work / 'block-remote.cjs'),
           'PLAYWRIGHT_BROWSERS_PATH': browsers}
    print(f"source {sha}; auth {auth['version']} sha256 {auth['sha256']} ({auth['files']} files); artifacts {work}", flush=True)
    if shutil.disk_usage('/tmp').free < MIN_FREE:
        raise RuntimeError('Insufficient free space after snapshot')
    name, secret = 'billing-browser-fixture', secrets.token_hex(32)
    key = command(owner, [str(binary), 'keygen', 'admin-key', '--instance-name', name,
                          '--instance-secret', secret], env=env).strip()
    with ExitStack() as stack:
        def group(argv, cwd, log_name, child_env=env):
            command(owner, argv, cwd=cwd, env=child_env, log=work / log_name)
        if mode == 'handoff':
            group(['bun', str(source / 'packages/tests/fixtures/billing-handoff-local/prepare.ts'), str(source)], source, 'prepare.log')
        log = stack.enter_context((work / 'backend.log').open('w'))
        proc = stack.enter_context(owner.owned_backend([str(binary), '--interface', '127.0.0.1', '--port', '3530',
            '--site-proxy-port', '3531', '--convex-origin', 'http://127.0.0.1:3530', '--convex-site',
            'http://127.0.0.1:3531', '--instance-name', name, '--instance-secret', secret, '--disable-beacon',
            '--local-storage', str(work / 'storage'), str(work / 'database.sqlite3')], env=env, stdout=log, stderr=subprocess.STDOUT))
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError('Backend exited before readiness')
            try:
                urllib.request.urlopen('http://127.0.0.1:3530/version', timeout=1).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Backend startup timed out')
        marker.write_text(json.dumps({'version': 1, 'launcherPid': os.getpid(), 'backendPid': proc.pid,
                                      'database': str(work / 'database.sqlite3')}))
        body = json.dumps({'changes': [{'name': 'E2E_TELEMETRY_DISABLED', 'value': '1'},
                                       {'name': 'BOAT_API_KEY', 'value': ''}]}).encode()
        req = urllib.request.Request('http://127.0.0.1:3530/api/update_environment_variables', data=body,
            headers={'Content-Type': 'application/json', 'Authorization': 'Convex ' + key}, method='POST')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status != 200: raise RuntimeError('Fixture environment configuration failed')
        admin = env | {'CONVEX_SELF_HOSTED_URL': 'http://127.0.0.1:3530', 'CONVEX_SELF_HOSTED_ADMIN_KEY': key}
        group(['node', str(source / 'node_modules/convex/bin/main.js'), 'dev', '--once', '--typecheck', 'disable', '--codegen', 'disable'], source / 'packages/backend', 'sync.log', admin)
        testenv = env | {'E2E_CONVEX_URL': 'http://127.0.0.1:3530', 'E2E_CONVEX_SITE_URL': 'http://127.0.0.1:3531'}
        if mode == 'handoff':
            testenv.update({'E2E_BILLING_HANDOFF_BROWSER': '1', 'E2E_BILLING_OWNERSHIP_FILE': str(marker)})
            flow, output = 'billing-handoff-auth.e2e.ts', '.e2e/billing-handoff-auth'
        else:
            testenv.update({'E2E_RECEIPT_CLEANUP': '1', 'E2E_RECEIPT_OWNERSHIP_FILE': str(marker),
                            'E2E_CONVEX_ADMIN_KEY': key, 'E2E_RECEIPT_ARTIFACT_DIR': str(work / 'receipt')})
            flow, output = 'account-deletion-receipt.e2e.ts', '.e2e/account-deletion-receipt'
        group(['bun', 'run', 'e2e', 'run', flow, '--target', 'web', '--retries', '0',
               '--no-cache', '--output', output], source, 'e2e.log', testenv)
        print(f'{mode} browser fixture passed', flush=True)


if __name__ == '__main__':
    try:
        main()
    except subprocess.SubprocessError:
        print('Fixture subprocess failed; inspect retained logs', file=sys.stderr)
        sys.exit(1)
