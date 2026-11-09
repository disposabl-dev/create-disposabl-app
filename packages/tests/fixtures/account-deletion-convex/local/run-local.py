import os, pathlib, shutil, socket, subprocess, time, secrets, json, urllib.request, threading, tempfile, signal
root=pathlib.Path(__file__).resolve().parents[5]
work=pathlib.Path(tempfile.mkdtemp(prefix='disposabl-local-deletion-')); project=work/'project'; project.mkdir(); (work/'home').mkdir(); fixture=pathlib.Path(__file__).resolve().parent/'convex'
shutil.copy2(pathlib.Path(__file__).resolve().parent/'block-remote.cjs',work/'block-remote.cjs')
print('Fixture artifacts:',work,flush=True)
if shutil.disk_usage('/tmp').free < 2.5*1024**3: raise RuntimeError('Insufficient free space (<2.5 GiB)')
for port in (3480,3481):
 with socket.socket() as s:
  s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1',port))
shutil.copytree(fixture,project/'convex',dirs_exist_ok=True)
for p in (project/'convex').rglob('*.ts'):
 text=p.read_text().replace('../../../../../../backend/convex/',str(root/'packages/backend/convex')+'/').replace('../../../../../backend/convex/',str(root/'packages/backend/convex')+'/')
 p.write_text(text)

if not (project/'node_modules').exists(): (project/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
(project/'package.json').write_text('{"name":"local-deletion-fixture","private":true,"dependencies":{"convex":"^1.49.0"}}')
binary=os.environ.get('CONVEX_LOCAL_BINARY');
if not binary or not pathlib.Path(binary).is_file(): raise RuntimeError('Set CONVEX_LOCAL_BINARY to the cached local backend binary')
name='local-deletion-synthetic'; secret=secrets.token_hex(32)
env={'HOME':str(work/'home'),'PATH':os.environ['PATH'],'TMPDIR':str(work),'LANG':'en_US.UTF-8','CI':'1','DO_NOT_TRACK':'1','E2E_TELEMETRY_DISABLED':'1','DISABLE_BEACON':'1','NODE_OPTIONS':'--require='+str(work/'block-remote.cjs')}
key=subprocess.check_output([binary,'keygen','admin-key','--instance-name',name,'--instance-secret',secret],env=env,text=True).strip()
proc=None; stopped=threading.Event()
log=(work/'backend.log').open('w'); sync=(work/'sync.log').open('w'); tests=(work/'tests.log').open('w')
def cancel(_signum, _frame): raise KeyboardInterrupt()
signal.signal(signal.SIGTERM, cancel)
try:
 proc=subprocess.Popen([binary,'--interface','127.0.0.1','--port','3480','--site-proxy-port','3481','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',str(work/'storage'),str(work/'db.sqlite3')],env=env,stdout=log,stderr=subprocess.STDOUT)
 def guard():
  while not stopped.wait(.5):
   if shutil.disk_usage('/tmp').free < 2.5*1024**3:
    print('Disk threshold reached; terminating owned backend',flush=True); proc.terminate(); return
 threading.Thread(target=guard,daemon=True).start()
 for i in range(100):
  if proc.poll() is not None: raise RuntimeError('Owned backend exited before ready')
  try: urllib.request.urlopen('http://127.0.0.1:3480/version',timeout=1); break
  except OSError: time.sleep(.1)
 else: raise RuntimeError('Backend readiness timeout')
 body=json.dumps({'changes':[{'name':'E2E_TELEMETRY_DISABLED','value':'1'},{'name':'BOAT_API_KEY','value':''}]}).encode()
 req=urllib.request.Request('http://127.0.0.1:3480/api/update_environment_variables',data=body,headers={'Content-Type':'application/json','Authorization':'Convex '+key},method='POST')
 with urllib.request.urlopen(req,timeout=10) as response: assert response.status==200
 env.update({'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3480','CONVEX_SELF_HOSTED_ADMIN_KEY':key})
 cli=str(root/'node_modules/convex/bin/main.js')
 subprocess.run(['node',cli,'dev','--once','--typecheck','disable','--codegen','disable'],cwd=project,env=env,stdout=sync,stderr=subprocess.STDOUT,check=True)
 print('Sync finished; running real local transactions',flush=True)
 testenv={k:v for k,v in env.items() if not k.startswith('CONVEX_SELF_HOSTED_')};testenv['LOCAL_DELETION_FIXTURE_URL']='http://127.0.0.1:3480'
 subprocess.run(['bun','test','packages/tests/account-deletion-active.test.ts','--test-name-pattern','local coordinator advances real component'],cwd=root,env=testenv,stdout=tests,stderr=subprocess.STDOUT,check=True)
 print('Real fixture passed',flush=True)
finally:
 stopped.set()
 if proc and proc.poll() is None:
  proc.terminate()
  try: proc.wait(timeout=10)
  except subprocess.TimeoutExpired: proc.kill(); proc.wait()
 log.close(); sync.close(); tests.close(); print('Owned backend stopped',flush=True)
