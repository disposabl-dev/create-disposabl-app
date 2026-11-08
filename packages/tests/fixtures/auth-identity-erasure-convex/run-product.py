"""Disposable synthetic Convex product fixture. Never run on shared or cloud backends."""
import os, pathlib, secrets, shutil, socket, subprocess, tempfile, time, urllib.request
for port in (3550, 3551):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try: probe.bind(('127.0.0.1', port))
        except OSError as exc: raise RuntimeError(f'Fixture port {port} is unavailable') from exc
here = pathlib.Path(__file__).resolve().parent
root = here.parents[3]
binary = pathlib.Path.home() / '.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'
work = pathlib.Path(tempfile.mkdtemp(prefix='disposabl-auth8-product-'))
shutil.copytree(here / 'convex', work / 'convex')
(work / 'authpkg').mkdir()
subprocess.run(['tar', '-xzf', str(root / 'vendor/convex-auth-437831bd-disposabl.8.tgz'), '-C', str(work / 'authpkg'), '--strip-components=1'], check=True)
(work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
(work / 'authpkg/node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
base = root / 'packages/tests/fixtures/auth-erasure-convex'
for name, target in [('google-bridge.ts.txt','src/components/google/provider.ts'), ('password-seed.ts.txt','src/components/password/public.ts'), ('core-seed.ts.txt','src/component/public.ts')]:
    with (work / 'authpkg' / target).open('a') as f: f.write('\n' + (base / name).read_text())
shutil.copyfile(here / 'email-fixture.ts.txt', work / 'authpkg/src/components/email/fixture.ts')
p = work / 'convex/product.ts'
p.write_text(p.read_text().replace('../../../../backend/convex/users/authDeletion', str(root / 'packages/backend/convex/users/authDeletion')))
(work / 'package.json').write_text('{"name":"synthetic-auth8-fixture","private":true,"dependencies":{"convex":"^1.49.0"}}')
secret=secrets.token_hex(32); name='auth8-product-synthetic'
key=subprocess.check_output([str(binary),'keygen','admin-key','--instance-name',name,'--instance-secret',secret],text=True).strip()
env={k:v for k,v in os.environ.items() if not any(x in k.upper() for x in ('CONVEX','POSTHOG','AUTUMN','REVENUECAT','BOAT','R2_','RESEND','GOOGLE','GITHUB','VERCEL','E2E_'))}
env.update({'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3550','CONVEX_SELF_HOSTED_ADMIN_KEY':key,'E2E_TELEMETRY_DISABLED':'1','DO_NOT_TRACK':'1'})
log=(work / 'backend.log').open('w')
proc=subprocess.Popen([str(binary),'--interface','127.0.0.1','--port','3550','--site-proxy-port','3551','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',str(work/'storage'),str(work/'db.sqlite3')],stdout=log,stderr=subprocess.STDOUT,env=env)
try:
    for _ in range(100):
        if proc.poll() is not None: raise RuntimeError('isolated backend exited before readiness')
        try: urllib.request.urlopen('http://127.0.0.1:3550/version',timeout=1); break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('isolated backend did not start')
    cli=str(root / 'node_modules/.bin/convex')
    subprocess.run([cli,'env','set','E2E_TELEMETRY_DISABLED','1'],cwd=work,env=env,check=True)
    subprocess.run([cli,'env','get','E2E_TELEMETRY_DISABLED'],cwd=work,env=env,check=True)
    subprocess.run([cli,'dev','--once','--typecheck','disable'],cwd=work,env=env,check=True)
    subprocess.run(['python3',str(here/'product-test.py')],cwd=work,env=env,check=True)
finally:
    proc.terminate()
    try: proc.wait(timeout=10)
    except subprocess.TimeoutExpired: proc.kill(); proc.wait()
    log.close()
    print('Stopped owned backend; disposable fixture:', work, flush=True)
