"""Run only against the disposable loopback fixture on port 3540."""
import concurrent.futures
import json
import urllib.request
import uuid

URL = "http://127.0.0.1:3540/api/mutation"

def call(name, args):
    request = urllib.request.Request(URL, data=json.dumps({"path": "fixture:" + name, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(request))
    if result["status"] != "success":
        raise RuntimeError(result.get("errorMessage", "unknown"))
    return result["value"]

def attempt(fn):
    try:
        return ("ok", fn())
    except Exception:
        return ("blocked", None)

user = "synthetic-" + uuid.uuid4().hex
other = "synthetic-" + uuid.uuid4().hex
password = "Fixture-Password-982!"
call("setPassword", {"userId": user, "password": password})
call("setPassword", {"userId": other, "password": password})
call("seedCore", {"userId": user, "accounts": 201, "tokens": 201})
call("seedCore", {"userId": other, "accounts": 1, "tokens": 0})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(attempt, [lambda: call("beginBoth", {"userId": user}), lambda: call("coreSignIn", {"providerAccountId": user + "-0"})]))
assert results[0][0] == "ok" and results[0][1]["complete"]
assert attempt(lambda: call("coreSignIn", {"providerAccountId": user + "-0"}))[0] == "blocked"
assert attempt(lambda: call("signupOld", {"userId": user, "providerAccountId": user + "-new"}))[0] == "blocked"
assert not call("verifyPassword", {"userId": user, "password": password})["success"]
assert call("verifyPassword", {"userId": other, "password": password})["success"]
rows = []
for _ in range(12):
    row = call("purgeCore", {"userId": user})
    rows.append(row)
    if row["linkedRowsCleared"]:
        break
assert rows[-1]["linkedRowsCleared"] and all(x["legacyOrphansUnverified"] for x in rows)
assert sum(x["deletedAccounts"] for x in rows) == 201
assert sum(x["deletedRefreshTokens"] for x in rows) >= 201
assert all(x["deletedAccounts"] <= 100 and x["deletedRefreshTokens"] <= 100 and x["deletedSessions"] <= 1 for x in rows)
assert call("purgeCore", {"userId": user})["linkedRowsCleared"]
assert call("coreLookup", {"providerAccountId": other + "-0"}) == other

session_user = "synthetic-" + uuid.uuid4().hex
call("seedCore", {"userId": session_user, "accounts": 1, "tokens": 0})
session = call("coreLogin", {"userId": session_user, "providerAccountId": session_user + "-0"})
call("beginBoth", {"userId": session_user})
assert call("coreSession", {"sessionId": session["sessionId"]}) is None
assert call("coreRefresh", {"refreshToken": session["refreshToken"]})["kind"] == "noSession"
assert attempt(lambda: call("coreExchange", {"userId": session_user, "sessionId": session["sessionId"]}))[0] == "blocked"

orphan_user = "synthetic-" + uuid.uuid4().hex
orphan = call("seedOrphan", {"userId": orphan_user})
call("beginBoth", {"userId": orphan_user})
result = call("purgeCore", {"userId": orphan_user})
assert result["linkedRowsCleared"] and result["legacyOrphansUnverified"]
assert call("orphanExists", {"hash": orphan})
print("PASS: core/password fence, linked batches, sessions and orphan limitation")
