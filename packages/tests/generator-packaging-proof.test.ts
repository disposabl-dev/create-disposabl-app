import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";
import {
  selectFeatures,
  selectPlatforms,
} from "../create-disposabl-app/options";

const excluded = [
  ".github/workflows/play-bundle.yml",
  ".github/scripts/play-bundle.sh",
  ".github/scripts/play-bundle.test.py",
  "packages/tests/ui-telemetry-policy.test.ts",
  "packages/tests/components/ui-telemetry-mobile.test.mjs",
  "packages/tests/components/mobile-posthog-sdk.test.mjs",
  "packages/tests/mobile-posthog-sdk.test.ts",
  "packages/tests/components/ui-telemetry-web.test.mjs",
  "apps/web/src/telemetry.tsx",
  "apps/web/src/telemetry-policy.ts",
  "apps/web/src/telemetry-replay.ts",
  "apps/mobile/src/features/product-telemetry.tsx",
  "apps/mobile/src/features/telemetry-policy.ts",
  "packages/tests/compute-stop.test.ts",
  "packages/tests/auth-deletion-current.test.ts",
  "packages/backend/convex/users/localDeletion.ts",
  "packages/tests/flows/billing-checkout-auth.e2e.ts",
  "packages/tests/fixtures/billing-checkout-browser",
  "packages/tests/flows/sdk-auth.e2e.ts",
  "packages/tests/helpers/sdk-auth",
  "packages/tests/fixtures/starter-payment-reconfigure",
  "packages/tests/starter-payment-reconfigure.test.ts",
  "packages/tests/flows/support-contact.e2e.ts",
  "packages/tests/fixtures/compute-convex",
  "packages/tests/fixtures/telemetry-http-convex",
  "packages/tests/telemetry-http-integration.test.ts",
  "packages/tests/fixtures/telemetry-link-convex",
  "packages/tests/telemetry-link-transactions.test.ts",
  "packages/tests/platform-error-telemetry.test.ts",
  "packages/tests/cli-first-execution.test.ts",
  "packages/tests/cli-version-lifecycle.test.ts",
  "packages/tests/web-action-policy.test.ts",
  "packages/tests/components/mobile-payment-attempts.test.mjs",
  "packages/tests/mobile-payment-attempts.test.ts",
  "packages/tests/components/mobile-guide-actions.test.mjs",
  "packages/tests/mobile-guide-actions.test.ts",
  "packages/tests/components/web-billing-attempts.test.mjs",
  "packages/tests/web-billing-attempts.test.ts",
  "packages/tests/components/web-key-actions.test.mjs",
  "packages/tests/web-key-actions.test.ts",
  "packages/tests/mobile-product-actions.test.ts",
  "packages/tests/components/mobile-action-navigation.test.mjs",
  "packages/tests/components/mobile-agent-composer.test.mjs",
  "packages/tests/sdk-source-attribution.test.ts",
  "packages/tests/fixtures/posthog-replay-browser",
  "packages/tests/fixtures/telemetry-guard-convex",
  "packages/tests/telemetry-guard-transactions.test.ts",
  "packages/tests/telemetry-deletion-guard.test.ts",
  "packages/tests/flows/billing-handoff-auth.e2e.ts",
  "packages/tests/fixtures/billing-handoff-browser",
  "packages/tests/billing-handoff-local.test.ts",
  "packages/tests/fixtures/billing-handoff-local",
  "packages/tests/ios-save-password.test.ts",
  "packages/tests/helpers/ios-save-password.ts",
  "packages/tests/flows/account-deletion-receipt.e2e.ts",
  "packages/backend/convex/users/receipts.ts",
  "packages/tests/legal-product-providers.test.ts",
  "packages/tests/fixtures/file-deletion-convex",
  "packages/tests/fixtures/ephemeral-deletion-convex",
  "packages/tests/ephemeral-deletion-transactions.test.ts",
  "packages/backend/convex/users/ephemeralDeletion.ts",
  "packages/backend/convex/users/fileDeletion.ts",
  "packages/tests/fixtures/auth-identity-erasure-convex",
  "packages/tests/fixtures/agent-inert-convex",
  "packages/tests/fixtures/auth-erasure-convex",
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
  "packages/tests/billing-deletion.test.ts",
  "packages/tests/components/billing-deletion.test.mjs",
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
  "packages/tests/low-credit-elapsed.test.ts",
  "packages/tests/fixtures/low-credit-convex",
];
const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);

