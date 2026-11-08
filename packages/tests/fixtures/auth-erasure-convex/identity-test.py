"""Synthetic identities only; run against the disposable backend on port 3540."""
import concurrent.futures
import json
import time
import urllib.request
import uuid

URL = "http://127.0.0.1:3540/api/mutation"
def call(name, args):
    request = urllib.request.Request(URL, data=json.dumps({"path": "fixture:" + name, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    result = json.load(urllib.request.urlopen(request))
    if result["status"] != "success":
        raise RuntimeError(result.get("errorMessage", "unknown error"))
    return result["value"]
def start():
    state, code = uuid.uuid4().hex, uuid.uuid4().hex
    call("googleStart", {"state": state})
    return state, code
def mint(ticket, sub, legacy=False):
    call("googleMint", {"state": ticket[0], "code": ticket[1], "sub": sub, "legacy": legacy})
def redeem(ticket):
    return call("completeSignInWithGoogle", {"state": ticket[0], "code": ticket[1]})
def denied(fn, message):
    try:
        fn()
    except RuntimeError as error:
        assert message in str(error), str(error)
        return
    raise AssertionError("expected denial: " + message)

sub = "synthetic-" + uuid.uuid4().hex
initial = start(); mint(initial, sub); assert redeem(initial)["status"] == "complete"
user = call("googleLookup", {"sub": sub}); assert user
old = start(); legacy = start(); raced = start(); mint(raced, sub)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    fence = pool.submit(call, "beginBoth", {"userId": user})
    race = pool.submit(redeem, raced)
    assert fence.result()["complete"]
    try:
        assert race.result()["status"] == "complete"
        assert call("googleLookup", {"sub": sub}) == user
    except RuntimeError as error:
        assert "Authorization predates" in str(error), str(error)
mint(old, sub); mint(legacy, sub, legacy=True)
denied(lambda: redeem(old), "Authorization predates")
denied(lambda: redeem(legacy), "Authorization predates")
time.sleep(0.03)
fresh = start(); mint(fresh, sub)
denied(lambda: redeem(fresh), "explicit re-registration")
for _ in range(20):
    result = call("purgeCore", {"userId": user})
    if result["linkedRowsCleared"]:
        break
assert result["linkedRowsCleared"] and result["legacyOrphansUnverified"]
assert call("cutoff", {"sub": sub}) is not None
post = start(); mint(post, sub)
denied(lambda: redeem(post), "explicit re-registration")
denied(lambda: call("directGoogleSignup", {"userId": "new-" + uuid.uuid4().hex, "sub": sub}), "Identity registration is unavailable")
other = "synthetic-" + uuid.uuid4().hex
other_ticket = start(); mint(other_ticket, other); assert redeem(other_ticket)["status"] == "complete"
assert call("recordFutureReceipt", {"userId": "synthetic-" + uuid.uuid4().hex})["receiptRecorded"]
print("Real Convex identity cutoff, redemption race, delayed and legacy tickets, fresh denial, isolation, and atomic cleanup receipt passed")
