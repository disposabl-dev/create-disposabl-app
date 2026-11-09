"""Run synthetic product auth erasure only on an owned disposable backend."""
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
from contextlib import ExitStack

PORT, SITE_PORT = 3490, 3491
MIN_FREE = int(2.5 * 1024**3)
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'


def main():
    if os.environ.get('LOCAL_AUTH_SANDBOXED') != '1':
        env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home()),
               'LOCAL_AUTH_SANDBOXED': '1', 'CONVEX_LOCAL_BINARY': os.environ.get('CONVEX_LOCAL_BINARY', '')}
        os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE, sys.executable, __file__], env)
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('1.1.1.1', 443)) != 1:
            raise RuntimeError('Outbound sandbox is not enforced')
    checkout = Path(__file__).resolve().parents[4]
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=checkout, text=True).strip():
        raise RuntimeError('Commit the candidate before running this fixture')
    if shutil.disk_usage('/tmp').free < MIN_FREE:
        raise RuntimeError('Insufficient free space (<2.5 GiB)')
    for port in (PORT, SITE_PORT):
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError as exc:
                raise RuntimeError(f'Fixture port {port} is unavailable') from exc
    binary = Path(os.environ.get('CONVEX_LOCAL_BINARY', ''))
    if not binary.is_file():
        raise RuntimeError('Set CONVEX_LOCAL_BINARY to the cached backend')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
    work = Path(tempfile.mkdtemp(prefix='disposabl-auth-product-', dir='/tmp'))
    marker = work / 'ownership.json'
    marker.write_text('{}')
    marker.chmod(0o600)
    archive = work / 'source.tar'
    subprocess.run(['git', 'archive', '--format=tar', '--output', str(archive), sha], cwd=checkout, check=True)
    root = work / 'source'
    root.mkdir()
    subprocess.run(['/usr/bin/tar', '-xf', str(archive), '-C', str(root)], check=True)
    spec = importlib.util.spec_from_file_location('selected_auth', root / 'packages/tests/helpers/sdk-auth/selected_auth.py')
    selected = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(selected)
    auth = selected.verify_selected_auth(root, checkout / 'node_modules/@convex-dev/auth')
    modules = root / 'node_modules'
    modules.mkdir()
    for dep in (checkout / 'node_modules').iterdir():
        if dep.name == '@disposabl' and dep.is_dir():
            scope = modules / dep.name
            scope.mkdir()
            for package in dep.iterdir():
                target = root / 'packages/disposabl-kit' if package.name == 'disposabl-kit' else package.resolve()
                (scope / package.name).symlink_to(target, target_is_directory=target.is_dir())
        else:
            (modules / dep.name).symlink_to(dep.resolve(), target_is_directory=dep.is_dir())
    spec = importlib.util.spec_from_file_location('sdk_runner', root / 'packages/tests/helpers/sdk-auth/run.py')
    owner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(owner)
    print(f"Fixture source: {sha}; auth {auth['version']} sha256 {auth['sha256']} ({auth['files']} files); artifacts: {work}", flush=True)
    if shutil.disk_usage('/tmp').free < MIN_FREE:
        raise RuntimeError('Insufficient free space after snapshot')
    here = root / 'packages/tests/fixtures/auth-identity-erasure-convex'
    project = work / 'project'
    project.mkdir()
    (work / 'home').mkdir()
    shutil.copytree(here / 'convex', project / 'convex')
    (project / 'authpkg').mkdir()
    subprocess.run(['/usr/bin/tar', '-xzf', auth['archive'], '-C', str(project / 'authpkg'), '--strip-components=1'], check=True)
    (project / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    (project / 'authpkg/node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    base = root / 'packages/tests/fixtures/auth-erasure-convex'
    for name, target in [('google-bridge.ts.txt', 'src/components/google/provider.ts'), ('password-seed.ts.txt', 'src/components/password/public.ts'), ('core-seed.ts.txt', 'src/component/public.ts')]:
        with (project / 'authpkg' / target).open('a') as f:
            f.write('\n' + (base / name).read_text())
    shutil.copyfile(here / 'email-fixture.ts.txt', project / 'authpkg/src/components/email/fixture.ts')
    product = project / 'convex/product.ts'
    product.write_text(product.read_text().replace('../../../../backend/convex/users/authDeletion', str(root / 'packages/backend/convex/users/authDeletion')))
    (project / 'package.json').write_text('{"name":"synthetic-auth-product-fixture","private":true,"dependencies":{"convex":"^1.49.0"}}')
    shutil.copyfile(root / 'packages/tests/fixtures/account-deletion-convex/local/block-remote.cjs', work / 'block-remote.cjs')
    env = {'HOME': str(work / 'home'), 'PATH': os.environ['PATH'], 'TMPDIR': str(work), 'LANG': 'en_US.UTF-8', 'CI': '1', 'DO_NOT_TRACK': '1', 'E2E_TELEMETRY_DISABLED': '1', 'DISABLE_BEACON': '1', 'NODE_OPTIONS': '--require=' + str(work / 'block-remote.cjs')}
    name, secret = 'auth-product-synthetic', secrets.token_hex(32)
    key = subprocess.check_output([str(binary), 'keygen', 'admin-key', '--instance-name', name, '--instance-secret', secret], env=env, text=True, stderr=subprocess.PIPE).strip()
    stopped = threading.Event()
    with ExitStack() as stack:
        log = stack.enter_context((work / 'backend.log').open('w'))
        sync = stack.enter_context((work / 'sync.log').open('w'))
        tests = stack.enter_context((work / 'tests.log').open('w'))
        proc = stack.enter_context(owner.owned_backend([str(binary), '--interface', '127.0.0.1', '--port', str(PORT), '--site-proxy-port', str(SITE_PORT), '--instance-name', name, '--instance-secret', secret, '--disable-beacon', '--local-storage', str(work / 'storage'), str(work / 'db.sqlite3')], env=env, stdout=log, stderr=subprocess.STDOUT))
        def guard():
            while not stopped.wait(.5):
                if shutil.disk_usage('/tmp').free < MIN_FREE:
                    print('Disk threshold reached; cancelling owned fixture', flush=True)
                    os.kill(os.getpid(), signal.SIGTERM)
                    return
        threading.Thread(target=guard, daemon=True).start()
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError('Owned backend exited before ready')
                try:
                    urllib.request.urlopen(f'http://127.0.0.1:{PORT}/version', timeout=1).close()
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Backend readiness timeout')
            marker.write_text(json.dumps({'version': 1, 'launcherPid': os.getpid(),
                                          'backendPid': proc.pid, 'database': str(work / 'db.sqlite3')}))
            body = json.dumps({'changes': [{'name': 'E2E_TELEMETRY_DISABLED', 'value': '1'}, {'name': 'BOAT_API_KEY', 'value': ''}]}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/update_environment_variables', data=body, headers={'Content-Type': 'application/json', 'Authorization': 'Convex ' + key}, method='POST')
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError('Fixture environment configuration failed')
            env.update({'CONVEX_SELF_HOSTED_URL': f'http://127.0.0.1:{PORT}', 'CONVEX_SELF_HOSTED_ADMIN_KEY': key})
            cli = str(root / 'node_modules/convex/bin/main.js')
            with owner.owned_backend(['node', cli, 'dev', '--once', '--typecheck', 'disable', '--codegen', 'disable'], process_group=True, stop_timeout=1, cwd=project, env=env, stdout=sync, stderr=subprocess.STDOUT) as child:
                if child.wait():
                    raise RuntimeError('Fixture sync failed; inspect sync.log')
            testenv = {k: v for k, v in env.items() if not k.startswith('CONVEX_SELF_HOSTED_')}
            testenv['LOCAL_AUTH_FIXTURE_URL'] = f'http://127.0.0.1:{PORT}'
            testenv['LOCAL_AUTH_OWNERSHIP_FILE'] = str(marker)
            with owner.owned_backend([sys.executable, str(here / 'product-test.py')], process_group=True, stop_timeout=1, cwd=project, env=testenv, stdout=tests, stderr=subprocess.STDOUT) as child:
                if child.wait():
                    raise RuntimeError('Fixture test failed; inspect tests.log')
            print('Product auth fixture passed', flush=True)
        finally:
            stopped.set()


if __name__ == '__main__':
    main()
