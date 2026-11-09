#!/usr/bin/env python3
"""Run the packed SDK flow against a fresh owned local Convex instance."""
import json
from contextlib import contextmanager
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[4]
BINARY = Path.home() / '.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'
EXPECTED_AUTH = '2.0.0-beta.0-reboot.437831bd-disposabl.8'


# The supervisor stays alive after the command exits. Its PID pins the process
# group until cleanup sends its final signal; only then may we reap it.
_GROUP_SUPERVISOR = r"""
import os, signal, subprocess, sys
fd = int(sys.argv[1])
signal.signal(signal.SIGTERM, signal.SIG_IGN)
signal.signal(signal.SIGINT, signal.SIG_IGN)
def reset_signals():
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    signal.signal(signal.SIGINT, signal.SIG_DFL)
try:
    result = subprocess.Popen(sys.argv[2:], preexec_fn=reset_signals).wait()
except Exception:
    result = 127
os.write(fd, (str(result) + "\n").encode())
os.close(fd)
while True:
    signal.pause()
"""


class OwnedGroup:
    def __init__(self, command, **options):
        reader, writer = os.pipe()
        try:
            self._anchor = subprocess.Popen(
                [sys.executable, '-c', _GROUP_SUPERVISOR, str(writer), *command],
                start_new_session=True, pass_fds=(writer,), **options,
            )
        except BaseException:
            os.close(reader)
            raise
        finally:
            os.close(writer)
        self._status = os.fdopen(reader)
        self.pid = self._anchor.pid
        self.stdout = self._anchor.stdout
        self.returncode = None

    def wait(self):
        # Read command completion without polling/reaping the group leader.
        if self.returncode is None:
            value = self._status.readline()
            if not value:
                raise RuntimeError('Owned process supervisor exited unexpectedly')
            self.returncode = int(value)
        return self.returncode

    def stop(self, timeout):
        try:
            os.killpg(self.pid, signal.SIGTERM)
            time.sleep(timeout)
        finally:
            try:
                os.killpg(self.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            self._anchor.wait()
            self._status.close()


@contextmanager
def owned_backend(command, *, stop_timeout=10, process_group=False, **options):
    """Defer cancellation during spawn/cleanup so the owned child is always reaped."""
    phase, pending, proc = 'starting', None, None
    previous = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}

    def cancel(signum, _frame):
        nonlocal pending
        pending = signum
        if phase == 'running':
            raise SystemExit(128 + signum)

    for sig in previous:
        signal.signal(sig, cancel)
    try:
        proc = OwnedGroup(command, **options) if process_group else subprocess.Popen(command, **options)
        phase = 'running'
        if pending is not None:
            raise SystemExit(128 + pending)
        yield proc
    finally:
        phase = 'stopping'
        try:
            if proc is not None:
                if process_group:
                    proc.stop(stop_timeout)
                else:
                    if proc.poll() is None:
                        proc.terminate()
                    try:
                        proc.wait(timeout=stop_timeout)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()
                print('owned backend stopped', flush=True)
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
        if pending is not None:
            raise SystemExit(128 + pending)


