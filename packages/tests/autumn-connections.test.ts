import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import {
  createTenant,
  requireLiveStripe,
  stripeUrl,
  validatePlatformKey,
} from "../backend/convex/apps/actions/autumn";
import {
  configureBillingDeployment,
  enableLivePayments,
  provisionPayments,
} from "../backend/convex/apps/actions/billing";
import {
  seal,
  unseal,
} from "../backend/convex/connections/actions/credentials";
import {
  connect,
  autumnPlatformKey,
} from "../backend/convex/connections/actions/autumn";
import { autumnPlatformAccount } from "../backend/convex/connections/validator";
import { connectionsUrl } from "../backend/convex/connections/config";

const appId = "93299405-1234-4321-8d59-efdf91c9d828";
const slug = "app-93299405123443218d59efdf91c9d828";
const masterKey = "am_sk_test_platform_fixture";
const sandbox = "am_sk_test_fixture";
const live = "am_sk_live_fixture";
const setup = { userId: "owner", appId, until: Date.now() + 60_000 };
const convex = {
  token: "fixture-convex-oauth",
  projectId: 42,
  development: {
    name: "dev-app",
    convexUrl: "https://dev-app.convex.cloud",
    deployKey: "dev:dev-app|fixture",
    kind: "dev" as const,
  },
};

async function fixture(fetcher: typeof fetch, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const previous = process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.CONNECTIONS_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString(
    "base64",
  );
  globalThis.fetch = fetcher;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    else process.env.CONNECTIONS_ENCRYPTION_KEY = previous;
  }
}

test("payments-off setup bypasses the managed tenant and setup links to Autumn only for payments", async () => {
  await provisionPayments(
    { runMutation: () => assert.fail("Unexpected tenant access") } as never,
    setup,
    [],
    convex,
  );
  const original = process.env.CONNECTIONS_ORIGIN;
  process.env.CONNECTIONS_ORIGIN = "https://disposabl.example";
  try {
    assert.equal(new URL(connectionsUrl([])).search, "");
    assert.equal(
      new URL(connectionsUrl(["payments"])).searchParams.get("features"),
      "payments",
    );
    assert.equal(
      new URL(connectionsUrl(["analytics", "payments"])).searchParams.get(
        "features",
      ),
      "analytics,payments",
    );
  } finally {
    if (original === undefined) delete process.env.CONNECTIONS_ORIGIN;
    else process.env.CONNECTIONS_ORIGIN = original;
  }
});

test("managed app provisioning creates one tenant, saves scoped keys, and installs only sandbox credentials in previews", async () => {
  let encryptedKeys: string | undefined;
  let created = 0;
  const writes: Array<{
    name: string;
    value: string;
    deploymentType?: string;
    applyToExistingDeployments?: boolean;
  }> = [];
  const ctx = {
    runQuery(ref: Parameters<typeof getFunctionName>[0], args: unknown) {
      assert.equal(getFunctionName(ref), "connections/internal:get");
      assert.deepEqual(args, { userId: "owner", provider: "autumn" });
      return {
        accountId: autumnPlatformAccount,
        token: seal(masterKey, `owner:${autumnPlatformAccount}`),
      };
    },
    runMutation: (
      ref: Parameters<typeof getFunctionName>[0],
      args: typeof setup & { encryptedKeys?: string },
    ) => {
      assert.equal(args.appId, appId);
      assert.equal(args.userId, "owner");
      if (getFunctionName(ref) === "apps/autumn:prepare")
        return { ownerEmail: "owner@example.test", encryptedKeys };
      assert.equal(getFunctionName(ref), "apps/autumn:saveKeys");
      encryptedKeys = args.encryptedKeys;
      return null;
    },
  };
  await fixture(
    (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url === "https://api.useautumn.com/v1/platform/organizations") {
        assert.equal(
          new Headers(init.headers).get("Authorization"),
          "Bearer am_sk_test_platform_fixture",
        );
        assert.deepEqual(body, {
          user_email: "owner@example.test",
          name: "Disposabl " + slug,
          slug,
          env: "both",
        });
        created++;
        return Response.json(
          { test_secret_key: sandbox, live_secret_key: live },
          { status: 201 },
        );
      }
      if (url === "https://dev-app.convex.cloud/api/query")
        return Response.json({
          status: "success",
          value: { value: "https://chosen.example/pricing" },
        });
      assert.ok(
        url ===
          "https://dev-app.convex.cloud/api/update_environment_variables" ||
          url ===
            "https://api.convex.dev/v1/projects/42/update_default_environment_variables",
      );
      writes.push(...body.changes);
      return new Response();
    }) as typeof fetch,
    async () => {
      await provisionPayments(ctx as never, setup, ["payments"], convex);
      await provisionPayments(ctx as never, setup, ["payments"], convex);
      assert.equal(created, 1);
      assert.ok(
        encryptedKeys &&
          !encryptedKeys.includes(sandbox) &&
          !encryptedKeys.includes(live),
      );
      assert.deepEqual(
        JSON.parse(unseal(encryptedKeys, `owner:${appId}:autumn`)),
        { sandbox, live },
      );
      assert.throws(() => unseal(encryptedKeys!, "another-app"));
      assert.deepEqual(
        writes,
        [0, 1].flatMap(() => [
          { name: "AUTUMN_SECRET_KEY", value: sandbox },
          {
            name: "AUTUMN_SECRET_KEY",
            deploymentType: "preview",
            value: sandbox,
            applyToExistingDeployments: true,
          },
        ]),
      );
    },
  );
});

