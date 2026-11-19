import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAutumnKey } from "../backend/convex/connections/actions/autumn";
import {
  provisionPayments,
  configureBillingDeployment,
} from "../backend/convex/apps/actions/billing";
import { status } from "../backend/convex/connections/internal";

const sandbox = "am_sk_test_fixture";
const live = "am_sk_live_fixture";
test("Autumn keys are validated with a read-only plan lookup and sanitized errors", async () => {
  let calls = 0;
  const fetcher = (async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "https://api.useautumn.com/v1/plans.list");
    assert.equal(init.body, "{}");
    assert.equal(init.redirect, "error");
    return Response.json({ list: [] });
  }) as typeof fetch;
  await validateAutumnKey(sandbox, "test", fetcher);
  await assert.rejects(validateAutumnKey(live, "test", fetcher), /sandbox/);
  assert.equal(calls, 1);
  await assert.rejects(
    validateAutumnKey(sandbox, "test", (async () => {
      throw new Error("private token detail");
    }) as typeof fetch),
    /Autumn could not verify/,
  );
});

test("payments-off setup neither reads credentials nor configures deployments", async () => {
  const ctx = {
    runQuery: () => {
      throw new Error("Unexpected credential read");
    },
  };
  await provisionPayments(ctx as never, "owner", [], {
    token: "unused",
    projectId: 42,
    development: {
      name: "dev-app",
      convexUrl: "https://dev-app.convex.cloud",
      deployKey: "dev:dev-app|fixture",
      kind: "dev",
    },
    production: {
      name: "prod-app",
      deploymentUrl: "https://prod-app.convex.cloud",
    },
  });
});

test("deployment provisioning separates live and sandbox keys and chooses its own return URL", async () => {
  const target = {
    name: "dev-app",
    convexUrl: "https://dev-app.convex.cloud",
    deployKey: "dev:dev-app|fixture",
    kind: "dev" as const,
  };
  const bodies: { changes: unknown[] }[] = [];
  let existing: { value: string } | null = null;
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith("/api/query")) {
      assert.deepEqual(JSON.parse(String(init.body)), {
        path: "_system/cli/queryEnvironmentVariables:get",
        args: { name: "BILLING_RETURN_URL" },
        format: "json",
      });
      return Response.json({ status: "success", value: existing });
    }
    bodies.push(JSON.parse(String(init.body)));
    return new Response();
  }) as typeof fetch;
  await assert.rejects(
    configureBillingDeployment(target, live, fetcher),
    /Invalid billing deployment/,
  );
  assert.equal(bodies.length, 0);
  await configureBillingDeployment(target, sandbox, fetcher);
  assert.deepEqual(bodies[0]?.changes, [
    { name: "AUTUMN_SECRET_KEY", value: sandbox },
    {
      name: "BILLING_RETURN_URL",
      value: "https://dev-app.convex.site/pricing",
    },
  ]);
  existing = { value: "https://custom.example/pricing" };
  await configureBillingDeployment(target, sandbox, fetcher);
  assert.deepEqual(bodies[1]?.changes, [
    { name: "AUTUMN_SECRET_KEY", value: sandbox },
  ]);
  await assert.rejects(
    configureBillingDeployment(target, sandbox, (async () =>
      Response.json({ status: "error" })) as typeof fetch),
    /Could not read billing configuration/,
  );
  await assert.rejects(
    configureBillingDeployment(
      { ...target, convexUrl: "https://attacker.example" },
      sandbox,
      fetcher,
    ),
    /Invalid billing deployment/,
  );
});

test("Autumn is required only when payments is selected", async () => {
  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (_index: string, filter: (q: any) => void) => {
          let provider: string | undefined;
          const q = {
            eq: (key: string, value: string) => {
              if (key === "provider") provider = value;
              return q;
            },
          };
          filter(q);
          return {
            order: () => ({ first: async () => ({ owner: "owner" }) }),
            unique: async () =>
              table === "connections" && provider === "convex"
                ? { name: "team" }
                : null,
          };
        },
      }),
    },
  };
  const previousOrigin = process.env.CONNECTIONS_ORIGIN;
  process.env.CONNECTIONS_ORIGIN = "http://127.0.0.1:3311";
  try {
    assert.equal(
      (await (status as any)._handler(ctx, { userId: "owner", features: [] }))
        .ready,
      true,
    );
    const required = await (status as any)._handler(ctx, {
      userId: "owner",
      features: ["payments"],
    });
    assert.deepEqual(required.missing, ["autumn"]);
    assert.equal(
      new URL(required.connectionsUrl).searchParams.get("features"),
      "payments",
    );
  } finally {
    if (previousOrigin === undefined) delete process.env.CONNECTIONS_ORIGIN;
    else process.env.CONNECTIONS_ORIGIN = previousOrigin;
  }
});

