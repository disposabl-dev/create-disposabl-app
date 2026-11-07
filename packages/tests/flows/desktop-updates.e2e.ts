import { randomBytes, createHash } from "node:crypto";
import { test, expect } from "e2e";
import { backendUrl } from "../project.ts";

test(
  "desktop feeds publish immutable packages and recover across build retries",
  { platforms: ["backend"] },
  async () => {
    const origin = new URL(backendUrl());
    const key = process.env.E2E_CONVEX_ADMIN_KEY;
    test.skip(
      !process.env.E2E_CONVEX_URL ||
        !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
        !key,
      "Requires an explicit isolated loopback backend and admin fixture key",
    );
    const site = new URL(process.env.E2E_CONVEX_SITE_URL!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(site.hostname))
      throw new Error("Feed fixtures require loopback HTTP actions");
    async function call(name: string, args: object, admin = true) {
      return fetch(`${origin.origin}/api/mutation`, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          ...(admin ? { Authorization: `Convex ${key}` } : {}),
        },
        body: JSON.stringify({
          path: `desktopUpdates:${name}`,
          args,
          format: "json",
        }),
      }).then((r) => r.json());
    }
    const app = randomBytes(16).toString("hex");
    const feed = `${site.origin}/desktop/updates/${app}/production/win32/x64/`;
    async function upload(build: number, attempt: number, bytes: string) {
      const url = await call("uploadUrl", {});
      expect(url.status).toBe("success");
      expect(new URL(url.value).hostname).toBe(origin.hostname);
      const response = await fetch(url.value, { method: "POST", body: bytes });
      expect(response.ok).toBe(true);
      const { storageId } = await response.json();
      const version = `1.${build}.${attempt}`;
      return {
        app,
        channel: "production",
        platform: "win32",
        arch: "x64",
        version,
        build,
        attempt,
        filename: `fixture-${version}-full.nupkg`,
        storageId,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sha1: createHash("sha1").update(bytes).digest("hex").toUpperCase(),
        size: Buffer.byteLength(bytes),
      };
    }
    const first = await upload(1, 1, "original");
    expect((await call("publish", first, false)).status).toBe("error");
    const published = await call("publish", first);
    if (published.status !== "success")
      throw new Error(published.errorMessage ?? "Publication failed");
    const repeat = await upload(1, 1, "original");
    expect((await call("publish", repeat)).status).toBe("success");
    expect(
      (await call("discardUpload", { storageId: repeat.storageId })).status,
    ).toBe("success");
    // A successfully published blob remains referenced and cannot be discarded.
    expect(
      (await call("discardUpload", { storageId: first.storageId })).status,
    ).toBe("success");
    const retry = await upload(1, 2, "rebuilt package");
    expect((await call("publish", retry)).status).toBe("success");
    const manifest = await fetch(`${feed}RELEASES`);
    expect(manifest.headers.get("cache-control")).toBe("no-store");
    expect(await manifest.text()).toBe(
      `${retry.sha1} ${feed}${retry.filename} ${retry.size}\n`,
    );
    expect(await (await fetch(`${feed}${first.filename}`)).text()).toBe(
      "original",
    );
    expect(await (await fetch(`${feed}${retry.filename}`)).text()).toBe(
      "rebuilt package",
    );
    const next = await upload(2, 1, "next run");
    expect((await call("publish", next)).status).toBe("success");
    const stale = await upload(1, 99, "old run retry");
    expect((await call("publish", stale)).status).toBe("error");
    expect(
      (await call("discardUpload", { storageId: stale.storageId })).status,
    ).toBe("success");
    expect(await (await fetch(`${feed}RELEASES`)).text()).toBe(
      `${next.sha1} ${feed}${next.filename} ${next.size}\n`,
    );
    expect(
      (await fetch(feed.replace("/production/", "/preview/") + "RELEASES"))
        .status,
    ).toBe(404);
  },
);