test("Stripe activation checks this tenant's live connection and validates OAuth links", async () => {
  let connected = false;
  let url = "https://connect.stripe.com/oauth/authorize?state=fixture";
  await fixture(
    (async (endpoint: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.organization_slug, slug);
      assert.equal(body.env, "live");
      if (endpoint.endsWith("/platform/oauth_url")) {
        assert.equal(
          body.redirect_url,
          "https://example.test/dashboard/billing",
        );
        return Response.json({ oauth_url: url });
      }
      assert.equal(
        endpoint,
        "https://api.useautumn.com/v1/platform.get_stripe_connection",
      );
      return Response.json({
        connected,
        account_id: connected ? "acct_fixture" : null,
      });
    }) as typeof fetch,
    async () => {
      await assert.rejects(
        requireLiveStripe(masterKey, appId),
        /Connect live Stripe/,
      );
      assert.equal(
        await stripeUrl(
          masterKey,
          appId,
          "https://example.test/dashboard/billing",
        ),
        url,
      );
      url = "https://unsafe.example/oauth";
      await assert.rejects(
        stripeUrl(masterKey, appId, "https://example.test/dashboard/billing"),
        /valid Stripe/,
      );
      connected = true;
      await requireLiveStripe(masterKey, appId);
    },
  );
});

test("Autumn's private preview denial is actionable and never leaks provider response data", async () => {
  await fixture(
    (async () =>
      Response.json(
        { detail: "private provider response" },
        { status: 403 },
      )) as typeof fetch,
    async () => {
      await assert.rejects(
        createTenant(masterKey, appId, "owner@example.test"),
        (error: unknown) => {
          assert.match(String(error), /Autumn denied Platform API access/);
          assert.doesNotMatch(String(error), /private provider response/);
          return true;
        },
      );
    },
  );
});

test("production deployment rejects sandbox keys and keeps existing checkout origins", async () => {
  const target = {
    name: "prod-app",
    convexUrl: "https://prod-app.convex.cloud",
    deployKey: "prod:prod-app|fixture",
    kind: "prod" as const,
  };
  let writes = 0;
  const fetcher = (async (url: string, init: RequestInit) => {
    if (url.endsWith("/api/query"))
      return Response.json({
        status: "success",
        value: { value: "https://custom.example/pricing" },
      });
    assert.deepEqual(JSON.parse(String(init.body)), {
      changes: [{ name: "AUTUMN_SECRET_KEY", value: live }],
    });
    writes++;
    return new Response();
  }) as typeof fetch;
  await assert.rejects(
    configureBillingDeployment(target, sandbox, fetcher),
    /Invalid billing deployment/,
  );
  assert.equal(writes, 0);
  await configureBillingDeployment(target, live, fetcher);
  assert.equal(writes, 1);
});

