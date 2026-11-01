import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedPlatforms } from "./preview.mjs";
const enabled = ["web", "android", "ios", "windows", "linux", "macos"];
const selected = (paths, platforms = enabled) =>
  affectedPlatforms(paths, platforms).include.map((entry) => entry.platform);
test("web, backend and documentation changes skip all native runners", () => {
  for (const paths of [
    ["apps/web/src/app.tsx"],
    ["packages/backend/convex/api.ts"],
    ["apps/mobile/README.md", "apps/desktop/.agents/skills/example.md"],
  ])
    assert.deepEqual(selected(paths), []);
});
test("mobile and desktop changes select only their enabled platforms", () => {
  assert.deepEqual(selected(["apps/mobile/src/app/index.tsx"]), [
    "android",
    "ios",
  ]);
  assert.deepEqual(selected(["apps/desktop/src/main.ts"]), [
    "windows",
    "linux",
    "macos",
  ]);
  assert.deepEqual(selected(["apps/mobile/app.json"], ["web", "android"]), [
    "android",
  ]);
});
test("shared dependencies and platform configuration invalidate enabled native builds", () => {
  for (const path of [
    "bun.lock",
    "package.json",
    "disposabl.json",
    "patches/fix.patch",
    "packages/disposabl-kit/client/api.ts",
    ".github/workflows/pipeline.yml",
  ])
    assert.equal(selected([path]).length, 5);
  assert.deepEqual(selected(["bun.lock"], ["web"]), []);
});
test("matrix uses verified Blacksmith OS and architecture families", () => {
  const matrix = affectedPlatforms(["bun.lock"], enabled).include;
  assert.equal(
    matrix.find((entry) => entry.platform === "ios").runner,
    "blacksmith-6vcpu-macos-26",
  );
  assert.equal(
    matrix.find((entry) => entry.platform === "windows").runner,
    "blacksmith-2vcpu-windows-2025",
  );
  assert.throws(
    () => affectedPlatforms([], enabled, "unknown-runner"),
    /runner/,
  );
});