def main():
    if shutil.disk_usage('/tmp').free < 2 * 1024**3:
        raise RuntimeError('SDK fixture requires at least 2 GiB free')
    for port in (3530, 3531):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        raise RuntimeError('Commit the candidate before running the fixture')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    auth_version = json.loads((ROOT / 'node_modules/@convex-dev/auth/package.json').read_text())['version']
    if auth_version != EXPECTED_AUTH:
        raise RuntimeError('Installed auth component does not match required .8')
    stage = Path(tempfile.mkdtemp(prefix='disposabl-sdk-owned-', dir='/tmp')).resolve()
    os.chmod(stage, 0o700)
    marker = stage / 'ownership.json'
    marker.write_text('{}')
    marker.chmod(0o600)
    db = stage / 'db.sqlite3'
    if db.exists():
        raise RuntimeError('Expected a fresh database')
    source = stage / 'source'
    source.mkdir()
    archive = stage / 'source.tar'
    with archive.open('wb') as out:
        subprocess.run(['git', 'archive', sha], cwd=ROOT, stdout=out, check=True)
    subprocess.run(['tar', '-xf', str(archive), '-C', str(source)], check=True)
    (source / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    home = stage / 'home'
    home.mkdir()
    env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'TMPDIR': str(stage),
           'E2E_TELEMETRY_DISABLED': '1', 'DO_NOT_TRACK': '1', 'EXPO_NO_TELEMETRY': '1'}
    name = 'sdk-auth-owned'
    secret = secrets.token_hex(32)
    key = subprocess.check_output([str(BINARY), 'keygen', 'admin-key', '--instance-name', name,
                                   '--instance-secret', secret], env=env, text=True, stderr=subprocess.PIPE).strip()
    admin = env | {'CONVEX_SELF_HOSTED_URL': 'http://127.0.0.1:3530', 'CONVEX_SELF_HOSTED_ADMIN_KEY': key}
    testenv = env | {'E2E_CONVEX_ADMIN_KEY': key, 'E2E_CONVEX_URL': 'http://127.0.0.1:3530',
                     'E2E_CONVEX_SITE_URL': 'http://127.0.0.1:3531', 'CONVEX_URL': 'http://127.0.0.1:3530',
                     'CONVEX_SITE_URL': 'http://127.0.0.1:3531', 'E2E_SDK_AUTH_FIXTURE': '1',
                     'E2E_SDK_OWNERSHIP_FILE': str(marker), 'E2E_SDK_ARTIFACT_DIR': str(stage / 'sdk-artifacts')}
    command = ['bun', 'run', 'e2e', 'run', 'sdk-auth.e2e.ts', '--target', 'backend', '--retries', '0']
    print(f'source {sha}; retained evidence {stage}', flush=True)
    with (stage / 'backend.log').open('w') as backend_log:
        with owned_backend([str(BINARY), '--interface', '127.0.0.1', '--port', '3530',
                                 '--site-proxy-port', '3531', '--instance-name', name,
                                 '--instance-secret', secret, '--disable-beacon', '--local-storage',
                                 str(stage / 'storage'), str(db)], env=env, stdout=backend_log, stderr=subprocess.STDOUT) as proc:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError('Backend exited during startup')
                try:
                    urllib.request.urlopen('http://127.0.0.1:3530/version', timeout=1).close()
                    break
                except Exception:
                    time.sleep(.1)
            else:
                raise RuntimeError('Backend did not start')
            # No source sync has occurred: failure must happen at the ownership gate.
            with (stage / 'negative.log').open('w') as out:
                negative = subprocess.run(command, cwd=source, env=testenv, stdout=out, stderr=subprocess.STDOUT)
            if negative.returncode == 0 or 'SDK fixture requires its own fresh backend' not in (stage / 'negative.log').read_text():
                raise RuntimeError('Invalid ownership marker was not rejected')
            if (stage / '.sdk-auth-claimed').exists() or (stage / 'sdk-artifacts').exists():
                raise RuntimeError('Rejected run unexpectedly claimed backend or created artifacts')
            marker.write_text(json.dumps({'version': 1, 'launcherPid': os.getpid(), 'backendPid': proc.pid, 'database': str(db)}))
            cli = str(ROOT / 'node_modules/.bin/convex')
            backend = source / 'packages/backend'
            for name, value in [('E2E_TELEMETRY_DISABLED', '1'), ('BOAT_API_KEY', '')]:
                subprocess.run([cli, 'env', 'set', name, value], cwd=backend, env=admin,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
            values = subprocess.check_output([cli, 'env', 'list'], cwd=backend, env=admin, text=True)
            entries = dict(line.split('=', 1) for line in values.splitlines() if '=' in line)
            if entries != {'E2E_TELEMETRY_DISABLED': '1', 'BOAT_API_KEY': ''}:
                raise RuntimeError('Unexpected backend environment')
            with (stage / 'sync.log').open('w') as out:
                subprocess.run([cli, 'dev', '--once', '--typecheck', 'disable', '--codegen', 'disable'],
                               cwd=backend, env=admin, stdout=out, stderr=subprocess.STDOUT, check=True)
            print(f'negative ownership rejected; backend PID {proc.pid}; provider values absent; telemetry disabled', flush=True)
            with (stage / 'sdk.log').open('w') as out:
                result = subprocess.run(command, cwd=source, env=testenv, stdout=out, stderr=subprocess.STDOUT)
            if result.returncode:
                raise RuntimeError('SDK flow failed; inspect retained sdk.log')
            print('SDK flow passed', flush=True)
            with (stage / 'api.log').open('w') as out:
                api = subprocess.run(['bun', 'run', 'e2e', 'run', 'api.e2e.ts', '--target', 'api', '--retries', '0'],
                                     cwd=source, env=testenv, stdout=out, stderr=subprocess.STDOUT)
            if api.returncode:
                raise RuntimeError('API flow failed; inspect retained api.log')
            print('API flow passed', flush=True)


if __name__ == '__main__':
    try:
        main()
    except subprocess.SubprocessError:
        # CalledProcessError includes argv; key generation argv contains the local secret.
        print('Fixture subprocess failed; inspect the retained redacted logs', file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f'Fixture failed: {exc}', file=sys.stderr)
        sys.exit(1)
