"""Exercise synthetic product auth erasure on the runner-owned backend."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import uuid

BASE = os.environ.get("LOCAL_AUTH_FIXTURE_URL")
if BASE != "http://127.0.0.1:3490":
    raise RuntimeError("Run only through the owned 3490/3491 fixture runner")
ownership = Path(__file__).resolve().parents[4] / 'packages/tests/helpers/sdk-auth/ownership.ts'
subprocess.run(['bun', '-e', '''
const { assertOwnedSdkBackend } = await import(process.argv[1]);
assertOwnedSdkBackend({ markerVariable: "LOCAL_AUTH_OWNERSHIP_FILE",
  ports: [3490, 3491], claimDirectory: ".auth-erasure-claimed" });
''', str(ownership)], check=True)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Fixture redirect rejected")

urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()))
URL = BASE + "/api/mutation"
def call(name, args):
    req = urllib.request.Request(URL, data=json.dumps({"path": "product:" + name, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(req))
    if result["status"] != "success":
        raise RuntimeError(result.get("errorMessage", "unknown error"))
    return result["value"]
def identity(name, args):
    req = urllib.request.Request(URL, data=json.dumps({"path": "fixture:" + name, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(req))
    if result["status"] != "success": raise RuntimeError(result.get("errorMessage", "unknown error"))
    return result["value"]
def authenticated(token):
    req = urllib.request.Request(BASE + "/api/query", data=json.dumps({"path": "product:isAuthenticated", "args": {}, "format": "json"}).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    result = json.load(urllib.request.urlopen(req))
    assert result["status"] == "success", result
    return result["value"]
def google_user():
    sub, state, code = (uuid.uuid4().hex for _ in range(3))
    call("googleStart", {"state": state})
    call("googleMint", {"state": state, "code": code, "sub": sub})
    login = call("completeSignInWithGoogle", {"state": state, "code": code})
    assert login["status"] == "complete"
    return sub, call("googleLookup", {"sub": sub}), login["tokens"]["accessToken"]
def denied(fn, reason):
    try: fn()
    except RuntimeError as error:
        assert reason in str(error), str(error)
        return
    raise AssertionError("expected rejection")
sub, owner, access = google_user(); other_sub, other, other_access = google_user()
assert authenticated(access) and authenticated(other_access)
password = "Fixture-Password-982!"
for user in [owner, other]: call("setPassword", {"userId": user, "password": password})
identity("setUsername", {"userId": owner, "username": "u" + uuid.uuid4().hex})
identity("setUsername", {"userId": other, "username": "u" + uuid.uuid4().hex})
identity("seed", {"userId": owner, "count": 201})
identity("seed", {"userId": other, "count": 1})
call("seedCore", {"userId": owner, "accounts": 201, "tokens": 201})
session = call("coreLogin", {"userId": owner, "providerAccountId": owner + "-0"})
requested = call("requestProductDeletion", {"userId": owner})
denied(lambda: call("productAuthCleanup", {"userId": owner, "expectedRequestedAt": requested + 1}), "Matching deletion request")
denied(lambda: call("productAuthCleanup", {"userId": other, "expectedRequestedAt": requested}), "Matching deletion request")
args = {"userId": owner, "expectedRequestedAt": requested}
denied(lambda: call("failAuthBatch", args), "synthetic core purge failure")
assert authenticated(access) and call("verifyPassword", {"userId": owner, "password": password})["success"]
assert call("productAuthProgress", {"userId": owner}) is None
assert not identity("counts", {"userId": owner})["fenced"]
assert identity("getUsername", {"userId": owner}) is not None
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda _: call("productAuthCleanup", args), range(2)))
assert sorted(r["batches"] for r in results) == [1, 2]
assert not authenticated(access) and authenticated(other_access)
assert call("coreSession", {"sessionId": session["sessionId"]}) is None
assert call("coreRefresh", {"refreshToken": session["refreshToken"]})["kind"] == "noSession"
assert not call("verifyPassword", {"userId": owner, "password": password})["success"]
assert call("verifyPassword", {"userId": other, "password": password})["success"]
for _ in range(20):
    result = call("productAuthCleanup", args)
    if result["state"] == "linked_auth_cleared": break
assert result["state"] == "linked_auth_cleared" and result["unattributedAuthRowsUnverified"]
assert result["passwordsDeleted"] == 1 and result["accountsDeleted"] == 202
assert result["usernamesDeleted"] == 1 and result["emailsDeleted"] == 201 and result["emailChallengesDeleted"] == 202
assert result["usernameCleared"] and result["attributedEmailsCleared"] and result["unattributedEmailChallengesUnverified"]
counts = identity("counts", {"userId": owner})
assert counts == {"emails": 0, "challenges": 0, "anonymous": True, "fenced": True}
assert identity("counts", {"userId": other})["emails"] == 1
denied(lambda: identity("setUsername", {"userId": owner, "username": "blocked" + uuid.uuid4().hex}), "User identity has been erased")
assert not identity("complete", {"userId": owner, "index": 0})["success"]
assert not identity("recover", {"userId": owner})["success"]
assert result["refreshTokensDeleted"] >= 201
assert call("productAuthCleanup", args) == result == call("productAuthProgress", {"userId": owner})
assert call("cutoff", {"sub": sub}) is not None
state, code = uuid.uuid4().hex, uuid.uuid4().hex
call("googleStart", {"state": state})
call("googleMint", {"state": state, "code": code, "sub": sub})
denied(lambda: call("completeSignInWithGoogle", {"state": state, "code": code}), "re-registration")
assert call("googleLookup", {"sub": other_sub}) == other
print("PASS: product atomic auth fence, concurrent batches, stale request, cutoff and unaffected owner")