test("packaged starter and generated profiles exclude product proof fixtures", async () => {
  const temp = await mkdtemp(join(tmpdir(), "disposabl-packaging-proof-"));
  try {
    const roots = [template];
    const input = join(temp, "template");
    await cp(template, input, { recursive: true });
    const readmePath = join(input, "packages/tests/README.md");
    const customDocs =
      "\nUnrelated user documentation.\n\n#### Custom checks\nKeep these instructions.\n";
    await writeFile(
      readmePath,
      (await readFile(readmePath, "utf8")) + customDocs,
    );
    for (const [name, platforms, features] of [
      ["web-minimal", "web", "none"],
      ["web-payments", "web", "authentication,payments"],
      [
        "all-platforms",
        "web,android,ios,macos,windows,linux,api,mcp,cli,typescript-sdk",
        "authentication,payments,analytics,docs",
      ],
    ]) {
      const destination = join(temp, name);
      await createApp(input, destination, name, {
        version: "test",
        platforms: selectPlatforms(platforms),
        features: selectFeatures(features),
      });
      roots.push(destination);
      for (const path of [
        "packages/tests/helpers/mobile-simulator/preflight.py",
        "packages/tests/helpers/mobile-simulator/test_preflight.py",
        "packages/tests/mobile-simulator-preflight.test.ts",
      ]) {
        assert.equal(
          existsSync(join(destination, path)),
          platforms.includes("ios") || platforms.includes("android"),
          `${name}: ${path} must match mobile selection`,
        );
      }
      const readme = await readFile(
        join(destination, "packages/tests/README.md"),
        "utf8",
      );
      assert.match(
        readme,
        /Unrelated user documentation\.\s+#### Custom checks\s+Keep these instructions\./,
        `${name}: preserve unrelated README content`,
      );
      assert.equal(
        readme.includes("### Isolated iOS simulator acceptance preflight"),
        platforms.includes("ios") || platforms.includes("android"),
      );
      for (const path of [
        "packages/tests/consent-identity.test.ts",
        "packages/tests/components/consent-identity.test.mjs",
      ]) {
        assert.equal(
          existsSync(join(destination, path)),
          features !== "none",
          `${name}: ${path} must match authentication selection`,
        );
      }
    }
    for (const root of roots) {
      const workflow = await readFile(
        join(root, ".github/workflows/pipeline.yml"),
        "utf8",
      );
      assert.doesNotMatch(workflow, /android-play|play-bundle\.sh/);
      const easPath = join(root, "apps/mobile/eas.json");
      if (existsSync(easPath)) {
        const eas = JSON.parse(await readFile(easPath, "utf8"));
        assert.equal(eas.submit?.production?.android, undefined);
        assert.ok(eas.build["ios-production"]);
      }
      assert.equal(
        existsSync(join(root, "apps/web/src/router/pricing.tsx")),
        false,
        "Product pricing wrapper must not enter generated starters",
      );
      const sharedPricing = await readFile(
        join(root, "packages/disposabl-kit/client/routes/pricing.tsx"),
        "utf8",
      );
      assert.doesNotMatch(
        sharedPricing,
        /captureProductAction|from ["'][^"']*(?:posthog|telemetry)/,
      );
      const webRoot = await readFile(
        join(root, "apps/web/src/router/__root.tsx"),
        "utf8",
      );
      assert.doesNotMatch(
        webRoot,
        /ProductTelemetry|AnalyticsPreference|telemetry-policy/,
      );
      const apiKeysPath = join(
        root,
        "apps/web/src/router/_authenticated/dashboard.api-keys.tsx",
      );
      if (existsSync(apiKeysPath)) {
        const apiKeys = await readFile(apiKeysPath, "utf8");
        assert.doesNotMatch(
          apiKeys,
          /captureProductAction|api_key_\w+_attempt|from ["'][^"']*telemetry/,
        );
        assert.match(apiKeys, /await create\(/);
        assert.match(apiKeys, /await revoke\(/);
      }
      const webPackage = JSON.parse(
        await readFile(join(root, "apps/web/package.json"), "utf8"),
      );
      assert.equal(webPackage.dependencies["posthog-js"], undefined);
      const backendApi = await readFile(
        join(root, "packages/backend/convex/_generated/api.d.ts"),
        "utf8",
      );
      assert.doesNotMatch(backendApi, /localDeletion/);
      const mobileConfigPath = join(root, "apps/mobile/app.json");
      if (existsSync(mobileConfigPath)) {
        const mobilePackage = JSON.parse(
          await readFile(join(root, "apps/mobile/package.json"), "utf8"),
        );
        assert.equal(
          mobilePackage.dependencies["posthog-react-native"],
          undefined,
        );
        assert.equal(
          mobilePackage.dependencies["@posthog/react-native-plugin"],
          undefined,
        );
        const billing = await readFile(
          join(root, "packages/disposabl-kit/mobile/billing/paywall.ts"),
          "utf8",
        );
        const paymentsGuide = await readFile(
          join(root, "packages/disposabl-kit/PAYMENTS.md"),
          "utf8",
        );
        const plugin = await readFile(
          join(root, "packages/disposabl-kit/mobile/expo-plugin.cjs"),
          "utf8",
        );
        for (const source of [billing, paymentsGuide, plugin])
          assert.match(source, /EXPO_PUBLIC_REVENUECAT_OFFERING_ID/);
        const mobileConfig = JSON.parse(
          await readFile(mobileConfigPath, "utf8"),
        );
        assert.equal(
          mobileConfig.expo.ios?.infoPlist?.[
            "com.posthog.posthog.CAPTURE_PUSH_NOTIFICATION_OPENED"
          ],
          undefined,
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
      if (root !== template) {
        const result = spawnSync(
          process.execPath,
          [
            "-e",
            `import { legalConfig, legalIsDraft } from "./packages/disposabl-kit/legal/config.ts"; console.log(JSON.stringify({ names: legalConfig.providers.map(p => p.name), operator: legalConfig.operatorName, email: legalConfig.privacyEmail, reviewed: legalConfig.reviewed, draft: legalIsDraft() }));`,
          ],
          { cwd: root, encoding: "utf8" },
        );
        assert.equal(result.status, 0, result.stderr);
        const legal = JSON.parse(result.stdout);
        assert.equal(legal.operator, "");
        assert.equal(legal.email, "");
        assert.equal(legal.reviewed, false);
        assert.equal(legal.draft, true);
        for (const name of ["GitHub", "Expo", "Boat"])
          assert.ok(!legal.names.includes(name));
        assert.deepEqual(
          legal.names,
          root.endsWith("web-minimal")
            ? ["Convex"]
            : root.endsWith("web-payments")
              ? ["Convex", "Google", "Autumn"]
              : ["Convex", "Google", "PostHog", "Autumn", "RevenueCat"],
        );
      }

      const fixtures = join(root, "packages/tests/fixtures");
      if (existsSync(fixtures)) assert.deepEqual(await readdir(fixtures), []);
      const testsReadme = await readFile(
        join(root, "packages/tests/README.md"),
        "utf8",
      );
      assert.doesNotMatch(
        testsReadme,
        /agent-inert-convex|provider-inert agent fixture|E2E_IOS_SAVE_PASSWORD_DIAGNOSTIC|E2E_RECEIPT_CLEANUP/,
      );
      assert.equal(
        existsSync(join(root, "packages/tests/flows/agent.e2e.ts")),
        false,
      );
      for (const path of excluded)
        assert.equal(existsSync(join(root, path)), false, `${root}: ${path}`);
      for (const path of [
        "packages/tests/pricing-identity.test.ts",
        "packages/tests/components/pricing-identity.test.mjs",
        "packages/disposabl-kit/client/routes/pricing.tsx",
        "packages/disposabl-kit/client/components/consent-identity.tsx",
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
