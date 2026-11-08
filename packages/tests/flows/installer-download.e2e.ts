import { test, expect } from "e2e";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { root } from "../project";

test(
  "private installer requests isolate owners and preview branches",
  { platforms: ["backend"] },
  async () => {
    const origin = new URL(process.env.E2E_CONVEX_URL || "http://invalid");
    const site = new URL(process.env.E2E_CONVEX_SITE_URL || "http://invalid");
    const key = process.env.E2E_CONVEX_ADMIN_KEY;
    const loopback = (url: URL) =>
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    test.skip(
      !key || !loopback(origin) || !loopback(site),
      "Requires an explicit isolated loopback backend and admin fixture key",
    );
    async function call(
      path: string,
      args: object,
      token?: string,
      kind = "action",
      admin = false,
    ) {
      const response = await fetch(
        `${origin.origin}/api/${admin ? "function" : kind}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: {
            "Content-Type": "application/json",
            ...(admin
              ? { Authorization: `Convex ${key}` }
              : token
                ? { Authorization: `Bearer ${token}` }
                : {}),
          },
          body: JSON.stringify({ path, args, format: "json" }),
        },
      );
      return response.json();
    }
    async function user() {
      const signup = await call(
        "auth:signUpWithUsernamePassword",
        {
          username: `download${randomUUID().replaceAll("-", "")}`,
          password: `Download-${randomUUID()}!`,
        },
        undefined,
        "mutation",
      );
      expect(signup.status).toBe("success");
      expect(signup.value.status).toBe("complete");
      const token = signup.value.tokens.accessToken as string;
      const current = await call("users/index:current", {}, token, "query");
      expect(current.status).toBe("success");
      return { token, id: current.value.id as string };
    }
    const owner = await user();
    const other = await user();
    const appId = randomUUID();
    const reference = "fixture-preview";
    const args = { appId, platform: "android", reference };
    const dir = mkdtempSync(join(tmpdir(), "disposabl-download-e2e-"));
    const repo = `fixture-${randomUUID()}`;
    const release = {
      status: "ready",
      githubReleaseUrl: `https://github.com/fixture/${repo}/releases/tag/app-pr-1-android`,
      artifactUrl: `https://github.com/fixture/${repo}/releases/download/app-pr-1-android/android.apk`,
      run: {
        id: 1,
        attempt: 1,
        number: 1,
        commitSha: "a".repeat(40),
        url: `https://github.com/fixture/${repo}/actions/runs/1`,
      },
    };
    try {
      const fixtures = {
        apps: [
          {
            appId,
            userId: owner.id,
            name: "Installer fixture",
            platforms: ["android"],
            githubOwner: "fixture",
            githubRepo: repo,
          },
        ],
        previews: [
          {
            appId,
            reference,
            stage: "building",
            releases: { android: release },
            updatedAt: Date.now(),
          },
          {
            appId,
            reference: "failed-preview",
            stage: "building",
            releases: { android: { ...release, status: "failed" } },
            updatedAt: Date.now(),
          },
        ],
        githubConnections: [
          {
            userId: owner.id,
            owner: "fixture",
            installationId: "fixture-not-a-provider-installation",
          },
        ],
      };
      for (const [table, rows] of Object.entries(fixtures)) {
        const file = join(dir, `${table}.json`);
        writeFileSync(file, JSON.stringify(rows));
        const result = spawnSync(
          process.execPath,
          [
            join(
              dirname(
                createRequire(import.meta.url).resolve("convex/package.json"),
              ),
              "bin/main.js",
            ),
            "import",
            "--append",
            "--table",
            table,
            file,
            "--url",
            origin.origin,
            "--admin-key",
            key!,
          ],
          { cwd: join(root, "packages/backend"), encoding: "utf8" },
        );
        if (result.status !== 0)
          throw new Error(
            `Fixture import failed: ${result.stderr.replaceAll(key!, "[redacted]")}`,
          );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // No valid provider call is made: positive selection uses the internal DB query,
    // while public action checks below all fail before reading provider credentials.
    const selected = await call(
      "downloads/internal:candidate",
      { ...args, userId: owner.id },
      undefined,
      "query",
      true,
    );
    expect(selected.status).toBe("success");
    expect(selected.value.preview).toBe(true);
    expect(selected.value.repo).toBe(repo);
    const unowned = await call(
      "downloads/internal:candidate",
      { ...args, userId: other.id },
      undefined,
      "query",
      true,
    );
    expect(unowned.value).toBe(null);
    for (const [token, request] of [
      [undefined, args],
      [other.token, args],
      [owner.token, { ...args, reference: "missing-preview" }],
      [owner.token, { ...args, reference: "failed-preview" }],
      [owner.token, { ...args, platform: "windows" }],
    ] as const) {
      const result = await call("downloads/index:installer", request, token);
      expect(result.status).toBe("error");
      expect(result.errorMessage.includes("server-only-token")).toBe(false);
    }
    const publicResponse = await fetch(
      `${site.origin}/downloads/${appId}/android?reference=${reference}`,
    );
    expect(publicResponse.status).toBe(404);
  },
);
