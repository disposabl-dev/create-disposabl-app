import os, subprocess, secrets, tempfile, time, urllib.request, sys, socket, pathlib, json
root=str(pathlib.Path(__file__).resolve().parent.parents[3])
for port in (3540, 3541):
 with socket.socket() as probe:
  probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
  try: probe.bind(('127.0.0.1', port))
  except OSError as exc: raise RuntimeError(f'Fixture port {port} is unavailable') from exc
binary=str(pathlib.Path.home()/'.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend')
base=tempfile.mkdtemp(prefix='disposabl-3540-'); secret=secrets.token_hex(32); name='isolated-product-e2e'
key=subprocess.check_output([binary,'keygen','admin-key','--instance-name',name,'--instance-secret',secret],text=True).strip()
env={k:v for k,v in os.environ.items() if not any(x in k.upper() for x in ('CONVEX','POSTHOG','AUTUMN','REVENUECAT','BOAT','R2_','RESEND','GOOGLE','GITHUB','VERCEL','E2E_'))}
env.update({'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3540','CONVEX_SELF_HOSTED_ADMIN_KEY':key,'E2E_CONVEX_ADMIN_KEY':key,'E2E_CONVEX_URL':'http://127.0.0.1:3540','E2E_CONVEX_SITE_URL':'http://127.0.0.1:3541','CONVEX_URL':'http://127.0.0.1:3540','CONVEX_SITE_URL':'http://127.0.0.1:3541','E2E_TELEMETRY_DISABLED':'1','DO_NOT_TRACK':'1','E2E_AGENT_INERT_FIXTURE':'1'})
fixture=os.path.join(root,'packages/backend/convex/agentFixture.ts')
if os.path.exists(fixture): raise RuntimeError('fixture path already exists')
log=open(base+'/backend.log','w'); proc=subprocess.Popen([binary,'--interface','127.0.0.1','--port','3540','--site-proxy-port','3541','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',base+'/storage',base+'/db.sqlite3'],stdout=log,stderr=subprocess.STDOUT,env=env)
cli=os.path.join(root,'node_modules/.bin/convex'); cwd=os.path.join(root,'packages/backend')
def run(args, **kw):
 print('RUN', ' '.join(args),flush=True); return subprocess.run(args,cwd=kw.get('cwd',cwd),env=env,check=True)
try:
 source=pathlib.Path(root,'packages/tests/fixtures/agent-inert-convex/agentFixture.ts').read_text()
 pathlib.Path(fixture).write_text(source.replace('../../../../backend/convex/agent/','./agent/'))
 for _ in range(100):
  if proc.poll() is not None: raise RuntimeError('isolated backend exited before readiness')
  try: urllib.request.urlopen('http://127.0.0.1:3540/version',timeout=1);break
  except Exception: time.sleep(.1)
 else: raise RuntimeError('backend did not start')
 run([cli,'env','set','E2E_TELEMETRY_DISABLED','1'])
 run([cli,'env','set','BOAT_API_KEY',''])
 run([cli,'env','get','E2E_TELEMETRY_DISABLED'])
 for setting in ('E2E_TELEMETRY_DISABLED','BOAT_API_KEY','R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','AUTUMN_SECRET_KEY','POSTHOG_PROJECT_TOKEN','RESEND_API_KEY','AUTH_GOOGLE_CLIENT_SECRET','REVENUECAT_WEBHOOK_AUTH'):
  request=urllib.request.Request('http://127.0.0.1:3540/api/query',data=json.dumps({'path':'_system/cli/queryEnvironmentVariables:get','args':{'name':setting},'format':'json'}).encode(),headers={'Content-Type':'application/json','Authorization':'Convex '+key})
  response=json.load(urllib.request.urlopen(request))
  value=(response.get('value') or {}).get('value') or ''
  if response.get('status')!='success' or value.strip()!=('1' if setting=='E2E_TELEMETRY_DISABLED' else ''): raise RuntimeError('Unsafe local fixture setting: '+setting)
 print('Fresh isolated database; provider credentials absent, BOAT_API_KEY empty; payments feature disabled in disposabl.json.',flush=True)
 run([cli,'dev','--once','--typecheck','disable'])
 print('Product backend synchronized with inert fixture',flush=True)
 result=subprocess.run(['bun','run','e2e','run','agent.e2e.ts','--target','backend','--retries','0'],cwd=root,env=env)
 print('SCOPED_SUITE_EXIT',result.returncode,flush=True)
 if result.returncode: sys.exit(result.returncode)
 run(['python3',os.path.join(root,'packages/tests/fixtures/agent-inert-convex/paid-test.py')],cwd=root)
finally:
 proc.terminate()
 try: proc.wait(timeout=10)
 except subprocess.TimeoutExpired: proc.kill();proc.wait()
 if os.path.exists(fixture): os.unlink(fixture)
 log.close()
 print('Stopped owned backend; data directory:',base,flush=True)
