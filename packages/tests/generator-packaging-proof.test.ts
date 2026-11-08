import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";
import {
  selectFeatures,
  selectPlatforms,
} from "../create-disposabl-app/options";

const excluded = [
  "packages/tests/architecture-transactions.test.ts",
  "packages/tests/fixtures/architecture-convex",
  "packages/tests/architecture-token.test.ts",
  "packages/tests/components/architecture-token.test.mjs",
  "packages/tests/generator-packaging-proof.test.ts",
  "packages/tests/compute-provider-http.test.ts",
  "packages/tests/billing-web.config.ts",
  "packages/tests/fixtures/billing-web",
  "packages/tests/flows/billing-web-handoff.e2e.ts",
  "packages/tests/autumn-checkout-integration.test.ts",
  "packages/tests/fixtures/autumn-checkout",
  "packages/tests/native-inbox-transactions.test.ts",
  "packages/tests/fixtures/native-inbox-convex",
  "packages/tests/low-credit-email-integration.test.ts",
  "packages/tests/fixtures/low-credit-convex",
];
const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);

test("packaged starter and both generated profiles exclude product proof fixtures", async () => {
  const temp = await mkdtemp(join(tmpdir(), "disposabl-packaging-proof-"));
  try {
    const roots = [template];
    for (const [name, platforms, features] of [
      ["web-minimal", "web", "none"],
      [
        "all-platforms",
        "web,android,ios,macos,windows,linux,api,mcp,cli,typescript-sdk",
        "authentication,payments,analytics,docs",
      ],
    ]) {
      const destination = join(temp, name);
      await createApp(template, destination, name, {
        version: "test",
        platforms: selectPlatforms(platforms),
        features: selectFeatures(features),
      });
      roots.push(destination);
    }
    for (const root of roots) {
      const fixtures = join(root, "packages/tests/fixtures");
      if (existsSync(fixtures)) assert.deepEqual(await readdir(fixtures), []);
      for (const path of excluded)
        assert.equal(existsSync(join(root, path)), false, `${root}: ${path}`);
      for (const path of [
        "packages/tests/billing.test.ts",
        "packages/tests/billing-setup.test.ts",
        "packages/tests/flows/mobile.e2e.ts",
      ])
        assert.equal(existsSync(join(root, path)), true, `${root}: ${path}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