test("saved Autumn credentials are encrypted for the authenticated owner", async () => {
  const { connect } =
    await import("../backend/convex/connections/actions/autumn");
  const { unseal } =
    await import("../backend/convex/connections/actions/credentials");
  const previousKey = process.env.CONNECTIONS_ENCRYPTION_KEY;
  const originalFetch = globalThis.fetch;
  process.env.CONNECTIONS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
  globalThis.fetch = (async () => Response.json({ list: [] })) as typeof fetch;
  let saved: any;
  try {
    const result = await (connect as any)._handler(
      {
        runMutation: async (_ref: unknown, value: unknown) => {
          saved = value;
        },
      },
      {
        userId: "owner",
        sandboxKey: sandbox,
        liveKey: live,
      },
    );
    assert.equal(result, null);
    assert.equal(saved.userId, "owner");
    assert.equal(saved.token.includes(sandbox), false);
    assert.deepEqual(JSON.parse(unseal(saved.token, "owner:autumn")), {
      sandbox,
      live,
    });
    assert.throws(() => unseal(saved.token, "another-owner:autumn"));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined)
      delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    else process.env.CONNECTIONS_ENCRYPTION_KEY = previousKey;
  }
});

test("connected sandbox keys reach CI previews without production and retries keep the keys separate", async () => {
  const { seal } =
    await import("../backend/convex/connections/actions/credentials");
  const previousKey = process.env.CONNECTIONS_ENCRYPTION_KEY;
  const originalFetch = globalThis.fetch;
  process.env.CONNECTIONS_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString(
    "base64",
  );
  const calls: string[] = [];
  const previewDefaults: unknown[] = [];
  const deploymentSecrets: { target: string; key: string }[] = [];
  let failProduction = true;
  let failPreview = false;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push(url);
    if (url.includes("plans.list")) return Response.json({ list: [] });
    if (url.endsWith("update_default_environment_variables")) {
      assert.equal(
        url,
        "https://api.convex.dev/v1/projects/42/update_default_environment_variables",
      );
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        "Bearer management",
      );
      previewDefaults.push(JSON.parse(String(init.body)));
      return new Response(null, { status: failPreview ? 503 : 200 });
    }
    if (url.includes("create_deploy_key"))
      return Response.json({ deployKey: "prod:prod-app|fixture" });
    if (url.endsWith("/api/query"))
      return Response.json({ status: "success", value: null });
    const { changes } = JSON.parse(String(init.body));
    deploymentSecrets.push({
      target: new URL(url).hostname,
      key: changes.find(
        ({ name }: { name: string }) => name === "AUTUMN_SECRET_KEY",
      ).value,
    });
    return new Response(null, {
      status: failProduction && url.includes("prod-app") ? 500 : 200,
    });
  }) as typeof fetch;
  const development = {
    name: "dev-app",
    convexUrl: "https://dev-app.convex.cloud",
    deployKey: "dev:dev-app|fixture",
    kind: "dev" as const,
  };
  const production = {
    name: "prod-app",
    deploymentUrl: "https://prod-app.convex.cloud",
  };
  let keys: { sandbox: string; live?: string } = { sandbox };
  const ctx = {
    runQuery: async () => ({
      token: seal(JSON.stringify(keys), "owner:autumn"),
    }),
  };
  const run = () =>
    provisionPayments(ctx as never, "owner", ["payments"], {
      token: "management",
      projectId: 42,
      development,
      production,
    });
  const expectedPreview = {
    changes: [
      {
        name: "AUTUMN_SECRET_KEY",
        deploymentType: "preview",
        value: sandbox,
        applyToExistingDeployments: true,
      },
    ],
  };
  try {
    await run();
    assert.deepEqual(previewDefaults, [expectedPreview]);
    assert.deepEqual(deploymentSecrets, [
      { target: "dev-app.convex.cloud", key: sandbox },
    ]);
    assert.equal(
      calls.some((url) => url.includes("prod-app")),
      false,
    );
    keys = { sandbox, live };
    calls.length = 0;
    failPreview = true;
    await assert.rejects(run(), /Convex management request failed \(503\)/);
    assert.equal(
      calls.some((url) => url.includes("prod-app")),
      false,
    );
    calls.length = 0;
    failPreview = false;
    await assert.rejects(run(), /Could not configure payments/);
    assert.equal(
      calls.filter((url) => url.endsWith("update_environment_variables"))
        .length,
      2,
    );
    failProduction = false;
    calls.length = 0;
    deploymentSecrets.length = 0;
    await run();
    assert.deepEqual(previewDefaults, Array(4).fill(expectedPreview));
    assert.deepEqual(deploymentSecrets, [
      { target: "dev-app.convex.cloud", key: sandbox },
      { target: "prod-app.convex.cloud", key: live },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined)
      delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    else process.env.CONNECTIONS_ENCRYPTION_KEY = previousKey;
  }
});
