#!/usr/bin/env python3
"""Build a committed app snapshot and exercise replay without external traffic."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[4]
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'


def command(args, *, cwd, env, log, timeout=180):
    with log.open('w') as output:
        child = subprocess.Popen(args, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=timeout)
        except BaseException:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait()
            raise
    if code:
        raise RuntimeError(f'Command failed ({code}); inspect {log}')


def main():
    executable = Path(os.environ['REPLAY_CHROMIUM'])
    if not executable.is_file():
        raise RuntimeError('REPLAY_CHROMIUM must name cached Chromium')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        raise RuntimeError('Commit fixture and application candidate before running')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    work = Path(tempfile.mkdtemp(prefix='disposabl-replay-app-', dir='/tmp')).resolve()
    work.chmod(0o700)
    source = work / 'source'
    source.mkdir()
    env = {'HOME': str(work), 'PATH': os.environ['PATH'], 'LANG': 'en_US.UTF-8', 'CI': '1',
           'DO_NOT_TRACK': '1', 'E2E_TELEMETRY_DISABLED': '1', 'EXPO_NO_TELEMETRY': '1',
           'VITE_CONVEX_URL': 'https://fixture.invalid', 'VITE_CONVEX_SITE_URL': 'https://fixture.invalid',
           'VITE_PUBLIC_SITE_URL': 'https://fixture.invalid', 'REPLAY_CHROMIUM': str(executable)}
    command(['git', 'archive', '--format=tar', '--output', str(work / 'source.tar'), sha], cwd=ROOT, env=env, log=work/'archive.log')
    command(['/usr/bin/tar', '-xf', str(work / 'source.tar'), '-C', str(source)], cwd=ROOT, env=env, log=work/'extract.log')
    modules = source / 'node_modules'
    modules.mkdir()
    paths = {'disposabl-kit':'packages/disposabl-kit', 'backend':'packages/backend', 'docs':'apps/docs', 'web':'apps/web', 'mobile':'apps/mobile', 'tests':'packages/tests', 'cli':'packages/cli', 'sdk':'packages/sdk'}
    for dep in (ROOT/'node_modules').iterdir():
        if dep.name == '@disposabl':
            scope = modules/dep.name
            scope.mkdir()
            for item in dep.iterdir():
                target = source/paths[item.name] if item.name in paths else item.resolve()
                (scope/item.name).symlink_to(target, target_is_directory=target.is_dir())
        else:
            (modules/dep.name).symlink_to(dep.resolve(), target_is_directory=dep.is_dir())
    docs = ROOT/'apps/docs/dist'
    if not docs.is_dir():
        raise RuntimeError('Cached docs build is missing')
    (source/'apps/docs/dist').symlink_to(docs, target_is_directory=True)
    app = source/'apps/web'
    command(['bun', 'run', 'build'], cwd=app, env=env, log=work/'production-build.log')
    dist = app/'dist/client'
    body = re.compile(r'<body[^>]*>')
    paths_to_check = ['index.html', '_shell.html', 'login/index.html', 'signup/index.html', 'consent/index.html', 'legal/delete-account/index.html']
    for name in paths_to_check:
        match = body.search((dist/name).read_text())
        if not match or 'data-replay-public' in match.group():
            raise RuntimeError(f'Initial HTML is not replay-blocked: {name}')
    # Fixture-only aliases replace authentication and Convex hooks, preserving product route/layout source.
    config = app/'vite.config.ts'
    text = config.read_text()
    needle = 'resolve: { tsconfigPaths: true },'
    if needle not in text:
        raise RuntimeError('Vite fixture alias insertion point changed')
    fixture = source/'packages/tests/fixtures/posthog-replay-browser'
    convex = json.dumps(str(fixture/'inert-convex.tsx'))
    auth = json.dumps(str(fixture/'inert-session.tsx'))
    alias = ('resolve: { tsconfigPaths: true, alias: ['
             '{ find: /^convex\\/react$/, replacement: '+convex+' },'
             '{ find: /^@convex-dev\\/auth\\/react$/, replacement: '+auth+' },'
             '{ find: /^@convex-dev\\/auth\\/methods\\/(username-password|email-password|google)\\/react$/, replacement: '+auth+' }] },')
    text = text.replace(needle, alias).replace('crawlLinks: true,', 'crawlLinks: false,')
    config.write_text(text)
    command(['bun', 'run', 'build'], cwd=app, env=env, log=work/'inert-auth-build.log')
    env['REPLAY_APP_DIST'] = str(dist)
    command(['bun', 'packages/tests/fixtures/posthog-replay-browser/actual-app.mjs'], cwd=source, env=env, log=work/'actual-app.log', timeout=120)
    print(f'source={sha} artifacts={work}', flush=True)
    print((work/'actual-app.log').read_text(), end='', flush=True)


if __name__ == '__main__':
    allowed = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'REPLAY_CHROMIUM': os.environ.get('REPLAY_CHROMIUM', '')}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["main"]()'
    os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE, sys.executable, '-c', entry, __file__], allowed)
