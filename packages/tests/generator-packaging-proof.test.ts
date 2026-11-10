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
import { reconfigureApp } from "../create-disposabl-app/reconfigure";
import {
  selectFeatures,
  selectPlatforms,
} from "../create-disposabl-app/options";

const excluded = [
  ".github/workflows/play-bundle.yml",
  ".github/workflows/product-checks.yml",
  ".github/actions/product-checks",
  ".github/scripts/ci-graph.test.ts",
  ".github/scripts/play-bundle.sh",
  ".github/scripts/play-bundle.test.py",
  ".github/scripts/android-release.test.py",
  ".github/scripts/android-bundle-verify.test.mjs",
  ".github/ANDROID-RELEASE.md",
  ".github/scripts/product-browser-check.py",
  ".github/scripts/product-browser-check-test.py",
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

test("product browser gate shares exact-source checks with publication", async () => {
  const parseWorkflow = async (name: string) => {
    const input = await readFile(
      join(import.meta.dirname, "../../.github/workflows", name),
      "utf8",
    );
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
      ],
      { input, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const pipeline = (await parseWorkflow("pipeline.yml")) as {
    jobs: {
      changes: {
        steps: Array<{
          name?: string;
          uses?: string;
          with?: { source_sha: string };
          env?: Record<string, string>;
          secrets?: unknown;
        }>;
      };
      web: {
        needs: string[];
        if: string;
        steps: { name?: string; env?: Record<string, string> }[];
      };
      publish: { needs: string[] };
      packages: { needs: string[] };
      android: { needs: string[] };
      "android-submit": { needs: string; if: string };
    };
  };
  const reusable = (await parseWorkflow("product-checks.yml")) as {
    on: { workflow_call: { inputs: { source_sha: unknown } } };
    permissions: unknown;
    jobs: {
      check: {
        env: Record<string, string>;
        steps: Array<{
          name?: string;
          run?: string;
          uses?: string;
          with?: Record<string, unknown>;
        }>;
      };
    };
  };
  const action = (await parseWorkflow(
    "../actions/product-checks/action.yml",
  )) as {
    runs: { steps: typeof reusable.jobs.check.steps };
  };
  const gate = pipeline.jobs.changes.steps.find(
    (step) => step.name === "Product checks",
  );
  assert.ok(gate);
  assert.equal(gate.uses, "./.github/actions/product-checks");
  assert.equal(gate.env?.GH_TOKEN, "");
  assert.deepEqual(pipeline.jobs.web.needs, ["changes"]);
  assert.equal(
    reusable.jobs.check.steps.find((step) => step.name === "Product checks")
      ?.uses,
    gate.uses,
  );
  const webAllowed = new Function(
    "needs",
    "github",
    "always",
    "cancelled",
    `return ${pipeline.jobs.web.if.replaceAll("needs.product-checks", 'needs["product-checks"]')}`,
  );
  for (const status of ["success", "failure", "cancelled", "skipped"]) {
    assert.equal(
      webAllowed(
        {
          changes: { result: status, outputs: { changed: "true" } },
        },
        {
          repository: "disposabl-dev/create-disposabl-app",
          event_name: "push",
        },
        () => true,
        () => false,
      ),
      status === "success",
    );
  }
  for (const name of ["publish", "packages", "android"] as const)
    assert.ok(pipeline.jobs[name].needs.includes("web"));
  assert.equal(pipeline.jobs["android-submit"].needs, "android");
  assert.match(pipeline.jobs["android-submit"].if, /ANDROID_PLAY_SUBMIT/);
  assert.match(
    pipeline.jobs.web.steps.find((step) => step.name === "Fingerprint")?.env
      ?.UPDATE_POLICY ?? "",
    /disposabl-dev\/create-disposabl-app.*disabled/,
  );
  const checkout = reusable.jobs.check.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout?.with?.ref, "${{ inputs.source_sha }}");
  const runStep = (name: string) =>
    action.runs.steps.find((step) => step.name === name)?.run ?? "";
  assert.equal(
    runStep("Install frozen dependencies"),
    "bun install --frozen-lockfile",
  );
  assert.match(runStep("Verify requested source"), /git rev-parse HEAD/);
  assert.match(runStep("Verify requested source"), /EXPECTED_SOURCE/);
  assert.match(
    runStep("Run isolated product web and backend E2E"),
    /sudo unshare --net --fork/,
  );
  assert.match(
    runStep("Run isolated product web and backend E2E"),
    /exec runuser -u/,
  );
  assert.match(runStep("Run isolated product web and backend E2E"), /env -i/);
  assert.match(
    gate.with?.source_sha ?? "",
    /github\.event\.pull_request\.head\.sha \|\| github\.sha/,
  );
  assert.equal(gate.secrets, undefined);
  assert.deepEqual(reusable.on.workflow_call.inputs.source_sha, {
    required: true,
    type: "string",
  });
  assert.deepEqual(reusable.permissions, { contents: "read" });
  assert.equal(reusable.jobs.check.env.PYTHONDONTWRITEBYTECODE, "1");
  assert.match(
    runStep("Run isolated product web and backend E2E"),
    /PYTHONDONTWRITEBYTECODE=1/,
  );
  const cacheFixture = await mkdtemp(join(tmpdir(), "browser-bytecode-"));
  try {
    await cp(
      join(
        import.meta.dirname,
        "../../.github/scripts/product-browser-check.py",
      ),
      join(cacheFixture, "runner.py"),
    );
    const imported = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util, sys
sys.pycache_prefix = None
spec = importlib.util.spec_from_file_location("runner", "runner.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
`,
      ],
      {
        cwd: cacheFixture,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE:
            reusable.jobs.check.env.PYTHONDONTWRITEBYTECODE,
        },
        encoding: "utf8",
      },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(existsSync(join(cacheFixture, "__pycache__")), false);
  } finally {
    await rm(cacheFixture, { recursive: true, force: true });
  }
  const steps = action.runs.steps as Array<{
    name?: string;
    run?: string;
  }>;
  assert.ok(
    steps.findIndex((step) => step.name === "Install frozen dependencies") <
      steps.findIndex(
        (step) => step.name === "Run isolated product web and backend E2E",
      ),
  );
  assert.match(
    steps.find(
      (step) => step.name === "Run isolated product web and backend E2E",
    )?.run ?? "",
    /PRODUCT_BROWSER_REQUIRE_ISOLATION=1/,
  );
});
const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);

test("packaged starter and generated profiles exclude product proof fixtures", async () => {
  const temp = await mkdtemp(join(tmpdir(), "disposabl-packaging-proof-"));
  try {
    const input = join(temp, "template");
    await cp(template, input, { recursive: true });
    const readmePath = join(input, "packages/tests/README.md");
    const customDocs =
      "\nUnrelated user documentation.\n\n#### Custom checks\nKeep these instructions.\n";
    await writeFile(
      readmePath,
      (await readFile(readmePath, "utf8")) + customDocs,
    );
    async function* profiles() {
      yield template;
      for (const [name, platforms, features] of [
        ["web-minimal", "web", "none"],
        ["web-payments", "web", "authentication,payments"],
        ["mobile-enabled", "web,android,ios", "authentication,payments"],
        ["mobile-minimal", "web,android,ios", "none"],
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
        const module = join(
          destination,
          "apps/mobile/modules/storefront-observer",
        );
        const mobile =
          platforms.includes("ios") || platforms.includes("android");
        assert.equal(
          existsSync(module),
          mobile,
          `${name}: native module selection`,
        );
        for (const path of [
          "packages/tests/mobile-storefront-observer.test.ts",
          "packages/tests/components/mobile-storefront-observer.test.mjs",
        ]) {
          assert.equal(
            existsSync(join(destination, path)),
            mobile && features.includes("payments"),
            `${name}: ${path} must match mobile payments selection`,
          );
        }
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
        // Validate and release each owned profile before making the next one.
        // Keep the mobile reconfiguration assertion on the same profile.
        yield destination;
        if (name === "mobile-enabled") {
          const reconfigured = destination;
          await reconfigureApp(input, reconfigured, "test", {
            features: "authentication",
          });
          for (const path of [
            "packages/tests/mobile-storefront-observer.test.ts",
            "packages/tests/components/mobile-storefront-observer.test.mjs",
          ]) {
            assert.equal(existsSync(join(reconfigured, path)), false, path);
          }
        }
        await rm(destination, { recursive: true, force: true });
      }
    }
    for await (const root of profiles()) {
      const workflow = await readFile(
        join(root, ".github/workflows/pipeline.yml"),
        "utf8",
      );
      assert.doesNotMatch(
        workflow,
        /android-play|play-bundle\.sh|product-checks|DISPOSABL_ANDROID_PLAY_ENABLED|Verify product Play identity|Allocate product Android version/,
      );
      const yaml = spawnSync(
        process.execPath,
        [
          "-e",
          "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
        ],
        { input: workflow, encoding: "utf8" },
      );
      assert.equal(yaml.status, 0, yaml.stderr);
      const parsed = JSON.parse(yaml.stdout) as {
        jobs: Record<
          string,
          {
            if?: string;
            needs?: string;
            steps?: {
              run?: string;
              name?: string;
              env?: Record<string, string>;
            }[];
          }
        >;
      };
      assert.equal(
        parsed.jobs.android.if,
        "needs.web.outputs.android_build == 'true'",
      );
      assert.equal(parsed.jobs["android-submit"].needs, "android");
      assert.match(
        parsed.jobs["android-submit"].if ?? "",
        /ANDROID_PLAY_SUBMIT == 'true'/,
      );
      assert.equal(
        parsed.jobs.web.steps?.find((step) => step.name === "Fingerprint")?.env
          ?.UPDATE_POLICY,
        undefined,
      );
      const androidChecks = spawnSync(
        process.execPath,
        ["test", "./packages/tests/android-failure-workflow.test.ts"],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(
        androidChecks.status,
        0,
        `${root}: ${androidChecks.stdout}\n${androidChecks.stderr}`,
      );
      const mobileScript = await readFile(
        join(root, ".github/scripts/mobile.sh"),
        "utf8",
      );
      assert.ok(existsSync(join(root, ".github/scripts/release-source.sh")));
      for (const helper of mobileScript.matchAll(
        /\.github\/scripts\/([\w-]+\.(?:mjs|sh))/g,
      )) {
        assert.ok(
          existsSync(join(root, ".github/scripts", helper[1])),
          `Missing Android helper ${helper[1]}`,
        );
      }
      if (existsSync(join(root, "apps/mobile"))) {
        for (const helper of [
          "apps/mobile/scripts/android-release-verify.mjs",
          "apps/mobile/scripts/verify-play-aab.mjs",
        ])
          assert.ok(existsSync(join(root, helper)), `Missing ${helper}`);
      }
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
        const module = join(root, "apps/mobile/modules/storefront-observer");
        const moduleConfig = JSON.parse(
          await readFile(join(module, "expo-module.config.json"), "utf8"),
        );
        assert.deepEqual(moduleConfig.platforms, ["ios"]);
        assert.deepEqual(moduleConfig.ios.modules, [
          "StorefrontObserverModule",
        ]);
        assert.equal(
          JSON.parse(await readFile(join(module, "package.json"), "utf8")).name,
          "storefront-observer",
        );
        assert.match(
          await readFile(
            join(module, "ios/StorefrontObserver.podspec"),
            "utf8",
          ),
          /s\.name\s*=\s*['"]StorefrontObserver['"]/,
        );
        assert.match(
          await readFile(
            join(module, "ios/StorefrontObserverModule.swift"),
            "utf8",
          ),
          /Name\("StorefrontObserver"\)/,
        );
        const billingDir = join(root, "packages/disposabl-kit/mobile/billing");
        if (existsSync(billingDir)) {
          for (const file of await readdir(billingDir)) {
            if (!/\.tsx?$/.test(file)) continue;
            const source = await readFile(join(billingDir, file), "utf8");
            for (const match of source.matchAll(
              /from\s+["'](\.\/[^"']+)["']/g,
            )) {
              assert.ok(
                [".ts", ".tsx", "/index.ts", "/index.tsx"].some((extension) =>
                  existsSync(join(billingDir, match[1] + extension)),
                ),
                `${root}: ${file} import ${match[1]} must resolve`,
              );
            }
          }
          assert.match(
            await readFile(join(billingDir, "web-checkout.ts"), "utf8"),
            /from ["']\.\/storefront-observer["']/,
          );
        }
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
        if (
          existsSync(
            join(root, "packages/disposabl-kit/mobile/billing/paywall.ts"),
          )
        ) {
          for (const path of [
            "packages/disposabl-kit/mobile/billing/paywall.ts",
            "packages/disposabl-kit/PAYMENTS.md",
            "packages/disposabl-kit/mobile/expo-plugin.cjs",
          ]) {
            assert.match(
              await readFile(join(root, path), "utf8"),
              /EXPO_PUBLIC_REVENUECAT_OFFERING_ID/,
            );
          }
        }
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
          root.endsWith("web-minimal") || root.endsWith("mobile-minimal")
            ? ["Convex"]
            : root.endsWith("web-payments")
              ? ["Convex", "Google", "Autumn"]
              : root.endsWith("mobile-enabled")
                ? ["Convex", "Google", "Autumn", "RevenueCat"]
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
