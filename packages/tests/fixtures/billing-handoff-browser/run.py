"""Run the browser handoff proof against an owned provider-inert 3530 fixture."""
import os, pathlib, secrets, socket, subprocess, tempfile, time, urllib.request

root = pathlib.Path(__file__).resolve().parents[4]
for port in (3530, 3531):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as error:
            raise SystemExit(f"Fixture port {port} is unavailable: {error}")
base = pathlib.Path(tempfile.mkdtemp(prefix="disposabl-billing-local-", dir="/tmp"))
archive = subprocess.Popen(["git", "archive", "HEAD"], cwd=root, stdout=subprocess.PIPE)
subprocess.run(["tar", "-xf", "-", "-C", str(base)], stdin=archive.stdout, check=True)
archive.stdout.close()
if archive.wait() != 0:
    raise RuntimeError("Could not archive source revision")
(base / ".billing-handoff-local-fixture").touch()
env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "TMPDIR", "USER", "LOGNAME")}
env.update({"CONVEX_SELF_HOSTED_URL": "http://127.0.0.1:3530", "E2E_CONVEX_URL": "http://127.0.0.1:3530", "E2E_CONVEX_SITE_URL": "http://127.0.0.1:3531", "EXPO_PUBLIC_CONVEX_URL": "http://127.0.0.1:3530", "EXPO_PUBLIC_CONVEX_SITE_URL": "http://127.0.0.1:3531", "E2E_BILLING_HANDOFF_BROWSER": "1", "E2E_TELEMETRY_DISABLED": "1", "DISPOSABL_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1", "EXPO_NO_TELEMETRY": "1", "EXPO_NO_DOTENV": "1", "NODE_USE_ENV_PROXY": "1", "HTTP_PROXY": "http://127.0.0.1:9", "HTTPS_PROXY": "http://127.0.0.1:9", "NO_PROXY": "localhost,127.0.0.1,::1"})
binary = pathlib.Path.home() / ".cache/convex/binaries/precompiled-2026-10-22-1447815/convex-local-backend"
name, secret = "billing-browser-fixture", secrets.token_hex(32)
key = subprocess.check_output([str(binary), "keygen", "admin-key", "--instance-name", name, "--instance-secret", secret], text=True).strip()
env["CONVEX_SELF_HOSTED_ADMIN_KEY"] = key

def run(args, cwd):
    print("RUN", " ".join(args), flush=True)
    subprocess.run(args, cwd=cwd, env=env, check=True)

run(["bun", str(root / "packages/tests/fixtures/billing-handoff-local/prepare.ts"), str(base)], root)
run(["bun", "install", "--frozen-lockfile", "--ignore-scripts"], base)
log = (base / "backend.log").open("w")
p = subprocess.Popen([str(binary), "--interface", "127.0.0.1", "--port", "3530", "--site-proxy-port", "3531", "--convex-origin", "http://127.0.0.1:3530", "--convex-site", "http://127.0.0.1:3531", "--instance-name", name, "--instance-secret", secret, "--disable-beacon", "--local-storage", str(base / "storage"), str(base / "database.sqlite3")], env=env, stdout=log, stderr=subprocess.STDOUT)
try:
    for _ in range(100):
        if p.poll() is not None:
            raise RuntimeError("Backend exited before readiness")
        try:
            urllib.request.urlopen("http://127.0.0.1:3530/version", timeout=1)
            break
        except Exception:
            time.sleep(0.1)
    else:
        raise RuntimeError("Backend startup timed out")
    cli = str(base / "node_modules/.bin/convex")
    backend = base / "packages/backend"
    run([cli, "env", "set", "E2E_TELEMETRY_DISABLED", "1"], backend)
    run([cli, "env", "set", "BOAT_API_KEY", ""], backend)
    run([cli, "dev", "--once", "--typecheck", "disable", "--codegen", "disable"], backend)
    run(["bun", "run", "e2e", "run", "billing-handoff-auth.e2e.ts", "--target", "web", "--retries", "0", "--no-cache", "--output", ".e2e/billing-handoff-auth"], root)
finally:
    p.terminate()
    try:
        p.wait(timeout=10)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait()
    log.close()
    print("Stopped owned backend; fixture:", base, flush=True)
