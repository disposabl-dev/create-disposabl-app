import { expect, test } from "bun:test";

const url = process.env.MCP_ERASURE_FIXTURE_URL;
const enabled = url === "http://127.0.0.1:3550";
if (url && !enabled)
  throw new Error("MCP erasure fixture must use port 3550 on loopback");
async function call(
  kind: "mutation" | "query",
  operation: string,
  args: unknown,
) {
  const response = await fetch(`${url}/api/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: `fixture:${kind === "mutation" ? "mutate" : "query"}`,
      args: { operation, args },
      format: "json",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json();
  if (json.status !== "success")
    throw new Error(
      `fixture ${operation}: ${json.errorMessage ?? "unknown error"}`,
    );
  return json.value;
}
const mutate = (name: string, args: unknown) => call("mutation", name, args);
const query = (name: string, args: unknown) => call("query", name, args);
const base = {
  clientId: "client",
  scopes: [],
  resource: "http://localhost/mcp",
};
const key = (userId: string, hash: string) =>
  mutate("createKey", {
    userId,
    hash,
    name: "fixture",
    scopes: [],
    resource: base.resource,
  });
const verify = (hash: string) => query("verify", { hash, now: Date.now() });
async function redirect(userId: string, suffix: string) {
  const requestId = `req-${suffix}`,
    codeHash = `code-${suffix}`;
  const created = await mutate("createRedirect", {
    ...base,
    requestId,
    redirectUri: "http://localhost/callback",
    codeChallenge: "challenge",
    ttlMs: 600000,
  });
  expect(created.ok).toBe(true);
  const approved = await mutate("decide", {
    requestId,
    userId,
    approved: true,
    codeHash,
    codeTtlMs: 600000,
  });
  expect(approved?.kind).toBe("redirect");
  return {
    codeHash,
    clientId: base.clientId,
    redirectUri: "http://localhost/callback",
    verifierChallenge: "challenge",
    accessHash: `access-${suffix}`,
    refreshHash: `refresh-${suffix}`,
    accessTtlMs: 600000,
    refreshTtlMs: 600000,
  };
}
async function drain(userId: string) {
  let iterations = 0,
    tokens = 0,
    grants = 0,
    requests = 0;
  for (;;) {
    const result = await mutate("erase", { userId });
    expect(result.tokensDeleted).toBeLessThanOrEqual(100);
    expect(result.requestsDeleted).toBeLessThanOrEqual(100);
    expect(result.grantsDeleted).toBeLessThanOrEqual(1);
    tokens += result.tokensDeleted;
    grants += result.grantsDeleted;
    requests += result.requestsDeleted;
    if (result.doneAttributed)
      return { iterations: iterations + 1, tokens, grants, requests };
    if (++iterations > 1000) throw new Error("Erasure did not converge");
  }
}

test.skipIf(!enabled)(
  "bounded erasure handles over 200 grants, token batches and owner isolation",
  async () => {
    expect(
      (
        await mutate("client", {
          clientId: base.clientId,
          redirectUris: ["http://localhost/callback"],
        })
      ).ok,
    ).toBe(true);
    await key("other", "other-key");
    const exchange = await redirect("target", "long");
    expect((await mutate("exchange", exchange)).ok).toBe(true);
    let current = exchange.refreshHash;
    for (let i = 0; i < 60; i++) {
      const next = `long-refresh-${i}`;
      const refreshed = await mutate("refresh", {
        clientId: base.clientId,
        refreshHash: current,
        accessHash: `long-access-${i}`,
        newRefreshHash: next,
        accessTtlMs: 600000,
        refreshTtlMs: 600000,
      });
      expect(refreshed.ok).toBe(true);
      current = next;
    }
    for (let i = 0; i < 205; i++) await key("target", `target-key-${i}`);
    expect((await query("list", { userId: "target" })).length).toBe(200);
    const redirectArgs = await redirect("target", "pending-redirect");
    expect(
      (
        await mutate("createDevice", {
          ...base,
          requestId: "device-pending",
          deviceCodeHash: "device-hash",
          userCode: "ABCD-EFGH",
          ttlMs: 600000,
          intervalMs: 5000,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await mutate("decide", {
          requestId: "device-pending",
          userId: "target",
          approved: true,
          codeTtlMs: 600000,
          confirmedUserCode: "ABCD-EFGH",
        })
      ).confirmed,
    ).toBe(true);
    expect(
      (
        await mutate("createRedirect", {
          ...base,
          requestId: "unassociated",
          redirectUri: "http://localhost/callback",
          codeChallenge: "challenge",
          ttlMs: 600000,
        })
      ).ok,
    ).toBe(true);
    const first = await mutate("erase", { userId: "target" });
    expect(first.doneAttributed).toBe(false);
    expect(await verify("target-key-204")).toBe(null);
    expect((await mutate("exchange", redirectArgs)).ok).toBe(false);
    expect(
      (
        await mutate("poll", {
          deviceCodeHash: "device-hash",
          clientId: base.clientId,
          accessHash: "device-access",
          accessTtlMs: 600000,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await mutate("refresh", {
          clientId: base.clientId,
          refreshHash: current,
          accessHash: "blocked-access",
          newRefreshHash: "blocked-refresh",
          accessTtlMs: 600000,
          refreshTtlMs: 600000,
        })
      ).ok,
    ).toBe(false);
    await expect(key("target", "after-fence")).rejects.toThrow(
      "Account is unavailable",
    );
    expect(
      await mutate("decide", {
        requestId: "unassociated",
        userId: "target",
        approved: true,
        codeHash: "late-code",
        codeTtlMs: 600000,
      }),
    ).toBe(null);
    expect((await query("request", { requestId: "unassociated" })).status).toBe(
      "pending",
    );
    const rest = await drain("target");
    expect(rest.iterations).toBeGreaterThan(200);
    expect(first.grantsDeleted + rest.grants).toBe(206);
    expect(first.tokensDeleted + rest.tokens).toBe(327);
    expect(first.requestsDeleted + rest.requests).toBe(2);
    expect((await drain("target")).iterations).toBe(1);
    expect((await verify("other-key")).userId).toBe("other");
  },
  120000,
);

test.skipIf(!enabled)(
  "concurrent exchange, approval, refresh and key creation cannot survive the fence",
  async () => {
    const args = await redirect("race", "race");
    expect((await mutate("exchange", args)).ok).toBe(true);
    const next = await redirect("race", "race-pending");
    const results = await Promise.allSettled([
      mutate("erase", { userId: "race" }),
      mutate("exchange", next),
      mutate("refresh", {
        clientId: base.clientId,
        refreshHash: args.refreshHash,
        accessHash: "race-refreshed-access",
        newRefreshHash: "race-refreshed-token",
        accessTtlMs: 600000,
        refreshTtlMs: 600000,
      }),
      key("race", "race-key"),
    ]);
    expect(results[0].status).toBe("fulfilled");
    await drain("race");
    for (const hash of [
      args.accessHash,
      next.accessHash,
      "race-refreshed-access",
      "race-key",
    ])
      expect(await verify(hash)).toBe(null);
    await expect(key("race", "race-after")).rejects.toThrow(
      "Account is unavailable",
    );
    expect((await drain("race")).iterations).toBe(1);
    expect((await verify("other-key")).userId).toBe("other");
  },
  120000,
);

test.skipIf(!enabled)(
  "device polling and new approval races cannot survive erasure",
  async () => {
    expect(
      (
        await mutate("createDevice", {
          ...base,
          requestId: "race-device",
          deviceCodeHash: "race-device-hash",
          userCode: "WXYZ-ABCD",
          ttlMs: 600000,
          intervalMs: 5000,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await mutate("decide", {
          requestId: "race-device",
          userId: "device-race",
          approved: true,
          codeTtlMs: 600000,
          confirmedUserCode: "WXYZ-ABCD",
        })
      ).confirmed,
    ).toBe(true);
    const deviceRace = await Promise.allSettled([
      mutate("erase", { userId: "device-race" }),
      mutate("poll", {
        deviceCodeHash: "race-device-hash",
        clientId: base.clientId,
        accessHash: "race-device-access",
        accessTtlMs: 600000,
      }),
    ]);
    expect(deviceRace[0].status).toBe("fulfilled");
    await drain("device-race");
    expect(await verify("race-device-access")).toBe(null);
    expect(
      (
        await mutate("createRedirect", {
          ...base,
          requestId: "race-approval",
          redirectUri: "http://localhost/callback",
          codeChallenge: "challenge",
          ttlMs: 600000,
        })
      ).ok,
    ).toBe(true);
    const approvalRace = await Promise.allSettled([
      mutate("erase", { userId: "approval-race" }),
      mutate("decide", {
        requestId: "race-approval",
        userId: "approval-race",
        approved: true,
        codeHash: "race-approval-code",
        codeTtlMs: 600000,
      }),
    ]);
    expect(approvalRace[0].status).toBe("fulfilled");
    await drain("approval-race");
    expect(
      (
        await mutate("exchange", {
          codeHash: "race-approval-code",
          clientId: base.clientId,
          redirectUri: "http://localhost/callback",
          verifierChallenge: "challenge",
          accessHash: "race-approval-access",
          refreshHash: "race-approval-refresh",
          accessTtlMs: 600000,
          refreshTtlMs: 600000,
        })
      ).ok,
    ).toBe(false);
    expect(await verify("race-approval-access")).toBe(null);
  },
  120000,
);

test.skipIf(!enabled)(
  "ordinary revocation retains attribution until a large token family is removed",
  async () => {
    const args = await redirect("large-revocation", "large-revocation");
    expect((await mutate("exchange", args)).ok).toBe(true);
    let current = args.refreshHash;
    for (let i = 0; i < 1000; i++) {
      const next = `large-refresh-${i}`;
      expect(
        (
          await mutate("refresh", {
            clientId: base.clientId,
            refreshHash: current,
            accessHash: `large-access-${i}`,
            newRefreshHash: next,
            accessTtlMs: 600000,
            refreshTtlMs: 600000,
          })
        ).ok,
      ).toBe(true);
      current = next;
    }
    const grant = (await query("list", { userId: "large-revocation" }))[0];
    expect(await query("probe", { grantId: grant._id })).toBe(2001);
    expect(
      await mutate("revoke", {
        userId: "large-revocation",
        grantId: grant._id,
      }),
    ).toBe(true);
    expect(await verify(args.accessHash)).toBe(null);
    await drain("large-revocation");
    expect(await query("probe", { grantId: grant._id })).toBe(0);
    expect((await query("list", { userId: "large-revocation" })).length).toBe(
      0,
    );
    expect((await verify("other-key")).userId).toBe("other");
  },
  120000,
);
