"""Fresh local-only agent fixture. Never target an existing deployment."""
import importlib.util, json, os, pathlib, secrets, shutil, socket, subprocess, sys, tempfile, time, urllib.request
from contextlib import ExitStack

ROOT = pathlib.Path(__file__).resolve().parents[4]
HERE = pathlib.Path(__file__).resolve().parent
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'
AUTH_SHA = 'e4cb80861b88a1a8f8514df7e84628d8397f05592bf5e755f9afa1737cbcf6c8'

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

def main():
    binary = os.environ.get('CONVEX_LOCAL_BINARY', str(pathlib.Path.home()/'.cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend'))
    env = {'PATH': os.environ['PATH'], 'CONVEX_LOCAL_BINARY': binary, 'AGENT_CACHED_MODULES': os.environ.get('AGENT_CACHED_MODULES', '/Users/vivekbezawada/Startups/create-disposabl-app/node_modules'), 'AGENT_SOURCE_REVISION': os.environ.get('AGENT_SOURCE_REVISION', ''), 'AGENT_LEGACY_ACTION': os.environ.get('AGENT_LEGACY_ACTION', ''), 'AGENT_MANUAL_ACTION': os.environ.get('AGENT_MANUAL_ACTION', '')}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["guarded"]()'
    os.execve('/usr/bin/sandbox-exec', ['sandbox-exec','-p',PROFILE,sys.executable,'-c',entry,__file__], env)

def guarded():
    runner = load(ROOT/'packages/tests/fixtures/billing-handoff-browser/run.py', 'runner')
    owner = load(ROOT/'packages/tests/helpers/sdk-auth/run.py', 'owner')
    with runner.disk_guard(): run(runner, owner)

