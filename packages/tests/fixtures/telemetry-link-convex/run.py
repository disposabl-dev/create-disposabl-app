"""Disposable synthetic Convex ephemeral-cleanup fixture. Never run on shared or cloud backends."""
import os, pathlib, secrets, shutil, socket, subprocess, sys, tempfile, time, urllib.request
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'
if os.environ.get('TELEMETRY_FIXTURE_SANDBOXED') != '1':
    allowed = {'PATH': os.environ.get('PATH', '/usr/bin:/bin:/usr/sbin:/sbin'), 'HOME': str(pathlib.Path.home()), 'TELEMETRY_FIXTURE_SANDBOXED': '1'}
    os.execve('/usr/bin/sandbox-exec', ['sandbox-exec', '-p', PROFILE, sys.executable, __file__], allowed)
with socket.socket() as probe:
    probe.settimeout(1)
    if probe.connect_ex(('1.1.1.1', 443)) != 1:
        raise RuntimeError('Outbound sandbox did not deny a non-loopback connection')
if shutil.disk_usage('/tmp').free < 2.5 * 1024**3:
    raise RuntimeError('Need at least 2.5 GiB free')
for port in (3540, 3541):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try: probe.bind(('127.0.0.1', port))
        except OSError as exc: raise RuntimeError(f'Fixture port {port} is unavailable') from exc
here = pathlib.Path(__file__).resolve().parent
root = here.parents[3]
binary = pathlib.Path.home() / '.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'
sys.path.insert(0, str(root / 'packages/tests/helpers/sdk-auth'))
from selected_auth import verify_selected_auth
auth = verify_selected_auth(root)
print(f"Selected auth {auth['version']} sha256 {auth['sha256']} files {auth['files']}", flush=True)
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip(): raise RuntimeError('Commit fixture before qualification')
print('Source:', sha, flush=True)
work = pathlib.Path(tempfile.mkdtemp(prefix='disposabl-telemetry-link-'))
os.chmod(work, 0o700)
shutil.copytree(root / 'packages/tests/fixtures/ephemeral-deletion-convex/convex', work / 'convex')
shutil.copy2(here / 'link.ts', work / 'convex/link.ts')
shutil.copy2(here / 'telemetry.ts', work / 'convex/telemetry.ts')
(work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
for p in (work / 'convex').rglob('*.ts'):
    p.write_text(p.read_text().replace('../../../../backend/convex/', str(root / 'packages/backend/convex') + '/'))
(work / 'package.json').write_text('{"name":"synthetic-auth8-fixture","private":true,"dependencies":{"convex":"^1.49.0"}}')
secret=secrets.token_hex(32); name='ephemeral-product-synthetic'
key=subprocess.check_output([str(binary),'keygen','admin-key','--instance-name',name,'--instance-secret',secret],text=True).strip()
env={k: os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ}
env.update({'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3540','CONVEX_SELF_HOSTED_ADMIN_KEY':key,'E2E_TELEMETRY_DISABLED':'1','DO_NOT_TRACK':'1','BOAT_API_KEY':''})
log=(work / 'backend.log').open('w')
proc=subprocess.Popen([str(binary),'--interface','127.0.0.1','--port','3540','--site-proxy-port','3541','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',str(work/'storage'),str(work/'db.sqlite3')],stdout=log,stderr=subprocess.STDOUT,env=env)
try:
    for _ in range(100):
        if proc.poll() is not None: raise RuntimeError('isolated backend exited before readiness')
        try: urllib.request.urlopen('http://127.0.0.1:3540/version',timeout=1); break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('isolated backend did not start')
    cli=str(root / 'node_modules/.bin/convex')
    subprocess.run([cli,'env','set','E2E_TELEMETRY_DISABLED','1'],cwd=work,env=env,check=True)
    subprocess.run([cli,'env','set','BOAT_API_KEY',''],cwd=work,env=env,check=True)
    output=subprocess.check_output([cli,'env','list'],cwd=work,env=env,text=True)
    entries=dict(line.split('=',1) for line in output.splitlines() if '=' in line)
    if entries != {'E2E_TELEMETRY_DISABLED':'1','BOAT_API_KEY':''}: raise RuntimeError('unexpected provider configuration')
    print('Verified telemetry disabled, Boat empty, other provider values absent', flush=True)
    subprocess.run([cli,'dev','--once','--typecheck','disable','--codegen','disable'],cwd=work,env=env,check=True)
    env['TELEMETRY_LINK_FIXTURE_URL']='http://127.0.0.1:3540'
    subprocess.run(['bun','test',str(root/'packages/tests/telemetry-link-transactions.test.ts')],cwd=work,env=env,check=True)
finally:
    proc.terminate()
    try: proc.wait(timeout=10)
    except subprocess.TimeoutExpired: proc.kill(); proc.wait()
    log.close()
    print('Stopped owned backend; disposable fixture:', work, flush=True)
