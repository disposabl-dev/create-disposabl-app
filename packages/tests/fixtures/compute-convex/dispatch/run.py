"""Run synthetic dispatch tests on an owned, outbound-isolated backend."""
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
from contextlib import ExitStack

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    env = {'PATH': os.environ['PATH'], 'HOME': str(Path.home()),
           'CONVEX_LOCAL_BINARY': os.environ.get('CONVEX_LOCAL_BINARY', '')}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["guarded"]()'
    os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE, sys.executable, '-c', entry, __file__], env)


def guarded():
    runner = load(ROOT / 'packages/tests/fixtures/billing-handoff-browser/run.py', 'runner')
    owner = load(ROOT / 'packages/tests/helpers/sdk-auth/run.py', 'owner')
    with runner.disk_guard():
        run(runner, owner)


def run(runner, owner):
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('1.1.1.1', 443)) != 1:
            raise RuntimeError('Outbound sandbox is not enforced')
    if runner.command(owner, ['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('Commit the fixture before running')
    if shutil.disk_usage('/tmp').free < runner.MIN_FREE:
        raise RuntimeError('Insufficient free space (<2.5 GiB)')
    for port in (3540, 3541):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(('127.0.0.1', port))
    binary = Path(os.environ.get('CONVEX_LOCAL_BINARY', ''))
    if not binary.is_file():
        raise RuntimeError('Set CONVEX_LOCAL_BINARY to the cached backend')
    selected = load(ROOT / 'packages/tests/helpers/sdk-auth/selected_auth.py', 'selected_auth')
    auth = selected.verify_selected_auth(ROOT)
    sha = runner.command(owner, ['git', 'rev-parse', 'HEAD'], cwd=ROOT).strip()
    work = Path(tempfile.mkdtemp(prefix='disposabl-compute-dispatch-', dir='/tmp')).resolve()
    work.chmod(0o700)
    (work / 'home').mkdir()
    shutil.copytree(HERE / 'convex', work / 'convex')
    (work / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    product = ROOT / 'packages/backend/convex'
    for path in (work / 'convex').rglob('*.ts'):
        path.write_text(path.read_text().replace('@PRODUCT@', str(product)))
    source = (product / 'agent/actions/compute.ts').read_text()
    for old, new in {
        '../../_generated/api': str(product / '_generated/api'),
        '../../_generated/server': str(product / '_generated/server'),
        '../../_generated/dataModel': str(product / '_generated/dataModel'),
        '../boat': str(product / 'agent/boat'),
        '../computeValidator': str(product / 'agent/computeValidator'),
        '../noticeBalance': str(product / 'agent/noticeBalance'),
        '../computeDebit': './syntheticDebit',
    }.items():
        needle = '"' + old + '"'
        if source.count(needle) != 1:
            raise RuntimeError('Unexpected product import')
        source = source.replace(needle, '"' + new + '"')
    (work / 'convex/agent/actions/productCompute.ts').write_text(source)
    (work / 'package.json').write_text('{"name":"synthetic-compute-dispatch-fixture","private":true,"dependencies":{"convex":"^1.49.0"}}')
    shutil.copyfile(ROOT / 'packages/tests/fixtures/account-deletion-convex/local/block-remote.cjs', work / 'block-remote.cjs')
    env = {'HOME': str(work / 'home'), 'PATH': os.environ['PATH'], 'TMPDIR': str(work),
           'LANG': 'en_US.UTF-8', 'CI': '1', 'DO_NOT_TRACK': '1', 'E2E_TELEMETRY_DISABLED': '1',
           'DISABLE_BEACON': '1', 'NODE_OPTIONS': '--require=' + str(work / 'block-remote.cjs')}
    print(f"source {sha}; auth {auth['version']} sha256 {auth['sha256']} ({auth['files']} files); artifacts {work}", flush=True)
    name, secret = 'compute-dispatch-synthetic', secrets.token_hex(32)
    key = runner.command(owner, [str(binary), 'keygen', 'admin-key', '--instance-name', name,
                                  '--instance-secret', secret], env=env).strip()
    with ExitStack() as stack:
        log = stack.enter_context((work / 'backend.log').open('w'))
        proc = stack.enter_context(owner.owned_backend([str(binary), '--interface', '127.0.0.1', '--port', '3540',
            '--site-proxy-port', '3541', '--instance-name', name, '--instance-secret', secret, '--disable-beacon',
            '--local-storage', str(work / 'storage'), str(work / 'db.sqlite3')], env=env, stdout=log, stderr=subprocess.STDOUT))
        for _ in range(100):
            if proc.poll() is not None: raise RuntimeError('Backend exited before readiness')
            try:
                urllib.request.urlopen('http://127.0.0.1:3540/version', timeout=1).close()
                break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('Backend startup timed out')
        body = json.dumps({'changes': [{'name': 'E2E_TELEMETRY_DISABLED', 'value': '1'}, {'name': 'BOAT_API_KEY', 'value': ''}]}).encode()
        req = urllib.request.Request('http://127.0.0.1:3540/api/update_environment_variables', data=body,
            headers={'Content-Type': 'application/json', 'Authorization': 'Convex ' + key}, method='POST')
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status != 200: raise RuntimeError('Fixture environment configuration failed')
        admin = env | {'CONVEX_SELF_HOSTED_URL': 'http://127.0.0.1:3540', 'CONVEX_SELF_HOSTED_ADMIN_KEY': key}
        cli = str(ROOT / 'node_modules/convex/bin/main.js')
        runner.command(owner, ['node', cli, 'dev', '--once', '--typecheck', 'disable'], cwd=work, env=admin, log=work / 'sync.log')
        testenv = env | {'COMPUTE_DISPATCH_FIXTURE_URL': 'http://127.0.0.1:3540'}
        runner.command(owner, ['bun', 'test', str(HERE / 'dispatch.test.ts')], cwd=work, env=testenv, log=work / 'tests.log')
        print('Dispatch fixture passed', flush=True)


if __name__ == '__main__':
    try: main()
    except subprocess.SubprocessError:
        print('Fixture subprocess failed; inspect retained logs', file=sys.stderr)
        sys.exit(1)