test("live activation waits for Stripe and initializes only this app's production catalog", async () => {
  const cloud = "https://prod-app.convex.cloud";
  const deployKey = "prod:prod-app|fixture";
  const publicSiteUrl = "https://example.test";
  const requests: string[] = [];
  let connected = false;
  let finished = 0;

  await fixture(
    (async (url: string, init: RequestInit) => {
      requests.push(url);
      const body = init.body && JSON.parse(String(init.body));
      if (
        url === "https://api.useautumn.com/v1/platform.get_stripe_connection"
      ) {
        assert.deepEqual(body, { organization_slug: slug, env: "live" });
        return Response.json({
          connected,
          account_id: connected ? "acct_fixture" : null,
        });
      }
      if (
        url ===
        "https://api.convex.dev/v1/projects/42/deployment?defaultProd=true"
      )
        return Response.json({
          name: "prod-app",
          projectId: 42,
          kind: "cloud",
          deploymentType: "prod",
          deploymentUrl: cloud,
        });
      if (
        url ===
        "https://api.convex.dev/v1/deployments/prod-app/create_deploy_key"
      )
        return Response.json({ deployKey });
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        `Convex ${deployKey}`,
      );
      if (url === `${cloud}/api/query`)
        return Response.json({ status: "success", value: null });
      if (url === `${cloud}/api/update_environment_variables`) {
        assert.deepEqual(body.changes, [
          { name: "AUTUMN_SECRET_KEY", value: live },
          { name: "BILLING_RETURN_URL", value: `${publicSiteUrl}/pricing` },
        ]);
        return new Response();
      }
      assert.equal(url, `${cloud}/api/function`);
      assert.deepEqual(body, {
        path: "billing:setup",
        format: "convex_encoded_json",
        args: { expectedEnvironment: "live" },
      });
      return Response.json({
        status: "success",
        value: { enabled: true, pending: false },
      });
    }) as typeof fetch,
    async () => {
      const { userId, until } = setup;
      const ctx = {
        runMutation(ref: Parameters<typeof getFunctionName>[0], args: unknown) {
          if (getFunctionName(ref) === "apps/operations/internal:begin") {
            assert.deepEqual(args, { userId, appId, kind: "setup" });
            return { until };
          }
          assert.equal(getFunctionName(ref), "apps/operations/internal:finish");
          assert.deepEqual(args, { userId, appId, until, retryDelete: false });
          finished++;
          return null;
        },
        runQuery(
          ref: Parameters<typeof getFunctionName>[0],
          args: { provider?: string },
        ) {
          switch (getFunctionName(ref)) {
            case "apps/autumn:target":
              return {
                encryptedKeys: seal(
                  JSON.stringify({ sandbox, live }),
                  `${userId}:${appId}:autumn`,
                ),
                projectId: 42,
                publicSiteUrl,
              };
            case "users/internal:deletionPending":
              return false;
            case "connections/internal:get":
              if (args.provider === "autumn")
                return {
                  accountId: autumnPlatformAccount,
                  token: seal(masterKey, `${userId}:${autumnPlatformAccount}`),
                };
              return { token: seal(convex.token, `${userId}:convex`) };
            default:
              return assert.fail("Unexpected query");
          }
        },
      };
      const activate = (
        enableLivePayments as unknown as {
          _handler: (
            context: typeof ctx,
            args: { userId: string; appId: string },
          ) => Promise<null>;
        }
      )._handler;
      await assert.rejects(
        activate(ctx, { userId, appId }),
        /Connect live Stripe/,
      );
      assert.deepEqual(requests.splice(0), [
        "https://api.useautumn.com/v1/platform.get_stripe_connection",
      ]);
      assert.equal(finished, 1);
      connected = true;
      assert.equal(await activate(ctx, { userId, appId }), null);
      assert.deepEqual(requests.slice(-2), [
        `${cloud}/api/update_environment_variables`,
        `${cloud}/api/function`,
      ]);
      assert.equal(finished, 2);
    },
  );
});

test("Connections verifies platform permission before saving an encrypted key for this user", async () => {
  const userId = "owner";
  let allowed = false;
  const saved: Array<{
    userId: string;
    provider: string;
    accountId: string;
    token: string;
  }> = [];
  await fixture(
    (async (url: string, init: RequestInit) => {
      assert.equal(
        url,
        "https://api.useautumn.com/v1/platform/organizations?limit=1",
      );
      assert.equal(init.method, "GET");
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        `Bearer ${masterKey}`,
      );
      return allowed
        ? Response.json({ list: [] })
        : Response.json({}, { status: 403 });
    }) as typeof fetch,
    async () => {
      const ctx = {
        runMutation(
          ref: Parameters<typeof getFunctionName>[0],
          args: (typeof saved)[number],
        ) {
          assert.equal(getFunctionName(ref), "connections/internal:save");
          saved.push(args);
          return null;
        },
        runQuery(
          ref: Parameters<typeof getFunctionName>[0],
          args: { userId: string; provider: string },
        ) {
          assert.equal(getFunctionName(ref), "connections/internal:get");
          assert.equal(args.provider, "autumn");
          return saved.find((record) => record.userId === args.userId) ?? null;
        },
      };
      const handler = (
        connect as unknown as {
          _handler: (
            context: typeof ctx,
            args: { userId: string; platformKey: string },
          ) => Promise<null>;
        }
      )._handler;
      await assert.rejects(
        validatePlatformKey("ordinary"),
        /Enter an Autumn API key/,
      );
      await assert.rejects(
        handler(ctx, { userId, platformKey: masterKey }),
        /approved for the Platform API/,
      );
      assert.equal(saved.length, 0);
      allowed = true;
      assert.equal(
        await handler(ctx, { userId, platformKey: masterKey }),
        null,
      );
      const record = saved[0];
      assert.ok(record);
      assert.equal(record.accountId, autumnPlatformAccount);
      assert.notEqual(record.token, masterKey);
      assert.equal(await autumnPlatformKey(ctx as never, userId), masterKey);
      await assert.rejects(
        autumnPlatformKey(ctx as never, "other-user"),
        /Connect Autumn/,
      );
    },
  );
});
