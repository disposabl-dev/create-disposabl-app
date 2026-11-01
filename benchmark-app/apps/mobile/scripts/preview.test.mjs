import { test } from "node:test";
import assert from "node:assert/strict";
import { androidBaseline } from "./preview.mjs";
const wanted = {
  projectId: "project",
  applicationId: "app.pr1",
  runtimeVersion: "runtime-a",
  channel: "pr-1",
};
const sha256 = "a".repeat(64);
const release = {
  draft: false,
  tag_name: "app-pr-1-1-1",
  body: `<!-- android ${JSON.stringify({ ...wanted, sha256 })} -->`,
  assets: [
    {
      name: "android.apk",
      size: 1,
      state: "uploaded",
      digest: `sha256:${sha256}`,
    },
  ],
};
test("OTA reuses only the latest published, compatible, checksummed APK", () => {
  assert.equal(androidBaseline(release, wanted).tag, release.tag_name);
  for (const change of [{ draft: true }, { assets: [] }, { body: "" }])
    assert.equal(androidBaseline({ ...release, ...change }, wanted), null);
  for (const key of Object.keys(wanted))
    assert.equal(
      androidBaseline(release, { ...wanted, [key]: "different" }),
      null,
    );
});
