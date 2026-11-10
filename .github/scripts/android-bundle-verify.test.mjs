import "./android-analytics-policy.test.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  verifyInputs,
  verifyEmbedded,
} from "../../apps/mobile/scripts/android-release-verify.mjs";
import { verifyBundle } from "../../apps/mobile/scripts/verify-play-aab.mjs";

const abis = ["arm64-v8a", "x86_64"];
const config = {
  android: { package: "app.example", versionCode: 123 },
  scheme: ["example"],
  updates: { enabled: false },
  extra: {
    disposablAndroidArchitectures: abis,
    disposablAndroidPayments: false,
  },
};
const manifest = { applicationId: "app.example", androidArchitectures: abis };
const env = {
  CHANNEL: "production",
  DISPOSABL_ANDROID_VERSION_CODE: "123",
  UPDATE_POLICY: "disabled",
  EXPO_PUBLIC_CONVEX_URL: "https://backend.example",
  EXPO_PUBLIC_CONVEX_SITE_URL: "https://site.example",
};
test("production config validates identity, version, backend, E2E and update policy", () => {
  verifyInputs(config, manifest, env);
  for (const bad of [
    { ...env, EXPO_PUBLIC_E2E: "true" },
    { ...env, EXPO_PUBLIC_CONVEX_URL: "http://localhost:1234" },
    { ...env, DISPOSABL_ANDROID_VERSION_CODE: "124" },
  ])
    assert.throws(() => verifyInputs(config, manifest, bad));
  assert.throws(
    () =>
      verifyInputs(config, { ...manifest, applicationId: "app.other" }, env),
    /package/,
  );
  assert.throws(
    () =>
      verifyInputs({ ...config, updates: { enabled: true } }, manifest, env),
    /updates/,
  );
  assert.throws(
    () =>
      verifyInputs(config, { ...manifest, androidArchitectures: ["x86"] }, env),
    /architectures/,
  );
});
test("embedded config must match build configuration", () => {
  verifyEmbedded(config, structuredClone(config));
  for (const field of ["package", "versionCode"])
    assert.throws(() =>
      verifyEmbedded(config, {
        ...config,
        android: { ...config.android, [field]: "wrong" },
      }),
    );
  assert.throws(
    () => verifyEmbedded(config, { ...config, updates: { enabled: true } }),
    /updates/,
  );
  assert.throws(
    () =>
      verifyEmbedded(config, {
        ...config,
        extra: { ...config.extra, disposablAndroidPayments: true },
      }),
    /payments/,
  );
});
test("product policy stays strict while Expo identity supports fingerprinting", () => {
  const product = {
    ...config,
    android: { ...config.android, package: "com.yastai.disposabl" },
    extra: { ...config.extra, eas: { projectId: "fixture-project" } },
  };
  const selected = {
    ...manifest,
    applicationId: product.android.package,
    projectId: "fixture-project",
  };
  const productEnv = {
    ...env,
    GH_REPO: "disposabl-dev/create-disposabl-app",
    EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED: "true",
  };
  verifyInputs(product, selected, productEnv);
  for (const patch of [
    { EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED: "false" },
    { UPDATE_POLICY: "expo" },
  ])
    assert.throws(
      () => verifyInputs(product, selected, { ...productEnv, ...patch }),
      /policy/,
    );
  for (const patch of [
    { extra: { ...product.extra, disposablAndroidPayments: true } },
    { extra: { ...product.extra, eas: { projectId: "other" } } },
    {
      updates: {
        enabled: false,
        requestHeaders: { "expo-channel-name": "production" },
      },
    },
  ])
    assert.throws(() =>
      verifyInputs({ ...product, ...patch }, selected, productEnv),
    );
  const oneAbi = ["arm64-v8a"];
  assert.throws(
    () =>
      verifyInputs(
        {
          ...product,
          extra: { ...product.extra, disposablAndroidArchitectures: oneAbi },
        },
        { ...selected, androidArchitectures: oneAbi },
        productEnv,
      ),
    /policy/,
  );
});
test("bundletool validation rejects invalid AAB metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-validation-"));
  try {
    const bundle = join(dir, "fixture.aab");
    writeFileSync(bundle, "fixture, not an actual AAB");
    const cert = "AA".repeat(32);
    const inputs = {
      bundle,
      packageId: "app.example",
      version: "123",
      architectures: abis,
      expectedCert: cert,
      bundletool: "fixture",
      production: true,
    };
    const fake =
      (
        manifestText,
        entries = "base/lib/arm64-v8a/lib.so\nbase/lib/x86_64/lib.so\n",
        failValidate = false,
      ) =>
      (cmd, args) => {
        if (cmd === "unzip") return entries;
        if (cmd === "java" && args.includes("validate")) {
          if (failValidate) throw Error("invalid bundle");
          return "";
        }
        if (cmd === "java") return manifestText;
        if (cmd === "jarsigner") return "jar verified.";
        return `SHA256: ${cert.match(/../g).join(":")}`;
      };
    const valid =
      'package="app.example" android:versionCode="123" android:targetSdkVersion="36"';
    verifyBundle({ ...inputs, execute: fake(valid) });
    for (const bad of [
      valid.replace("123", "124"),
      valid.replace("app.example", "app.other"),
      valid.replace("36", "35"),
      valid + " e2e_network_security_config",
    ])
      assert.throws(() => verifyBundle({ ...inputs, execute: fake(bad) }));
    assert.throws(
      () =>
        verifyBundle({
          ...inputs,
          execute: fake(valid, "base/lib/x86/lib.so\n"),
        }),
      /ABI/,
    );
    assert.throws(
      () => verifyBundle({ ...inputs, execute: fake(valid, undefined, true) }),
      /invalid bundle/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
