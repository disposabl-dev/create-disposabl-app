import importlib.util, json, os, pathlib, secrets, shutil, socket, subprocess, tempfile, time, urllib.request
root=pathlib.Path(__file__).resolve().parents[4]; fixture=root/'packages/tests/fixtures/native-inbox-convex'
with socket.socket() as s:
    s.settimeout(1)
    if s.connect_ex(('1.1.1.1',443)) != 1: raise RuntimeError('Outbound sandbox not enforced')
for port in (3490,3491):
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1',port))
spec=importlib.util.spec_from_file_location('selected',root/'packages/tests/helpers/sdk-auth/selected_auth.py'); selected=importlib.util.module_from_spec(spec); spec.loader.exec_module(selected)
auth=selected.verify_selected_auth(root,root/'node_modules/@convex-dev/auth')
print('Auth parity:',auth['sha256'],auth['files'],flush=True)
work=pathlib.Path(tempfile.mkdtemp(prefix='native-worker-owned-')); work.chmod(0o700)
source=work/'source'; source.mkdir(); (source/'packages/tests/fixtures').mkdir(parents=True); (source/'packages/backend/convex').mkdir(parents=True)
shutil.copytree(root/'packages/disposabl-kit',source/'packages/disposabl-kit',ignore=shutil.ignore_patterns('node_modules'))
shutil.copytree(root/'packages/backend/convex/_generated',source/'packages/backend/convex/_generated')
shutil.copytree(fixture,source/'packages/tests/fixtures/native-inbox-convex',ignore=shutil.ignore_patterns('node_modules','.env.local'))
shutil.copyfile(root/'packages/tests/native-inbox-transactions.test.ts',source/'packages/tests/native-inbox-transactions.test.ts')
config=json.loads((root/'disposabl.json').read_text()); config['features']=sorted(set(config['features'])|{'payments'}); (source/'disposabl.json').write_text(json.dumps(config))
(source/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
workfixture=source/'packages/tests/fixtures/native-inbox-convex'
binary=pathlib.Path.home()/'.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'
secret=secrets.token_hex(32); name='native-worker-fixture'
key=subprocess.check_output([str(binary),'keygen','admin-key','--instance-name',name,'--instance-secret',secret],text=True).strip()
home=work/'home'; home.mkdir()
env={'PATH':os.environ['PATH'],'HOME':str(home),'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3490','CONVEX_SELF_HOSTED_ADMIN_KEY':key,'E2E_TELEMETRY_DISABLED':'1','DO_NOT_TRACK':'1','DISPOSABL_TELEMETRY_DISABLED':'1','CONVEX_AGENT_MODE':'anonymous'}
log=(work/'backend.log').open('w'); p=subprocess.Popen([str(binary),'--interface','127.0.0.1','--port','3490','--site-proxy-port','3491','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',str(work/'storage'),str(work/'db.sqlite3')],stdout=log,stderr=subprocess.STDOUT,env=env)
try:
    for _ in range(100):
        if p.poll() is not None: raise RuntimeError('backend exited')
        try: urllib.request.urlopen('http://127.0.0.1:3490/version',timeout=1); break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('backend not ready')
    cli=str(root/'node_modules/.bin/convex')
    values={'REVENUECAT_CONSUMABLE_OWNER':'custom','REVENUECAT_WEBHOOK_AUTH':'fixture-only','REVENUECAT_PROJECT_ID':'project','REVENUECAT_ENVIRONMENT':'SANDBOX','AUTUMN_SECRET_KEY':'am_sk_test_fixture','REVENUECAT_ROUTES':'[{"app":"apple","store":"APP_STORE","product":"apple-coins"}]'}
    for k,v in values.items(): subprocess.run([cli,'env','set',k,v],cwd=workfixture,env=env,check=True,stdout=subprocess.DEVNULL)
    subprocess.run([cli,'dev','--once','--typecheck','disable','--codegen','disable'],cwd=workfixture,env=env,check=True)
    env['NATIVE_INBOX_FIXTURE_URL']='http://127.0.0.1:3490'
    subprocess.run(['bun','test','packages/tests/native-inbox-transactions.test.ts'],cwd=source,env=env,check=True)
finally:
    p.terminate()
    try: p.wait(timeout=10)
    except subprocess.TimeoutExpired: p.kill(); p.wait()
    log.close(); shutil.rmtree(work)
    print('Stopped owned backend and removed fixture',flush=True)
    for port in (3490,3491):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1',port))
    print('Verified both fixture ports are free',flush=True)
