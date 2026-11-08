import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName, httpRouter } from "convex/server";
import { requestConfigurationChecked } from "../backend/convex/apps/index";
import { create } from "../backend/convex/previews/token/actions/create";
import { stage, complete } from "../backend/convex/previews/token/internal";
import {
  applyConfiguration,
  get,
  requestConfiguration,
  requestConfigurationLegacy,
} from "../backend/convex/apps/internal";
import { registerPageRoutes } from "../disposabl-kit/server/lib/static";
import config from "../../disposabl.json";

const appId = "11111111-1111-4111-8111-111111111111";
const app = {
  _id: "app-row",
  appId,
  userId: "owner",
  platforms: ["web"],
  features: [],
  androidArchitectures: ["arm64-v8a"],
};
const db = (row: unknown, patch: (...args: unknown[]) => unknown) => ({
  query: () => ({ withIndex: () => ({ unique: async () => row }) }),
  patch,
});

test("failed provisioning retains applied selections and releases the setup lease", async () => {
  const mutations: string[] = [];
  let requested: any;
  const ctx = {
    runQuery: async () => app,
    runMutation: async (ref: any) => {
      const name = getFunctionName(ref);
      mutations.push(name);
      return name.endsWith(":begin") ? { until: Date.now() + 10000 } : null;
    },
    runAction: async (_ref: any, args: any) => {
      requested = args;
      throw new Error("provider unavailable");
    },
  };
  await assert.rejects(
    (create as any)._handler(ctx, {
      userId: "owner",
      appId,
      reference: "main",
      platforms: ["web", "ios"],
      features: ["analytics"],
    }),
    /provider unavailable/,
  );
  assert.ok(requested.platforms.includes("ios"));
  assert.deepEqual(requested.features, ["authentication", "analytics"]);
  assert.equal(
    mutations.some((name) => name.endsWith(":applyConfiguration")),
    false,
  );
  assert.equal(mutations.at(-1), "apps/operations/internal:finish");
});

test("only the current unexpired setup lease can commit selections", async () => {
  const until = Date.now() + 10000;
  let saved: unknown;
  const row = { ...app, operation: { kind: "setup", until } };
  const ctx = {
    db: db(row, async (_table, _id, value) => {
      saved = value;
    }),
  };
  const args = {
    userId: "owner",
    appId,
    until,
    platforms: ["web", "ios"],
    features: [],
  };
  await assert.rejects(
    (applyConfiguration as any)._handler(ctx, { ...args, until: until - 1 }),
    /lease expired/,
  );
  assert.equal(saved, undefined);
  await (applyConfiguration as any)._handler(ctx, args);
  assert.deepEqual(saved, {
    platforms: ["web", "ios"],
    features: [],
  });
});

test("architecture completion is owner and lease fenced and consumes the staged selection", async () => {
  const until = Date.now() + 10000;
  let row: any = { ...app, operation: { kind: "setup", until } };
  const ctx = {
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => row }) }),
      patch: async (_table: unknown, _id: unknown, value: object) => {
        row = { ...row, ...value };
      },
    },
  };
  const args = { userId: "owner", appId, until };
  const selection = { ...args, androidArchitectures: ["x86_64"] };
  await assert.rejects(
    (stage as any)._handler(ctx, { ...selection, androidArchitectures: [] }),
  );
  await assert.rejects(
    (stage as any)._handler(ctx, {
      ...selection,
      androidArchitectures: ["bogus"],
    }),
  );
  await assert.rejects(
    (stage as any)._handler(ctx, {
      ...selection,
      androidArchitectures: ["x86_64", "x86_64"],
    }),
  );
  await (stage as any)._handler(ctx, selection);
  // A failed local configure leaves the staged selection unapplied.
  assert.deepEqual(
    (await (get as any)._handler(ctx, args)).androidArchitectures,
    ["arm64-v8a"],
  );
  await assert.rejects(
    (complete as any)._handler(ctx, { ...args, userId: "other" }),
    /App not found/,
  );
  await assert.rejects(
    (complete as any)._handler(ctx, { ...args, until: until - 1 }),
    /lease expired/,
  );
  row.operation.until = Date.now() - 1;
  await assert.rejects(
    (complete as any)._handler(ctx, { ...args, until: row.operation.until }),
    /lease expired/,
  );
  row.operation = {
    kind: "setup",
    until: until + 1,
    androidArchitectures: ["arm64-v8a"],
  };
  await assert.rejects((complete as any)._handler(ctx, args), /lease expired/);
  row.operation = { kind: "setup", until, androidArchitectures: ["x86_64"] };
  await (complete as any)._handler(ctx, args);
  assert.deepEqual(
    (await (get as any)._handler(ctx, args)).androidArchitectures,
    ["x86_64"],
  );
  await assert.rejects(
    (complete as any)._handler(ctx, args),
    /already completed/,
  );
  const legacy = { ...row, androidArchitectures: undefined };
  assert.deepEqual(
    (await (get as any)._handler({ db: db(legacy, () => {}) }, args))
      .androidArchitectures,
    ["arm64-v8a", "x86_64"],
  );
});

