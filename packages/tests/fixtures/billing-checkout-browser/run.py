#!/usr/bin/env python3
"""Disposable, outbound-denied local billing browser fixture."""
import contextlib
import http.server
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
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[4]
BINARY = Path.home() / '.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'

class Checkout(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/local-test-checkout':
            self.send_error(404)
            return
        data = b'<!doctype html><title>Local test checkout</title><h1>Local test checkout</h1><p>No payment is processed.</p>'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *_args):
        pass


def main():
    if os.environ.get('CHECKOUT_SANDBOXED') != '1':
        env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home()), 'CHECKOUT_SANDBOXED': '1'}
        os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE, sys.executable, __file__], env)
    # Verify the inherited sandbox actually denies external socket access.
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('1.1.1.1', 443)) != 1:
            raise RuntimeError('Outbound sandbox did not deny a non-loopback connection')
    if shutil.disk_usage('/tmp').free < 2 * 1024**3:
        raise RuntimeError('Need at least 2 GiB free')
    for port in (3540, 3541, 3549):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        raise RuntimeError('Commit the exact fixture candidate before running')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    version = json.loads((ROOT / 'node_modules/@convex-dev/auth/package.json').read_text())['version']
    if version != '2.0.0-beta.0-reboot.437831bd-disposabl.8':
        raise RuntimeError('Expected installed auth .8')
    stage = Path(tempfile.mkdtemp(prefix='disposabl-checkout-browser-', dir='/tmp')).resolve()
    stage.chmod(0o700)
    marker = stage / 'ownership.json'
    marker.write_text('{}')
    marker.chmod(0o600)
    db = stage / 'db.sqlite3'
    source = stage / 'source'
    source.mkdir()
    with (stage / 'source.tar').open('wb') as output:
        subprocess.run(['git', 'archive', sha], cwd=ROOT, stdout=output, check=True)
    subprocess.run(['tar', '-xf', str(stage / 'source.tar'), '-C', str(source)], check=True)
    (source / '.checkout-fixture').touch()
    # Retarget only the workspace package. All other dependencies are read-only caches.
    modules = source / 'node_modules'
    modules.mkdir()
    for dep in (ROOT / 'node_modules').iterdir():
        if dep.name != '@disposabl':
            (modules / dep.name).symlink_to(dep, target_is_directory=dep.is_dir())
    scope = modules / '@disposabl'
    scope.mkdir()
    for dep in (ROOT / 'node_modules/@disposabl').iterdir():
        (scope / dep.name).symlink_to(source / 'packages/disposabl-kit' if dep.name == 'disposabl-kit' else dep, target_is_directory=dep.is_dir())
    home = stage / 'home'
    home.mkdir()
    env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'TMPDIR': str(stage), 'E2E_TELEMETRY_DISABLED': '1', 'DO_NOT_TRACK': '1', 'EXPO_NO_TELEMETRY': '1', 'PLAYWRIGHT_BROWSERS_PATH': str(Path.home() / 'Library/Caches/ms-playwright')}
    subprocess.run(['bun', str(source / 'packages/tests/fixtures/billing-checkout-browser/prepare.ts'), str(source)], cwd=source, env=env, check=True)
    name = 'billing-checkout-fixture'
    secret = secrets.token_hex(32)
    key = subprocess.check_output([str(BINARY), 'keygen', 'admin-key', '--instance-name', name, '--instance-secret', secret], env=env, text=True).strip()
    admin = env | {'CONVEX_SELF_HOSTED_URL': 'http://127.0.0.1:3540', 'CONVEX_SELF_HOSTED_ADMIN_KEY': key}
    helper = importlib.util.spec_from_file_location('sdk_runner', ROOT / 'packages/tests/helpers/sdk-auth/run.py')
    module = importlib.util.module_from_spec(helper)
    helper.loader.exec_module(module)
    print(f'source {sha}; evidence {stage}', flush=True)
    with (stage / 'backend.log').open('w') as log, module.owned_backend([str(BINARY), '--interface', '127.0.0.1', '--port', '3540', '--site-proxy-port', '3541', '--instance-name', name, '--instance-secret', secret, '--disable-beacon', '--local-storage', str(stage / 'storage'), str(db)], env=env, stdout=log, stderr=subprocess.STDOUT) as proc:
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError('Backend exited')
            try:
                urllib.request.urlopen('http://127.0.0.1:3540/version', timeout=1).close()
                break
            except Exception:
                time.sleep(.1)
        else:
            raise RuntimeError('Backend did not start')
        marker.write_text(json.dumps({'launcherPid': os.getpid(), 'backendPid': proc.pid, 'database': str(db)}))
        cli = str(ROOT / 'node_modules/.bin/convex')
        backend = source / 'packages/backend'
        for name, value in [('E2E_TELEMETRY_DISABLED', '1'), ('BOAT_API_KEY', '')]:
            subprocess.run([cli, 'env', 'set', name, value], cwd=backend, env=admin, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        output = subprocess.check_output([cli, 'env', 'list'], cwd=backend, env=admin, text=True)
        if dict(x.split('=', 1) for x in output.splitlines() if '=' in x) != {'E2E_TELEMETRY_DISABLED': '1', 'BOAT_API_KEY': ''}:
            raise RuntimeError('Unexpected backend environment')
        with (stage / 'sync.log').open('w') as log:
            subprocess.run([cli, 'dev', '--once', '--typecheck', 'disable', '--codegen', 'disable'], cwd=backend, env=admin, stdout=log, stderr=subprocess.STDOUT, check=True)
        testenv = env | {'E2E_CONVEX_ADMIN_KEY': key, 'E2E_CONVEX_URL': 'http://127.0.0.1:3540', 'E2E_CONVEX_SITE_URL': 'http://127.0.0.1:3541', 'CONVEX_URL': 'http://127.0.0.1:3540', 'CONVEX_SITE_URL': 'http://127.0.0.1:3541', 'E2E_CHECKOUT_BROWSER': '1', 'E2E_CHECKOUT_OWNERSHIP_FILE': str(marker)}
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 3549), Checkout)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with (stage / 'browser.log').open('w') as log:
                result = subprocess.run(['bun', 'run', 'e2e', 'run', 'billing-checkout-auth.e2e.ts', '--target', 'web', '--retries', '0'], cwd=source, env=testenv, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                raise RuntimeError('Browser test failed; inspect retained browser.log')
            print('Checkout browser flow passed', flush=True)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
    print('Owned backend and checkout server stopped', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Fixture failed: {exc}', file=sys.stderr)
        sys.exit(1)
