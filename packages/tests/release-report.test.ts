import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

for (const action of ["build", "update"]) {
  test(`Android ${action} reports the published installer link`, () => {
    const directory = mkdtempSync(join(tmpdir(), "release-report-"));
    try {
      const scripts = join(directory, ".github/scripts");
      mkdirSync(scripts, { recursive: true });
      copyFileSync(
        new URL("../../.github/scripts/disposabl.mjs", import.meta.url),
        join(scripts, "disposabl.mjs"),
      );
      writeFileSync(
        join(directory, "disposabl.json"),
        JSON.stringify({
          appId: "fixture-app",
          serviceOrigin: "https://service.example",
          platforms: ["android"],
        }),
      );
      const releaseUrl =
        "https://github.com/fixture/app/releases/tag/app-pr-1-android";
      const artifactUrl =
        "https://github.com/fixture/app/releases/download/app-pr-1-android/android.apk";
      const loader = join(directory, "fetch.mjs");
      const report = join(directory, "report.json");
      writeFileSync(
        loader,
        `
        import { writeFileSync } from "node:fs";
        globalThis.fetch = async (input, options) => {
          const url = String(input);
          if (url.startsWith("https://identity.example/"))
            return Response.json({value: "fixture-oidc"});
          if (url === "https://api.github.com/repos/fixture/app/releases/tags/app-pr-1-android")
            return Response.json(${JSON.stringify({
              body: `<!-- android ${JSON.stringify({ action })} -->`,
              html_url: releaseUrl,
              assets: [
                { name: "android.apk", browser_download_url: artifactUrl },
              ],
            })});
          if (url === "https://service.example/github/report") {
            writeFileSync(${JSON.stringify(report)}, options.body);
            return Response.json({});
          }
          throw new Error("Unexpected request: " + url);
        };
      `,
      );
      const result = spawnSync(
        "node",
        [
          "--import",
          loader,
          join(scripts, "disposabl.mjs"),
          "release",
          "android",
          "app-pr-1-android",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            ACTIONS_ID_TOKEN_REQUEST_URL: "https://identity.example/token",
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-token",
            GH_REPO: "fixture/app",
            GH_TOKEN: "fixture-token",
            DISPOSABL_RELEASE_VERSION: "1.0.42",
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(report, "utf8")), {
        appId: "fixture-app",
        platform: "android",
        status: "ready",
        version: "1.0.42",
        githubReleaseUrl: releaseUrl,
        artifactUrl,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