test("configuration requests persist in the conversation before account setup", async () => {
  let prompt = "";
  const ctx = {
    db: db(app, () => {
      throw new Error("Must not change applied metadata");
    }),
    runQuery: async () => app,
    runAction: async (_ref: any, args: any) => {
      prompt = args.prompt;
      return { queued: true };
    },
  };
  await (requestConfiguration as any)._handler(ctx, {
    userId: "owner",
    appId,
    platforms: ["web", "ios"],
    features: ["analytics"],
  });
  assert.match(prompt, /Requested platforms: web,ios/);
  assert.match(prompt, /Requested features: authentication,analytics/);
  assert.match(prompt, /--android-architectures arm64-v8a/);
  assert.match(
    prompt,
    /matching generator does not support --android-architectures/,
  );
  assert.match(prompt, /do not retry with latest or claim the change applied/);
  await (requestConfiguration as any)._handler(ctx, {
    userId: "owner",
    appId,
    platforms: ["web", "android"],
    features: [],
    androidArchitectures: ["x86_64"],
  });
  assert.match(prompt, /--android-architectures x86_64/);
  await assert.rejects(
    (requestConfiguration as any)._handler(ctx, {
      userId: "owner",
      appId,
      platforms: ["web"],
      features: [],
      androidArchitectures: [],
    }),
  );
});

test("settings action authenticates and forwards selected architectures", async () => {
  let forwarded: any;
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "session" }) },
    runQuery: async () => ({ userId: "owner" }),
    runAction: async (_ref: unknown, args: unknown) => {
      forwarded = args;
      return { queued: true };
    },
  };
  const payload = {
    appId,
    platforms: ["web", "android"],
    features: [],
    androidArchitectures: ["x86_64"],
  };
  await (requestConfigurationChecked as any)._handler(ctx, payload);
  assert.deepEqual(forwarded, { ...payload, userId: "owner" });
  await assert.rejects(
    (requestConfigurationChecked as any)._handler(
      { ...ctx, auth: { getUserIdentity: async () => null } },
      payload,
    ),
    /Sign in/,
  );
});

test("legacy configuration mutation queues the same request when payments are disabled", async () => {
  let queued: any;
  await (requestConfigurationLegacy as any)._handler(
    {
      db: db(app, () => {
        throw new Error("unexpected patch");
      }),
      runMutation: async (_ref: unknown, args: unknown) => {
        queued = args;
        return { appId, threadId: "thread", status: "processing" };
      },
    },
    { userId: "owner", appId, platforms: ["web", "android"], features: [] },
  );
  assert.equal(queued.userId, "owner");
  assert.match(queued.prompt, /Requested platforms: web,android/);
});

test("disabled docs cannot be served from retained static assets", async () => {
  const original = [...config.features];
  config.features.splice(
    0,
    config.features.length,
    ...original.filter((f) => f !== "docs"),
  );
  try {
    const http = httpRouter();
    registerPageRoutes(http);
    const handler = http.lookup("/docs/old/index.html", "GET")![0];
    const ctx = {
      runQuery: () => {
        throw new Error("Must not resolve disabled docs assets");
      },
    };
    for (const path of ["/docs", "/docs/old/index.html", "/%64ocs/asset.js"]) {
      const response = await (handler as any)._handler(
        ctx,
        new Request(`https://example.com${path}`),
      );
      assert.equal(response.status, 404);
    }
  } finally {
    config.features.splice(0, config.features.length, ...original);
  }
});
