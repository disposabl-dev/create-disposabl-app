import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";
import {
  selectFeatures,
  selectPlatforms,
} from "../create-disposabl-app/options";

const excluded = [
  "packages/backend/convex/users/authDeletion.ts",
  "packages/tests/mcp-deletion-product.test.ts",
  "packages/tests/fixtures/mcp-deletion-product-convex",
  "packages/tests/mobile-theme-identity.test.ts",
  "packages/tests/mcp-erasure-component.test.ts",
  "packages/tests/fixtures/mcp-erasure-convex",
  "packages/tests/mcp-deletion-guard.test.ts",
  "packages/tests/account-deletion-active.test.ts",
  "packages/tests/flows/account-deletion.e2e.ts",
  "packages/tests/account-deletion-stop.test.ts",
  "packages/tests/account-deletion-transactions.test.ts",
  "packages/tests/fixtures/account-deletion-convex",
  "packages/tests/flows/cli-oauth.e2e.ts",
  "packages/tests/helpers/cli-oauth-fixture.ts",
  "packages/tests/cli-oauth-build.test.ts",
  "packages/tests/flows/desktop-real.e2e.ts",
  "packages/tests/components/desktop-real.cjs",
  "packages/tests/billing-handoff-transactions.test.ts",
  "packages/tests/fixtures/billing-handoff-convex",
  "packages/tests/architecture-transactions.test.ts",
  "packages/tests/fixtures/architecture-convex",
  "packages/tests/generator-architecture-setup.test.ts",
  "packages/tests/architecture-token.test.ts",
  "packages/tests/components/architecture-token.test.mjs",
  "packages/tests/mobile-architecture-settings.test.ts",
  "packages/tests/components/mobile-architecture-settings.test.mjs",
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
      const mobileConfigPath = join(root, "apps/mobile/app.json");
      if (existsSync(mobileConfigPath)) {
        const mobileConfig = JSON.parse(
          await readFile(mobileConfigPath, "utf8"),
        );
        assert.equal(mobileConfig.expo.ios.bundleIdentifier, undefined);
        assert.equal(mobileConfig.expo.android.package, undefined);
      }
      const publisher = await readFile(
        join(root, "packages/disposabl-kit/legal/publisher.ts"),
        "utf8",
      );
      const deletion = await readFile(
        join(
          root,
          "packages/disposabl-kit/client/components/account-deletion.tsx",
        ),
        "utf8",
      );
      assert.doesNotMatch(deletion, /api\.users\.index/);
      assert.match(deletion, /Account deletion requests are not available yet/);
      const users = join(root, "packages/backend/convex/users");
      assert.deepEqual((await readdir(users)).sort(), [
        "index.ts",
        "internal.ts",
        "validator.ts",
      ]);
      for (const file of await readdir(users)) {
        const source = await readFile(join(users, file), "utf8");
        assert.doesNotMatch(
          source,
          /requestDeletion|deletionStatus|deletionRequestedAt/,
        );
      }
      const index = await readFile(join(users, "index.ts"), "utf8");
      const internal = await readFile(join(users, "internal.ts"), "utf8");
      assert.match(index, /export const current = query/);
      for (const name of ["current", "createUser", "onSignIn"])
        assert.match(internal, new RegExp(`export const ${name} =`));
      assert.match(publisher, /operatorName: ""/);
      assert.match(publisher, /privacyEmail: ""/);
      assert.doesNotMatch(publisher, /Yast AI|vivek@yast\.ai/);
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
