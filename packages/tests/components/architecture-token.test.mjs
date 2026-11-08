import { test, expect, mock } from "bun:test";
import { getFunctionName } from "convex/server";

// Local substitutes keep this test independent of provider credentials and services.
mock.module("../../backend/convex/connections/actions/credentials", () => ({
  credential: async () => ({ token: "fixture" }),
}));
mock.module("../../backend/convex/previews/token/actions/management", () => ({
  productionDeployment: async () => ({
    deploymentUrl: "https://prod.convex.cloud",
  }),
  ensureDevelopment: async (_token, _project, reference) => ({
    name: "preview",
    reference,
    convexUrl: "https://preview.convex.cloud",
    convexSiteUrl: "https://preview.convex.site",
    deployKey: "fixture",
  }),
}));
mock.module("../../backend/convex/apps/actions/billing", () => ({
  provisionPayments: async () => {},
}));
const { create } =
  await import("../../backend/convex/previews/token/actions/create");

test("preview tokens only stage architectures when completion is requested", async () => {
  const calls = [];
  const until = Date.now() + 10000;
  const ctx = {
    runQuery: async () => ({
      platforms: ["web"],
      features: [],
      androidArchitectures: ["arm64-v8a"],
      githubOwner: "owner",
      githubRepo: "repo",
    }),
    runAction: async () => 1,
    runMutation: async (ref, args) => {
      const name = getFunctionName(ref);
      calls.push({ name, args });
      return name.endsWith(":begin") ? { until } : null;
    },
  };
  const args = {
    userId: "owner",
    appId: "11111111-1111-4111-8111-111111111111",
    reference: "experiment",
    androidArchitectures: ["x86_64"],
  };
  const ordinary = await create._handler(ctx, args);
  expect(ordinary.configurationLeaseUntil).toBeUndefined();
  expect(calls.some((call) => call.name.endsWith(":stage"))).toBe(false);
  expect(
    calls.find((call) => call.name.endsWith(":applyConfiguration"))?.args
      .androidArchitectures,
  ).toBeUndefined();
  expect(calls.at(-1)?.name).toBe("apps/operations/internal:finish");
  calls.length = 0;
  const configured = await create._handler(ctx, {
    ...args,
    configurationLease: true,
  });
  expect(configured.configurationLeaseUntil).toBe(until);
  expect(
    calls.find((call) => call.name.endsWith(":stage"))?.args
      .androidArchitectures,
  ).toEqual(["x86_64"]);
  expect(
    calls.some((call) => call.name === "apps/operations/internal:finish"),
  ).toBe(false);
  // If the caller fails after issuance and never completes, nothing applies the staged value.
  expect(calls.some((call) => call.name.endsWith(":complete"))).toBe(false);
});