def run(runner, owner):
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('1.1.1.1',443)) != 1: raise RuntimeError('Outbound sandbox not enforced')
    if shutil.disk_usage('/tmp').free < runner.MIN_FREE: raise RuntimeError('Less than 2.5 GiB free')
    for port in (3540,3541):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            probe.bind(('127.0.0.1',port))
    binary = pathlib.Path(os.environ['CONVEX_LOCAL_BINARY'])
    if not binary.is_file(): raise RuntimeError('Cached backend missing')
    deps = pathlib.Path(os.environ['AGENT_CACHED_MODULES'])
    selected = load(ROOT/'packages/tests/helpers/sdk-auth/selected_auth.py','selected')
    auth = selected.verify_selected_auth(ROOT, deps/'@convex-dev/auth')
    if auth['sha256'] != AUTH_SHA or auth['files'] != 1333: raise RuntimeError('Unexpected Auth archive')
    sha = runner.command(owner,['git','rev-parse','HEAD'],cwd=ROOT).strip()
    if len(os.environ['AGENT_SOURCE_REVISION']) != 40 or sha != os.environ['AGENT_SOURCE_REVISION']: raise RuntimeError('Set AGENT_SOURCE_REVISION to the exact checked-out commit')
    changed=runner.command(owner,['git','status','--porcelain'],cwd=ROOT).splitlines()
    allowed={'packages/tests/fixtures/agent-inert-convex/'+name for name in ('agentFixture.ts','paid-test.py','run.py','README.md','legacy-action.test.mjs','manual-action.test.mjs')}
    if any(line[3:] not in allowed for line in changed): raise RuntimeError('Unexpected checkout changes')
    work = pathlib.Path(tempfile.mkdtemp(prefix='disposabl-agent-owned-',dir='/tmp')).resolve(); work.chmod(0o700)
    source = work/'source'; source.mkdir()
    print(f'source {sha}; auth {auth["sha256"]} ({auth["files"]} files); artifacts {work}',flush=True)
    runner.command(owner,['git','archive','--format=tar','--output',str(work/'source.tar'),sha],cwd=ROOT)
    runner.command(owner,['tar','-xf',str(work/'source.tar'),'-C',str(source)])
    for name in ('agentFixture.ts','paid-test.py','run.py','README.md','legacy-action.test.mjs','manual-action.test.mjs'):
        shutil.copyfile(HERE/name,source/'packages/tests/fixtures/agent-inert-convex'/name)
    modules=source/'node_modules'; modules.mkdir()
    for dep in deps.iterdir():
        if dep.name == '@disposabl' and dep.is_dir():
            scope=modules/dep.name; scope.mkdir()
            for package in dep.iterdir():
                target=source/'packages/disposabl-kit' if package.name=='disposabl-kit' else package.resolve()
                (scope/package.name).symlink_to(target,target_is_directory=target.is_dir())
        else: (modules/dep.name).symlink_to(dep.resolve(),target_is_directory=dep.is_dir())
    (work/'home').mkdir()
    shutil.copyfile(source/'packages/tests/fixtures/account-deletion-convex/local/block-remote.cjs',work/'block-remote.cjs')
    env={'HOME':str(work/'home'),'PATH':os.environ['PATH'],'TMPDIR':str(work),'LANG':'en_US.UTF-8','CI':'1','DO_NOT_TRACK':'1','E2E_TELEMETRY_DISABLED':'1','DISPOSABL_TELEMETRY_DISABLED':'1','DISABLE_BEACON':'1','EXPO_NO_TELEMETRY':'1','EXPO_NO_DOTENV':'1','NODE_OPTIONS':'--require='+str(work/'block-remote.cjs')}
    fixture=source/'packages/backend/convex/agentFixture.ts'
    code=(source/'packages/tests/fixtures/agent-inert-convex/agentFixture.ts').read_text()
    fixture.write_text(code.replace('../../../../backend/convex/agent/','./agent/').replace('../../../../backend/convex/users/','./users/'))
    legacy = os.environ['AGENT_LEGACY_ACTION'] == '1'
    if legacy:
        import re, hashlib
        old='31b8c62ddc169d46d35b20210b0b36b3bffd2610'
        runtime=source/'packages/tests/fixtures/agent-inert-convex/runtime'; runtime.mkdir()
        for name, path in [('oldRun.ts','agent/actions/run.ts'),('oldCompute.ts','agent/actions/compute.ts'),('oldState.ts','agent/state.ts')]:
            blob=subprocess.check_output(['git','show',f'{old}:packages/backend/convex/{path}'],cwd=ROOT)
            print(f'legacy {path} sha256 {hashlib.sha256(blob).hexdigest()}',flush=True)
            if name == 'oldState.ts':
                (source/'packages/backend/convex/agent/legacyState.ts').write_bytes(blob)
            else:
                original=source/'packages/backend/convex'/path
                def rebase(match):
                    value=match.group(1)
                    target=runtime/'oldCompute.ts' if name=='oldRun.ts' and value=='./compute' else (original.parent/value).resolve()
                    return '"'+str(target)+'"'
                (runtime/name).write_text(re.sub(r'"(\.{1,2}/[^"\n]+)"',rebase,blob.decode()))
        with fixture.open('a') as out:
            out.write("""
import { claim as legacyClaimHandler } from './agent/legacyState';
import { finish as currentFinish } from './agent/state';
export const legacyClaim = internalMutationGeneric({ args: { id: v.string(), token: v.string() }, returns: v.any(), handler: (ctx, args) => (legacyClaimHandler as any)._handler(paidScheduler(ctx), args) });
export const legacyFinish = internalMutationGeneric({ args: { id: v.string(), token: v.string(), delay: v.optional(v.number()), suspended: v.optional(v.boolean()), error: v.optional(v.string()) }, returns: v.any(), handler: (ctx, args) => (currentFinish as any)._handler(paidScheduler(ctx), args) });
""")
        config=source/'disposabl.json'; data=json.loads(config.read_text()); data['features'].append('payments'); config.write_text(json.dumps(data))
    manual = os.environ['AGENT_MANUAL_ACTION'] == '1'
    if manual and legacy: raise RuntimeError('Choose one fixture mode')
    if manual:
        config=source/'disposabl.json'; data=json.loads(config.read_text()); data['features'].append('payments'); config.write_text(json.dumps(data))
    name='agent-owned'; secret=secrets.token_hex(32)
    key=runner.command(owner,[str(binary),'keygen','admin-key','--instance-name',name,'--instance-secret',secret],env=env).strip()
    marker=work/'ownership.json'; marker.write_text('{}'); marker.chmod(0o600)
    with ExitStack() as stack:
        log=stack.enter_context((work/'backend.log').open('w'))
        proc=stack.enter_context(owner.owned_backend([str(binary),'--interface','127.0.0.1','--port','3540','--site-proxy-port','3541','--instance-name',name,'--instance-secret',secret,'--disable-beacon','--local-storage',str(work/'storage'),str(work/'db.sqlite3')],env=env,stdout=log,stderr=subprocess.STDOUT))
        for _ in range(100):
            if proc.poll() is not None: raise RuntimeError('Backend exited')
            try: urllib.request.urlopen('http://127.0.0.1:3540/version',timeout=1).close(); break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('Backend startup timed out')
        def check_owner():
            if proc.poll() is not None: raise RuntimeError('Owned backend exited')
            for port in (3540,3541):
                pids=subprocess.check_output(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],text=True).split()
                if set(pids)!={str(proc.pid)}: raise RuntimeError(f'Port {port} not exclusively owned')
        check_owner()
        marker.write_text(json.dumps({'version':1,'launcherPid':os.getpid(),'backendPid':proc.pid,'launcher':os.getpid(),'backend':proc.pid,'database':str(work/'db.sqlite3')}))
        body=json.dumps({'changes':[{'name':'E2E_TELEMETRY_DISABLED','value':'1'},{'name':'BOAT_API_KEY','value':''}]}).encode()
        req=urllib.request.Request('http://127.0.0.1:3540/api/update_environment_variables',data=body,headers={'Content-Type':'application/json','Authorization':'Convex '+key},method='POST')
        with urllib.request.urlopen(req,timeout=10) as response:
            if response.status!=200: raise RuntimeError('Environment setup failed')
        admin=env|{'CONVEX_SELF_HOSTED_URL':'http://127.0.0.1:3540','CONVEX_SELF_HOSTED_ADMIN_KEY':key}
        testenv=admin|{'E2E_CONVEX_ADMIN_KEY':key,'E2E_CONVEX_URL':'http://127.0.0.1:3540','E2E_CONVEX_SITE_URL':'http://127.0.0.1:3541','CONVEX_URL':'http://127.0.0.1:3540','CONVEX_SITE_URL':'http://127.0.0.1:3541','E2E_AGENT_INERT_FIXTURE':'1','AGENT_OWNERSHIP_FILE':str(marker)}
        cli=str(source/'node_modules/convex/bin/main.js'); backend=source/'packages/backend'
        values=runner.command(owner,['node',cli,'env','list'],cwd=backend,env=admin)
        entries=dict(line.split('=',1) for line in values.splitlines() if '=' in line)
        if entries != {'E2E_TELEMETRY_DISABLED':'1','BOAT_API_KEY':''}: raise RuntimeError('Unexpected backend environment')
        def command(argv,cwd,log,childenv):
            check_owner(); runner.command(owner,argv,cwd=cwd,env=childenv,log=work/log)
        command(['node',cli,'dev','--once','--typecheck','disable','--codegen','disable'],backend,'sync.log',admin)
        if manual:
            command(['bun','test',str(source/'packages/tests/fixtures/agent-inert-convex/manual-action.test.mjs')],source,'manual-action.log',testenv|{'AGENT_FIXTURE_SOURCE':str(source)})
            print('Retained worker manual-resume regression passed',flush=True)
            return
        if legacy:
            command(['bun','test',str(source/'packages/tests/fixtures/agent-inert-convex/legacy-action.test.mjs')],source,'legacy-action.log',testenv|{'AGENT_FIXTURE_SOURCE':str(source)})
            print('Legacy action regression passed',flush=True)
            return
        command(['bun','run','e2e','run','agent.e2e.ts','--target','backend','--retries','0'],source,'e2e.log',testenv)
        command(['python3',str(source/'packages/tests/fixtures/agent-inert-convex/paid-test.py')],source,'paid.log',testenv)
        config=source/'disposabl.json'; data=json.loads(config.read_text()); data['features'].append('payments'); config.write_text(json.dumps(data))
        command(['node',cli,'dev','--once','--typecheck','disable','--codegen','disable'],backend,'paid-sync.log',admin)
        command(['python3',str(source/'packages/tests/fixtures/agent-inert-convex/paid-test.py')],source,'paid-claim.log',testenv|{'AGENT_PAID_CLAIM_ONLY':'1'})
        print('Agent fixture passed',flush=True)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(f'Fixture failed: {exc}',file=sys.stderr); sys.exit(1)
