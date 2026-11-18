import { test, expect } from "bun:test";
import { assignHost } from "../../backend/convex/gateway/model";
import { resolve } from "../../backend/convex/gateway/index";
import { presentPlatforms } from "../../backend/convex/previews/internal";

function fixture() {
  const tables: Record<string, any[]> = {
    apps: [],
    previews: [],
    appHosts: [],
  };
  const ctx: any = {
    db: {
      query: (table: string) => ({
        withIndex: (_index: string, fn: any) => {
          const filters: [string, unknown][] = [];
          const q = {
            eq: (key: string, value: unknown) => {
              filters.push([key, value]);
              return q;
            },
          };
          fn(q);
          return {
            unique: async () =>
              tables[table]!.find((row) =>
                filters.every(([key, value]) => row[key] === value),
              ) ?? null,
          };
        },
      }),
      insert: async (table: string, value: any) => {
        const _id = `${table}-${tables[table]!.length}`;
        tables[table]!.push({ ...value, _id });
        return _id;
      },
      patch: async (table: string, id: string, value: any) =>
        Object.assign(
          tables[table]!.find((row) => row._id === id),
          value,
        ),
    },
  };
  const app: any = {
    _id: "app",
    appId: "ab123456-1111-4111-8111-111111111111",
    name: "Morning Garden",
    platforms: ["web", "api", "mcp"],
  };
  tables.apps!.push(app);
  return { ctx, tables, app };
}

test("stable production and draft names stay distinct, DNS-safe and reserved", async () => {
  const { ctx, tables, app } = fixture();
  const prod = await assignHost(
    ctx,
    app,
    undefined,
    "https://production-123.convex.site",
  );
  const first = await assignHost(
    ctx,
    app,
    "feature/one",
    "https://preview-123.convex.site",
  );
  const second = await assignHost(
    ctx,
    app,
    "feature-one",
    "https://preview-456.convex.site",
  );
  expect(prod).toBe("https://morning-garden-ab123456.disposabl.xyz");
  expect(first).toStartWith(prod.replace(".disposabl.xyz", "-"));
  expect(first).not.toBe(second);
  expect(
    await assignHost(
      ctx,
      { ...app, name: "Renamed" },
      "feature/one",
      "https://next-123.convex.site",
    ),
  ).toBe(first);
  expect(
    tables.appHosts!.find((row) => row.reference === "feature/one").origin,
  ).toBe("https://next-123.convex.site");
  for (const name of ["a".repeat(200), "💚", "---"])
    expect(
      new URL(await assignHost(ctx, app, name)).hostname.split(".")[0]!.length,
    ).toBeLessThanOrEqual(63);
  await expect(
    assignHost(ctx, app, undefined, "https://evil.test"),
  ).rejects.toThrow();
  await expect(
    assignHost(ctx, app, undefined, "https://ok.convex.site.evil.test"),
  ).rejects.toThrow();
  expect(tables.appHosts!.length).toBe(6);
});

test("directory only resolves active apps and existing drafts", async () => {
  const { ctx, tables, app } = fixture();
  const url = await assignHost(
    ctx,
    app,
    "draft",
    "https://draft-123.convex.site",
  );
  const lookup = (hostname: string) =>
    (resolve as any)._handler(ctx, { hostname });
  expect(await lookup(new URL(url).hostname)).toBeNull();
  tables.previews!.push({ appId: app.appId, reference: "draft" });
  expect(await lookup(new URL(url).hostname)).toEqual({
    origin: "https://draft-123.convex.site",
  });
  for (const hostname of [
    "unknown.disposabl.xyz",
    "nested.app.disposabl.xyz",
    "app.disposabl.xyz.evil.test",
    "-bad.disposabl.xyz",
  ])
    expect(await lookup(hostname)).toBeNull();
  app.operation = { kind: "delete" };
  expect(await lookup(new URL(url).hostname)).toBeNull();
  tables.apps = [];
  expect(await lookup(new URL(url).hostname)).toBeNull();
  expect(tables.appHosts!.length).toBe(1);
});

test("presented website, API and MCP links never fall back to provider URLs", () => {
  const { app } = fixture();
  const releases: any = {
    web: { url: "https://old.convex.site", status: "ready", run: {} },
    api: {
      url: "https://old.convex.site/openapi.json",
      status: "ready",
      run: {},
    },
  };
  const publicSite = "https://morning-garden-ab123456.disposabl.xyz";
  const shown = presentPlatforms(app, releases, publicSite);
  expect(shown.web.url).toBe(publicSite);
  expect(shown.api.url).toBe(publicSite + "/openapi.json");
  expect(shown.mcp.url).toBe(publicSite + "/mcp");
  expect(JSON.stringify(shown)).not.toContain("convex.site");
  expect(JSON.stringify(presentPlatforms(app, releases))).not.toContain(
    "convex.site",
  );
});
