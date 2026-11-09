"""Exercise the product operator mutation with synthetic users on loopback 3540."""
import concurrent.futures
import json
import urllib.request
import uuid

URL = "http://127.0.0.1:3540/api/mutation"
def call(name, args):
    req = urllib.request.Request(URL, data=json.dumps({"path": "fixture:" + name, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(req))
    if result["status"] != "success":
        raise RuntimeError(result.get("errorMessage", "unknown error"))
    return result["value"]
def authenticated(token):
    req = urllib.request.Request("http://127.0.0.1:3540/api/query", data=json.dumps({"path": "fixture:isAuthenticated", "args": {}, "format": "json"}).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
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
call("seedCore", {"userId": owner, "accounts": 201, "tokens": 201})
session = call("coreLogin", {"userId": owner, "providerAccountId": owner + "-0"})
requested = call("requestProductDeletion", {"userId": owner})
denied(lambda: call("productAuthCleanup", {"userId": owner, "expectedRequestedAt": requested + 1}), "Matching deletion request")
denied(lambda: call("productAuthCleanup", {"userId": other, "expectedRequestedAt": requested}), "Matching deletion request")
args = {"userId": owner, "expectedRequestedAt": requested}
denied(lambda: call("failAuthBatch", args), "synthetic password failure")
assert authenticated(access) and call("verifyPassword", {"userId": owner, "password": password})["success"]
assert call("productAuthProgress", {"userId": owner}) is None
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
assert result["state"] == "linked_auth_cleared" and result["legacyOrphansUnverified"]
assert result["passwordsDeleted"] == 1 and result["accountsDeleted"] == 202
assert result["refreshTokensDeleted"] >= 201
assert call("productAuthCleanup", args) == result == call("productAuthProgress", {"userId": owner})
assert call("cutoff", {"sub": sub}) is not None
assert call("googleLookup", {"sub": other_sub}) == other
print("PASS: product atomic auth fence, concurrent batches, stale request, cutoff and unaffected owner")
