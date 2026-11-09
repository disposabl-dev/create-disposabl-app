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
    electron_mount = os.environ.get('REPLAY_ELECTRON_MOUNT') == '1'
    if electron_mount and not Path(os.environ.get('REPLAY_ELECTRON_BINARY', '')).is_file():
        raise RuntimeError('REPLAY_ELECTRON_BINARY must name cached Electron')
    if electron_mount and os.environ.get('REPLAY_ELECTRON_NO_SANDBOX') != '1':
        raise RuntimeError('Electron fixture requires explicit REPLAY_ELECTRON_NO_SANDBOX=1')
    billing_mount = os.environ.get('REPLAY_BILLING_MOUNT') == '1'
    telemetry_mount = electron_mount or billing_mount or os.environ.get('REPLAY_TELEMETRY_MOUNT') == '1'
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
    if not telemetry_mount:
        command(['bun', 'run', 'build'], cwd=app, env=env, log=work/'production-build.log')
    dist = app/'dist/client'
    body = re.compile(r'<body[^>]*>')
    paths_to_check = ['index.html', '_shell.html', 'login/index.html', 'signup/index.html', 'consent/index.html', 'legal/delete-account/index.html']
    for name in ([] if telemetry_mount else paths_to_check):
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
    features = json.dumps(str(fixture/'inert-features.ts'))
    alias = ('resolve: { tsconfigPaths: true, alias: ['
             '{ find: /^convex\\/react$/, replacement: '+convex+' },'
             '{ find: /^@convex-dev\\/auth\\/react$/, replacement: '+auth+' },'
             '{ find: /^@convex-dev\\/auth\\/methods\\/(username-password|email-password|google)\\/react$/, replacement: '+auth+' }] },')
    if billing_mount:
        alias = alias.replace('alias: [', 'alias: [{ find: /^convex\/browser$/, replacement: '+convex+' },{ find: /^(?:@disposabl\/disposabl-kit\/features|(?:\.\.\/)+features)$/, replacement: '+features+' },')
    text = text.replace(needle, alias).replace('crawlLinks: true,', 'crawlLinks: false,')
    if telemetry_mount:
        # Only this isolated build forces the production analytics gate on;
        # every transport is intercepted and the enclosing OS sandbox denies outbound.
        for original, replacement in [
            ('const indexable = isProductionSite(mode, url.origin, site);', 'const indexable = true;'),
            ('process.env.E2E_TELEMETRY_DISABLED !== "1" &&', 'true &&'),
            ('!!productionBackend &&', 'true &&'),
            ('url.origin === productionBackend &&', 'true &&'),
        ]:
            if text.count(original) != 1:
                raise RuntimeError(f'Fixture telemetry gate changed: {original}')
            text = text.replace(original, replacement)
    config.write_text(text)
    command(['bun', 'run', 'build'], cwd=app, env=env, log=work/'inert-auth-build.log')
    env['REPLAY_APP_DIST'] = str(dist)
    if billing_mount:
        env['REPLAY_BILLING_MOUNT'] = '1'
    if electron_mount:
        desktop = source/'apps/desktop'
        compiled = work/'electron-build'
        compiled.mkdir()
        for name in ('main', 'preload'):
            command(['bun', 'build', str(desktop/f'src/{name}.ts'), '--target=node', '--format=cjs', '--external=electron', '--outfile', str(compiled/f'{name}.cjs'), '--define', '__dirname='+json.dumps(str(compiled)), '--define', 'DISPOSABL_DESKTOP_ID="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"', '--define', 'DISPOSABL_WEB_URL="https://fixture.invalid"', '--define', 'DISPOSABL_UPDATE_URL=""', '--define', 'DISPOSABL_UPDATE_CHANNEL="production"'], cwd=source, env=env, log=work/f'electron-{name}-build.log')
        env['REPLAY_ELECTRON_BINARY'] = os.environ['REPLAY_ELECTRON_BINARY']
        env['REPLAY_ELECTRON_NO_SANDBOX'] = os.environ['REPLAY_ELECTRON_NO_SANDBOX']
        entry = work/'electron-entry.cjs'
        entry.write_text("const {app}=require('electron');app.setPath('appData'," + json.dumps(str(work)) + " );app.setPath('userData'," + json.dumps(str(work/'electron-user-data')) + " );globalThis.startTestProduct=()=>require(" + json.dumps(str(compiled/'main.cjs')) + " );")
        env['REPLAY_ELECTRON_ENTRY'] = str(entry)
    script = 'mount-telemetry.mjs' if telemetry_mount else 'actual-app.mjs'
    modes = ['electron'] if electron_mount else ['web', 'desktop'] if telemetry_mount else [None]
    for mode in modes:
        args = ['bun', f'packages/tests/fixtures/posthog-replay-browser/{script}']
        if mode: args.append(mode)
        command(args, cwd=source, env=env, log=work/(f'actual-app-{mode}.log' if mode else 'actual-app.log'), timeout=120)
    print(f'source={sha} artifacts={work}', flush=True)
    for mode in modes:
        print((work/(f'actual-app-{mode}.log' if mode else 'actual-app.log')).read_text(), end='', flush=True)


if __name__ == '__main__':
    allowed = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'REPLAY_CHROMIUM': os.environ.get('REPLAY_CHROMIUM', ''), 'REPLAY_TELEMETRY_MOUNT': os.environ.get('REPLAY_TELEMETRY_MOUNT', ''), 'REPLAY_BILLING_MOUNT': os.environ.get('REPLAY_BILLING_MOUNT', ''), 'REPLAY_ELECTRON_MOUNT': os.environ.get('REPLAY_ELECTRON_MOUNT', ''), 'REPLAY_ELECTRON_NO_SANDBOX': os.environ.get('REPLAY_ELECTRON_NO_SANDBOX', ''), 'REPLAY_ELECTRON_BINARY': os.environ.get('REPLAY_ELECTRON_BINARY', '')}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["main"]()'
    os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE, sys.executable, '-c', entry, __file__], allowed)
