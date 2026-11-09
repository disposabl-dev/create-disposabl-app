#!/usr/bin/env python3
"""Exercise registered public admission on a fresh, owned local backend."""
import hashlib, importlib.util, json, os, pathlib, secrets, shutil, socket, subprocess, sys, tempfile, time, urllib.request, uuid
from contextlib import ExitStack
ROOT = pathlib.Path(__file__).resolve().parents[4]
DEPS = pathlib.Path(os.environ.get("PUBLIC_ADMISSION_DEPS", ""))
BINARY = pathlib.Path(os.environ.get("CONVEX_LOCAL_BINARY", ""))
BASE = "http://127.0.0.1:3480"
SHA = os.environ.get("PUBLIC_ADMISSION_SOURCE_REVISION", "")
PROFILE = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))'
AUTH_SHA = "e4cb80861b88a1a8f8514df7e84628d8397f05592bf5e755f9afa1737cbcf6c8"
def load(path):
    s = importlib.util.spec_from_file_location("helper", path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
def guarded():
    runner=load(ROOT/"packages/tests/fixtures/billing-handoff-browser/run.py")
    try:
        with runner.disk_guard(): run(runner)
    finally:
        shutil.rmtree(os.environ["HOME"])

def run(runner):
    if shutil.disk_usage("/tmp").free < runner.MIN_FREE: raise RuntimeError("Less than 2.5 GiB free")
    if not DEPS.is_absolute() or not DEPS.is_dir(): raise RuntimeError("Set PUBLIC_ADMISSION_DEPS to cached node_modules")
    if not BINARY.is_absolute() or not BINARY.is_file(): raise RuntimeError("Set CONVEX_LOCAL_BINARY to cached backend")
    if not __debug__: raise RuntimeError("Python assertions must be enabled")
    if len(SHA) != 40: raise RuntimeError("Set PUBLIC_ADMISSION_SOURCE_REVISION to the full commit SHA")
    if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT, text=True).strip(): raise RuntimeError("Source checkout must be clean and committed")
    with socket.socket() as s:
        s.settimeout(1)
        if s.connect_ex(("1.1.1.1", 443)) != 1: raise RuntimeError("outbound sandbox not enforced")
    for port in (3480, 3481):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("127.0.0.1", port))
    if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() != SHA: raise RuntimeError("wrong source")
    auth=load(ROOT/"packages/tests/helpers/sdk-auth/selected_auth.py").verify_selected_auth(ROOT, DEPS/"@convex-dev/auth")
    if auth["files"] != 1333 or auth["sha256"] != AUTH_SHA: raise RuntimeError("auth mismatch")
    work=pathlib.Path(tempfile.mkdtemp(prefix="public-admission-",dir="/tmp")); work.chmod(0o700)
    provenance = {"source": SHA, "backend": str(BINARY.resolve()),
                  "backend_sha256": hashlib.sha256(BINARY.read_bytes()).hexdigest(),
                  "lockfile_sha256": hashlib.sha256((ROOT / "bun.lock").read_bytes()).hexdigest(),
                  "limitation": "Cached dependencies are linked, not a verified frozen installation. Only Auth has archive byte parity. Package metadata hashes do not verify package contents or publisher origin.",
                  "packages": {}}
    for name in ("convex", "@convex-dev/agent", "@convex-dev/auth"):
        package = DEPS / name / "package.json"
        provenance["packages"][name] = {"path": str(package.resolve()),
            "version": json.loads(package.read_text())["version"],
            "package_json_sha256": hashlib.sha256(package.read_bytes()).hexdigest()}
    (work / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("LIMITATION", provenance["limitation"], flush=True)
    source=work/"source"; source.mkdir()
    owner=load(ROOT/"packages/tests/helpers/sdk-auth/run.py")
    runner.command(owner, ["git","archive","--format=tar","--output",str(work/"source.tar"),SHA], cwd=ROOT)
    runner.command(owner, ["tar","-xf",str(work/"source.tar"),"-C",str(source)])
    modules=source/"node_modules"; modules.mkdir()
    for dep in DEPS.iterdir():
        if dep.name == "@disposabl" and dep.is_dir():
            scope=modules/dep.name; scope.mkdir()
            for package in dep.iterdir():
                target=source/"packages/disposabl-kit" if package.name=="disposabl-kit" else package.resolve()
                (scope/package.name).symlink_to(target,target_is_directory=target.is_dir())
        else: (modules/dep.name).symlink_to(dep.resolve(),target_is_directory=dep.is_dir())
    config=source/"disposabl.json"; data=json.loads(config.read_text())
    if "payments" not in data["features"]: data["features"].append("payments")
    config.write_text(json.dumps(data))
    product=source/"packages/backend/convex"
    schema=product/"schema.ts"; text=schema.read_text()
    # Add one isolated adapter control row, never a product table or credential.
    needle="export default defineSchema({"
    if text.count(needle)!=1: raise RuntimeError("schema shape changed")
    schema.write_text(text.replace(needle,needle+'\n  publicAdmissionTransport: defineTable({ userId: v.string(), mode: v.string(), calls: v.number() }),'))
    internal=product/"agent/internal.ts"; text=internal.read_text()
    needle="  check = requireCredits,"
    replacement='''  check = (userId: string) => requireCredits(userId, paymentsEnabled, "synthetic", (_key, method, body) =>
    ctx.runAction(makeFunctionReference("publicAdmissionFixture:transport") as any, { method, body })),'''
    if text.count(needle)!=1: raise RuntimeError("credit injection point changed")
    internal.write_text('import { makeFunctionReference } from "convex/server";\n' + text.replace(needle,replacement))
    shutil.copyfile(source/"packages/tests/fixtures/low-credit-convex/public-admission-fixture.ts.txt", product/"publicAdmissionFixture.ts")
    home=work/"home"; home.mkdir()
    env={"PATH":os.environ["PATH"],"HOME":str(home),"TMPDIR":str(work),"CI":"1","DO_NOT_TRACK":"1","E2E_TELEMETRY_DISABLED":"1","DISPOSABL_TELEMETRY_DISABLED":"1","DISABLE_BEACON":"1","EXPO_NO_TELEMETRY":"1","EXPO_NO_DOTENV":"1"}
    name="public-admission-owned"; secret=secrets.token_hex(32)
    key=runner.command(owner,[str(BINARY),"keygen","admin-key","--instance-name",name,"--instance-secret",secret],env=env).strip()
    print("source",SHA,"auth",auth["sha256"],"files",auth["files"],"private artifacts",work,flush=True)
    def request(path, body, authkey=None):
        req=urllib.request.Request(BASE+path,data=json.dumps(body).encode(),headers={"Content-Type":"application/json",**({"Authorization":authkey} if authkey else {})},method="POST")
        with urllib.request.urlopen(req,timeout=30) as response:
            data=response.read(); return json.loads(data) if data else None
    def call(kind,path,args,authkey=None):
        check_owner()
        result=request("/api/"+kind,{"path":path,"args":args,"format":"json"},authkey)
        return result
    def value(kind,path,args,authkey=None):
        result=call(kind,path,args,authkey)
        if result.get("status") != "success": raise RuntimeError(path+" failed: "+str(result.get("errorMessage")))
        return result["value"]
    with ExitStack() as stack:
        log=stack.enter_context((work/"backend.log").open("w"))
        proc=stack.enter_context(owner.owned_backend([str(BINARY),"--interface","127.0.0.1","--port","3480","--site-proxy-port","3481","--instance-name",name,"--instance-secret",secret,"--disable-beacon","--local-storage",str(work/"storage"),str(work/"db.sqlite3")],env=env,stdout=log,stderr=subprocess.STDOUT))
        for _ in range(100):
            if proc.poll() is not None: raise RuntimeError("backend exited")
            try: urllib.request.urlopen(BASE+"/version",timeout=1).close(); break
            except OSError: time.sleep(.1)
        else: raise RuntimeError("backend timeout")
        def check_owner():
            if proc.poll() is not None: raise RuntimeError("owned backend exited")
            for port in (3480,3481):
                pids=subprocess.check_output(["lsof","-nP","-t",f"-iTCP:{port}","-sTCP:LISTEN"],text=True).split()
                if set(pids)!={str(proc.pid)}: raise RuntimeError("port ownership mismatch")
        check_owner()
        request("/api/update_environment_variables",{"changes":[{"name":"E2E_TELEMETRY_DISABLED","value":"1"},{"name":"BOAT_API_KEY","value":""}]},"Convex "+key)
        admin=env|{"CONVEX_SELF_HOSTED_URL":BASE,"CONVEX_SELF_HOSTED_ADMIN_KEY":key}
        cli=str(source/"node_modules/convex/bin/main.js")
        check_owner()
        runner.command(owner,["node",cli,"dev","--once","--typecheck","disable","--codegen","disable"],cwd=source/"packages/backend",env=admin,log=work/"sync.log")
        signup=value("mutation","auth:signUpWithUsernamePassword",{"username":"fixture"+secrets.token_hex(8),"password":"Fixture-"+secrets.token_hex(16)+"!"})
        token=signup["tokens"]["accessToken"]; bearer="Bearer "+token
        user=value("query","users/index:current",{},bearer)["id"]
        appId=str(uuid.uuid4())
        fixture=value("function","publicAdmissionFixture:setup",{"userId":user,"appId":appId},"Convex "+key)
        args={"userId":user,"appId":appId,"threadId":fixture["threadId"]}
        before=value("function","publicAdmissionFixture:snapshot",args,"Convex "+key)
        assert len(before["messages"])==0 and len(before["sessions"])==0 and before["calls"]==0
        for i,mode in enumerate(("low","unknown","error"),1):
            value("function","publicAdmissionFixture:mode",{"mode":mode},"Convex "+key)
            result=call("action","agent/index:sendMessageChecked",{"appId":appId,"prompt":"fixture admission"},bearer)
            expected="credits_required" if mode=="low" else "credits_unavailable"
            if result.get("status")!="error" or expected not in json.dumps(result): raise RuntimeError(f"{mode} unexpected result {result}")
            after=value("function","publicAdmissionFixture:snapshot",args,"Convex "+key)
            assert after["calls"]==i and after["app"]==before["app"] and after["sessions"]==[] and after["messages"]==[]
            print("PASS",mode,expected,"transport calls",i,"no component message or session",flush=True)
        # Success controls use a no-op tick only after all real-worker negative cases.
        tick=product/"agent/actions/run.ts"
        tick.write_text('import { internalActionGeneric } from "convex/server";\nimport { v } from "convex/values";\nexport const tick = internalActionGeneric({args:{id:v.string()},handler:()=>null});\n')
        request("/api/update_environment_variables",{"changes":[{"name":"BOAT_API_KEY","value":"synthetic-config-only"}]},"Convex "+key)
        check_owner()
        runner.command(owner,["node",cli,"dev","--once","--typecheck","disable","--codegen","disable"],cwd=source/"packages/backend",env=admin,log=work/"positive-sync.log")
        active=value("function","publicAdmissionFixture:seedActive",{"userId":user},"Convex "+key)
        prior=value("function","publicAdmissionFixture:snapshot",args,"Convex "+key)
        assert len(prior["sessions"])==1 and len(prior["debits"])==1
        value("function","publicAdmissionFixture:mode",{"mode":"low"},"Convex "+key)
        result=call("action","agent/index:sendMessageChecked",{"appId":appId,"prompt":"active denial"},bearer)
        assert result.get("status")=="error" and "credits_required" in json.dumps(result)
        denied=value("function","publicAdmissionFixture:snapshot",args,"Convex "+key)
        assert denied["calls"]==4 and denied["app"]==prior["app"] and denied["messages"]==[] and denied["sessions"]==prior["sessions"] and denied["debits"]==prior["debits"]
        print("PASS active paid window still requires balance check",flush=True)
        value("function","publicAdmissionFixture:mode",{"mode":"ok"},"Convex "+key)
        for n in (1,2):
            value("action","agent/index:sendMessageChecked",{"appId":appId,"prompt":f"admit {n}"},bearer)
            current=value("function","publicAdmissionFixture:snapshot",args,"Convex "+key)
            assert current["calls"]==4+n and len(current["messages"])==n
            assert current["sessions"]==prior["sessions"] and current["debits"]==prior["debits"]
            assert current["app"]["agent"]["computeSessionId"]==active["sessionId"]
        print("PASS two public admissions recheck ten credits and reuse one synthetic active session and debit; inert worker",flush=True)
    print("PASS public admission fixture; owned backend stopped",flush=True)
def main():
    if len(sys.argv) != 1: raise SystemExit("No arguments supported; configure with environment variables")
    home = tempfile.mkdtemp(prefix="public-admission-home-", dir="/tmp")
    os.chmod(home, 0o700)
    env = {"PATH": os.environ["PATH"], "HOME": home,
           "PUBLIC_ADMISSION_DEPS": os.environ.get("PUBLIC_ADMISSION_DEPS", ""),
           "CONVEX_LOCAL_BINARY": os.environ.get("CONVEX_LOCAL_BINARY", ""),
           "PUBLIC_ADMISSION_SOURCE_REVISION": os.environ.get("PUBLIC_ADMISSION_SOURCE_REVISION", ""),
           "E2E_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1"}
    entry = 'import runpy,sys; runpy.run_path(sys.argv[1])["guarded"]()'
    evidence = pathlib.Path(tempfile.mkdtemp(prefix="public-admission-output-", dir="/tmp"))
    evidence.chmod(0o700)
    log = evidence / "runner.log"
    print("Private runner output:", log, flush=True)
    fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.dup2(fd, 1)
    os.dup2(fd, 2)
    os.close(fd)
    os.execve("/usr/bin/sandbox-exec", ["sandbox-exec", "-p", PROFILE, sys.executable, "-c", entry, __file__], env)

if __name__=="__main__":
    try: main()
    except Exception as e:
        print("FAILED",type(e).__name__,str(e),file=sys.stderr,flush=True); sys.exit(1)
