import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { billingRequest } from "../disposabl-kit/server/billing";
import { debitCompute } from "../backend/convex/agent/computeDebit";
import { sandboxRef } from "../backend/convex/agent/boat";
import { stop as stopAction } from "../backend/convex/agent/actions/compute";
import { getFunctionName } from "convex/server";

// Real HTTP and installed adapter code; every provider response is simulated locally.
test("loopback provider faults preserve the debit and snapshot boundaries", async () => {
  let balance = 20,
    checks = 0,
    lost = false,
    failStop = true;
  let sandboxState = "ready",
    saved = "old snapshot",
    disk = "new writes";
  const requests: { path: string; body: any; headers: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ path: req.url!, body, headers: req.headers });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/balances.check") {
      checks++;
      const allowed = balance >= 10;
      if (allowed) balance -= 10;
      if (lost) {
        req.socket.destroy();
        return;
      }
      res.end(
        JSON.stringify({
          customer_id: body.customer_id,
          required_balance: 10,
          allowed,
          balance: {
            feature_id: "credits",
            unlimited: false,
            overage_allowed: false,
            remaining: balance,
          },
        }),
      );
    } else if (req.url === "/api/v1/sandboxes/sandbox") {
      res.end(
        JSON.stringify({
          sandbox: { id: "sandbox", name: "test", state: sandboxState },
        }),
      );
    } else if (req.url === "/api/v1/sandboxes/sandbox/stop") {
      if (failStop) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: { code: "snapshot_failed" } }));
        return;
      }
      saved = disk;
      sandboxState = "archived";
      res.end(
        JSON.stringify({
          sandbox: { id: "sandbox", name: "test", state: sandboxState },
        }),
      );
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No loopback listener");
  const base = `http://127.0.0.1:${address.port}`;
  const originalUrl = process.env.BOAT_API_URL,
    originalKey = process.env.BOAT_API_KEY;
  process.env.BOAT_API_URL = `${base}/api/v1`;
  process.env.BOAT_API_KEY = "inert-test-key";
  try {
    const request: typeof billingRequest = (key, method, body) =>
      billingRequest(key, method, body, (_url, init) =>
        fetch(`${base}/v1/${method}`, init),
      );
    assert.deepEqual(
      await debitCompute("owner", true, "inert-test-key", request),
      { outcome: "confirmed", responseBalance: 10 },
    );
    assert.equal(balance, 10);
    lost = true;
    assert.deepEqual(
      await debitCompute("owner", true, "inert-test-key", request),
      { outcome: "unknown" },
    );
    assert.equal(balance, 0);
    assert.equal(checks, 2); // no replay of a potentially committed debit
    const check = requests[0];
    assert.equal(check.headers["x-api-version"], "2.6.0");
    assert.deepEqual(check.body, {
      customer_id: "owner",
      feature_id: "credits",
      required_balance: 10,
      send_event: true,
    });
    assert.deepEqual(sandboxRef("owner"), {
      ownerId: "owner",
      key: "workspace",
    });
    assert.deepEqual(sandboxRef("owner"), sandboxRef("owner"));
    assert.notDeepEqual(sandboxRef("owner"), sandboxRef("other"));

    const require = createRequire(import.meta.url);
    const sdkRoot = dirname(require.resolve("@boatdev/convex/package.json"));
    const lifecycle = await import(join(sdkRoot, "src/component/lifecycle.ts"));
    let record: any = {
      _id: "record",
      _creationTime: 1,
      ownerId: "owner",
      key: "workspace",
      sandboxId: "sandbox",
      token: "test",
      state: "ready",
      updatedAt: 1,
    };
    const componentCtx: any = {
      runQuery: async () => record,
      runMutation: async (_ref: any, args: any) => {
        if (args.sandbox)
          record = {
            ...record,
            state: args.sandbox.state,
            sandbox: args.sandbox,
          };
        return record;
      },
      scheduler: { runAfter: async () => "scheduled" },
    };
    let archived: boolean | undefined;
    const ctx: any = {
      runQuery: async (ref: any) => {
        try {
          return getFunctionName(ref).includes("compute:get")
            ? { userId: "owner" }
            : record;
        } catch {
          return record;
        }
      },
      runMutation: async (ref: any, args: any) => {
        const name = getFunctionName(ref);
        if (name.endsWith("compute:stopping")) return true;
        if (name.endsWith("compute:stopped")) {
          archived = args.archived;
          return null;
        }
        throw new Error(name);
      },
      runAction: async (_ref: any, args: any) => {
        // Production action calls refresh first, followed by stop.
        const handler = ++actionCalls % 2 ? lifecycle.refresh : lifecycle.stop;
        return (handler as any)._handler(componentCtx, args);
      },
    };
    let actionCalls = 0;
    await (stopAction as any)._handler(ctx, { sessionId: "session" });
    assert.equal(archived, false);
    assert.equal(saved, "old snapshot");
    assert.equal(sandboxState, "ready");
    assert.deepEqual(requests.find((r) => r.path.endsWith("/stop"))?.body, {});
    failStop = false;
    await (stopAction as any)._handler(ctx, { sessionId: "session" });
    assert.equal(archived, true);
    assert.equal(saved, "new writes");
    assert.equal(sandboxState, "archived");
  } finally {
    if (originalUrl === undefined) delete process.env.BOAT_API_URL;
    else process.env.BOAT_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.BOAT_API_KEY;
    else process.env.BOAT_API_KEY = originalKey;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
