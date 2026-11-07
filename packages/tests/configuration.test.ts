import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName, httpRouter } from "convex/server";
import { create } from "../backend/convex/previews/token/actions/create";
import {
  applyConfiguration,
  requestConfiguration,
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
  assert.deepEqual(saved, { platforms: ["web", "ios"], features: [] });
});

test("configuration requests persist in the conversation before account setup", async () => {
  let prompt = "";
  const ctx = {
    db: db(app, () => {
      throw new Error("Must not change applied metadata");
    }),
    runQuery: () => {
      throw new Error("Connection readiness belongs to setup");
    },
    runMutation: async (_ref: any, args: any) => {
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
