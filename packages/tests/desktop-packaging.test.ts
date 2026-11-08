import { test } from "node:test";
import assert from "node:assert/strict";
import { MakerDMG } from "@electron-forge/maker-dmg";
import config from "../../apps/desktop/forge.config.mts";

test("macOS disk image uses a bounded title without overriding artifact names", async () => {
  const maker = config.makers?.find((item) => item instanceof MakerDMG);
  assert.ok(maker instanceof MakerDMG);
  await maker.prepareConfig("arm64");
  assert.equal(maker.config.title, "Install");
  assert.equal(maker.config.name, undefined);
});
