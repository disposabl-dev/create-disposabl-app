import os, pathlib, shutil, socket, subprocess, time, secrets, json, urllib.request, threading, tempfile, signal, importlib.util, sys
from contextlib import ExitStack

def main():
 root=pathlib.Path(__file__).resolve().parents[5]
 helper=importlib.util.spec_from_file_location('sdk_runner',root/'packages/tests/helpers/sdk-auth/run.py')
 owner=importlib.util.module_from_spec(helper); helper.loader.exec_module(owner)
 if subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip():
  raise RuntimeError('Commit the candidate before running this fixture')
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
 version=json.loads((root/'node_modules/@convex-dev/auth/package.json').read_text())['version']
 if version != owner.EXPECTED_AUTH: raise RuntimeError('Installed auth component must match selected .8')
 work=pathlib.Path(tempfile.mkdtemp(prefix='disposabl-local-deletion-')); project=work/'project'; project.mkdir(); (work/'home').mkdir(); fixture=pathlib.Path(__file__).resolve().parent/'convex'
 shutil.copy2(pathlib.Path(__file__).resolve().parent/'block-remote.cjs',work/'block-remote.cjs')
 print('Fixture source:',sha,'artifacts:',work,flush=True)
 (work/'source-sha.txt').write_text(sha+'\n')
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
 key=subprocess.check_output([binary,'keygen','admin-key','--instance-name',name,'--instance-secret',secret],env=env,text=True,stderr=subprocess.PIPE).strip()
 proc=None; stopped=threading.Event()
 log=(work/'backend.log').open('w'); sync=(work/'sync.log').open('w'); tests=(work/'tests.log').open('w')
 stack=ExitStack()
 try:
  proc=stack.enter_context(owner.owned_backend([binary,'--interface','127.0.0.1','--port','3480','--site-proxy-port','3481','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',str(work/'storage'),str(work/'db.sqlite3')],env=env,stdout=log,stderr=subprocess.STDOUT))
  def guard():
   while not stopped.wait(.5):
    if shutil.disk_usage('/tmp').free < 2.5*1024**3:
     print('Disk threshold reached; cancelling owned fixture',flush=True); os.kill(os.getpid(),signal.SIGTERM); return
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
  with owner.owned_backend(['node',cli,'dev','--once','--typecheck','disable','--codegen','disable'],process_group=True,stop_timeout=1,cwd=project,env=env,stdout=sync,stderr=subprocess.STDOUT) as child:
   if child.wait(): raise RuntimeError('Fixture sync failed; inspect sync.log')
  print('Sync finished; running real local transactions',flush=True)
  testenv={k:v for k,v in env.items() if not k.startswith('CONVEX_SELF_HOSTED_')};testenv['LOCAL_DELETION_FIXTURE_URL']='http://127.0.0.1:3480'
  with owner.owned_backend(['bun','test','packages/tests/account-deletion-active.test.ts','--test-name-pattern','local coordinator advances real component'],process_group=True,stop_timeout=1,cwd=root,env=testenv,stdout=tests,stderr=subprocess.STDOUT) as child:
   if child.wait(): raise RuntimeError('Fixture tests failed; inspect tests.log')
  print('Real fixture passed',flush=True)
 finally:
  stopped.set()
  try:
   stack.close()
  finally:
   log.close(); sync.close(); tests.close()

if __name__ == '__main__':
 try:
  main()
 except subprocess.SubprocessError:
  print('Fixture subprocess failed; inspect retained logs',file=sys.stderr)
  sys.exit(1)
