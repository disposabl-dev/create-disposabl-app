import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const withSigning = require("../../apps/mobile/plugins/with-android-signing.js");

async function generate(contents = "android {}", twice = false) {
  let config = withSigning({});
  if (twice) config = withSigning(config);
  const result = await config.mods.android.appBuildGradle({
    ...config,
    modResults: { language: "groovy", contents },
    modRequest: {},
  });
  return result.modResults.contents as string;
}

test("production signing remains designated and fails closed without embedding inputs", async () => {
  const previous = process.env.ANDROID_KEYSTORE_PATH;
  try {
    delete process.env.ANDROID_KEYSTORE_PATH;
    const withoutPath = await generate();
    process.env.ANDROID_KEYSTORE_PATH = "synthetic-private-path-marker";
    const withPath = await generate();
    assert.equal(withoutPath, withPath);
    assert.doesNotMatch(withPath, /synthetic-private-path-marker/);
    assert.match(withPath, /if \(storePath\) storeFile file\(storePath\)/);
    assert.match(
      withPath,
      /buildTypes\.release\.signingConfig = signingConfigs\.disposablRelease/,
    );
    assert.match(withPath, /required\.any \{ !System\.getenv\(it\) \}/);
    assert.match(withPath, /selector\(\)\.withBuildType\("release"\)/);
    assert.match(withPath, /releaseVariants\.contains\(task\.variantName\)/);
  } finally {
    if (previous === undefined) delete process.env.ANDROID_KEYSTORE_PATH;
    else process.env.ANDROID_KEYSTORE_PATH = previous;
  }
});

test("preview keeps Expo signing and plugin application is idempotent", async () => {
  const result = await generate("android {}", true);
  assert.match(
    result,
    /if \(System\.getenv\("DISPOSABL_ANDROID_CHANNEL"\) == "production"\)/,
  );
  assert.equal(
    result.split("// Disposabl production APK signing.").length - 1,
    1,
  );
});
