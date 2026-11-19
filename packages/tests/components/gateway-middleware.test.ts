import { afterEach, expect, mock, spyOn, test } from "bun:test";

const entries = new Map<string, unknown>();
let cacheDown = false;
let cacheOptions: { keyHashFunction: (key: string) => string };
const cacheSet = mock(
  async (key: string, value: unknown, _options: unknown) => {
    if (cacheDown) throw new Error("cache down");
    entries.set(key, value);
  },
);
mock.module("@vercel/functions", () => ({
  getCache: (options: typeof cacheOptions) => {
    cacheOptions = options;
    return {
      get: async (key: string) => {
        if (cacheDown) throw new Error("cache down");
        return entries.get(key);
      },
      set: cacheSet,
    };
  },
  rewrite: (url: URL) =>
    new Response(null, { headers: { "x-middleware-rewrite": url.href } }),
}));
const { default: middleware } =
  await import("../../../infra/gateway/middleware.ts");
const developmentEndpoint = process.env.ROUTING_CONVEX_URL;
const productionEndpoint = process.env.ROUTING_PRODUCTION_CONVEX_URL;
const previewEndpoints = process.env.ROUTING_PREVIEW_CONVEX_URLS;
afterEach(() => {
  delete process.env.ROUTING_APP_CONVEX_URL;
  entries.clear();
  cacheDown = false;
  cacheSet.mockClear();
  mock.restore();
  if (developmentEndpoint === undefined) delete process.env.ROUTING_CONVEX_URL;
  else process.env.ROUTING_CONVEX_URL = developmentEndpoint;
  if (productionEndpoint === undefined)
    delete process.env.ROUTING_PRODUCTION_CONVEX_URL;
  else process.env.ROUTING_PRODUCTION_CONVEX_URL = productionEndpoint;
  if (previewEndpoints === undefined)
    delete process.env.ROUTING_PREVIEW_CONVEX_URLS;
  else process.env.ROUTING_PREVIEW_CONVEX_URLS = previewEndpoints;
});
function lookup(developmentValue: unknown, productionValue: unknown = null) {
  delete process.env.ROUTING_PREVIEW_CONVEX_URLS;
  process.env.ROUTING_CONVEX_URL = "https://central-123.convex.cloud";
  process.env.ROUTING_PRODUCTION_CONVEX_URL =
    "https://production-456.convex.cloud";
  const values = [developmentValue, productionValue];
  return spyOn(globalThis, "fetch").mockImplementation((async () =>
    Response.json({
      status: "success",
      value: values.shift() ?? null,
    })) as unknown as typeof fetch);
}
function seed(origin = "https://coffee-123.convex.site") {
  entries.set("hostname:coffee.disposabl.xyz", {
    route: { origin },
    expiresAt: Date.now() + 30000,
  });
}
const request = () => new Request("https://coffee.disposabl.xyz/");

test("rewrites callbacks and encoded paths while leaving cache policy to the origin", async () => {
  seed();
  for (const path of [
    "/callback?code=abc&state=a%2Fb",
    "//evil.test/path",
    "/api/health",
  ]) {
    const response = await middleware(
      new Request(`https://coffee.disposabl.xyz${path}`),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `https://coffee-123.convex.site${path}`,
    );
    expect(response.headers.has("Vercel-CDN-Cache-Control")).toBe(false);
  }
  for (const headers of [
    new Headers({ cookie: "session=private" }),
    new Headers({ authorization: "Bearer private" }),
  ]) {
    const response = await middleware(
      new Request("https://coffee.disposabl.xyz/assets/index.js", { headers }),
    );
    expect(response.headers.has("Vercel-CDN-Cache-Control")).toBe(false);
  }
});

test("rejects foreign, nested and malformed hostnames without querying", async () => {
  const fetcher = lookup(null);
  for (const host of [
    "disposabl.xyz",
    "a.b.disposabl.xyz",
    "-a.disposabl.xyz",
    "coffee.disposabl.xyz.evil.test",
    "disposabl-gateway.vercel.app",
  ]) {
    expect(
      (await middleware(new Request(`https://${host}/api/health`))).status,
    ).toBe(404);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

test("rejects unsafe origins from the routing directory", async () => {
  const fetcher = lookup(null);
  for (const origin of [
    "http://coffee.convex.site",
    "https://convex.site.evil.test",
    "https://u:p@coffee.convex.site",
    "https://coffee.convex.site/path",
  ]) {
    fetcher.mockResolvedValueOnce(
      Response.json({ status: "success", value: { origin } }),
    );
    expect((await middleware(request())).status).toBe(503);
  }
  expect(entries.size).toBe(0);
});

test("routes development-only hostnames from cache and refreshes their origin", async () => {
  const clock = spyOn(Date, "now").mockReturnValue(1000);
  const fetcher = lookup({
    origin: "https://first-123.convex.site",
  });
  await middleware(request());
  // Each fetch needs a fresh response body.
  fetcher.mockResolvedValueOnce(
    Response.json({
      status: "success",
      value: { origin: "https://second-123.convex.site" },
    }),
  );
  fetcher.mockResolvedValueOnce(
    Response.json({ status: "success", value: null }),
  );
  await middleware(request());
  expect(fetcher).toHaveBeenCalledTimes(2);
  clock.mockReturnValue(31001);
  expect(
    (await middleware(request())).headers.get("x-middleware-rewrite"),
  ).toBe("https://second-123.convex.site/");
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(cacheSet.mock.calls[0]?.[2]).toEqual({
    ttl: 30,
  });
  expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
    path: "gateway/index:resolve",
    args: { hostname: "coffee.disposabl.xyz" },
    format: "json",
  });
});

test("routes production-only hostnames and queries both directories concurrently", async () => {
  process.env.ROUTING_CONVEX_URL = "https://central-123.convex.cloud";
  process.env.ROUTING_PRODUCTION_CONVEX_URL =
    "https://production-456.convex.cloud";
  const development = Promise.withResolvers<Response>();
  const production = Promise.withResolvers<Response>();
  const fetcher = spyOn(globalThis, "fetch")
    .mockReturnValueOnce(development.promise)
    .mockReturnValueOnce(production.promise);
  const route = middleware(request());
  await Promise.resolve();
  expect(fetcher).toHaveBeenCalledTimes(2);
  development.resolve(Response.json({ status: "success", value: null }));
  production.resolve(
    Response.json({
      status: "success",
      value: { origin: "https://production-123.convex.site" },
    }),
  );
  expect((await route).headers.get("x-middleware-rewrite")).toBe(
    "https://production-123.convex.site/",
  );
});

test("fails visibly when both environments own a slug", async () => {
  const fetcher = lookup(
    { origin: "https://development-123.convex.site" },
    { origin: "https://production-123.convex.site" },
  );
  expect((await middleware(request())).status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(cacheSet).not.toHaveBeenCalled();
});

test("routes an additional preview and rejects collisions across directories", async () => {
  process.env.ROUTING_CONVEX_URL = "https://central-123.convex.cloud";
  process.env.ROUTING_PREVIEW_CONVEX_URLS = "https://preview-789.convex.cloud";
  process.env.ROUTING_PRODUCTION_CONVEX_URL =
    "https://production-456.convex.cloud";
  const values: unknown[] = [
    null,
    { origin: "https://generated-789.convex.site" },
    null,
  ];
  const fetcher = spyOn(globalThis, "fetch").mockImplementation((async () =>
    Response.json({
      status: "success",
      value: values.shift() ?? null,
    })) as unknown as typeof fetch);
  expect(
    (await middleware(request())).headers.get("x-middleware-rewrite"),
  ).toBe("https://generated-789.convex.site/");
  expect(fetcher).toHaveBeenCalledTimes(3);
  entries.clear();
  values.push(
    { origin: "https://other-123.convex.site" },
    { origin: "https://generated-789.convex.site" },
    null,
  );
  expect((await middleware(request())).status).toBe(503);
});

test("rejects duplicate preview directory configuration", async () => {
  const fetcher = lookup(null);
  process.env.ROUTING_PREVIEW_CONVEX_URLS = process.env.ROUTING_CONVEX_URL;
  expect((await middleware(request())).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});

test("fails closed when either routing directory is unavailable", async () => {
  const fetcher = lookup({ origin: "https://development-123.convex.site" });
  fetcher.mockResolvedValueOnce(
    Response.json({
      status: "success",
      value: { origin: "https://development-123.convex.site" },
    }),
  );
  fetcher.mockRejectedValueOnce(new Error("production directory down"));
  expect((await middleware(request())).status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(cacheSet).not.toHaveBeenCalled();
});

test("keeps 100001 hostname cache keys and origins isolated", async () => {
  const fetcher = lookup(null);
  const expiresAt = Date.now() + 300000;
  for (let i = 0; i < 100001; i++) {
    entries.set(`hostname:app-${i}.disposabl.xyz`, {
      route: { origin: `https://app-${i}.convex.site` },
      expiresAt,
    });
  }
  for (let i = 0; i < 100001; i++) {
    const hostname = `app-${i}.disposabl.xyz`;
    const response = await middleware(new Request(`https://${hostname}`));
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `https://app-${i}.convex.site/`,
    );
    expect(cacheOptions.keyHashFunction(`hostname:${hostname}`)).toBe(
      `hostname:${hostname}`,
    );
  }
  expect(fetcher).not.toHaveBeenCalled();
});

test("cache failure falls back and lookup failures are not cached", async () => {
  cacheDown = true;
  const fetcher = lookup({ origin: "https://coffee-123.convex.site" });
  expect((await middleware(request())).status).toBe(200);
  fetcher.mockRejectedValue(new Error("directory down"));
  expect((await middleware(request())).status).toBe(503);
  expect(cacheSet).toHaveBeenCalledTimes(1);
});

test("unknown-host cache expires after five seconds", async () => {
  const clock = spyOn(Date, "now").mockReturnValue(1000);
  const fetcher = lookup(null);
  expect((await middleware(request())).status).toBe(404);
  expect((await middleware(request())).status).toBe(404);
  expect(fetcher).toHaveBeenCalledTimes(2);
  clock.mockReturnValue(6001);
  fetcher.mockResolvedValueOnce(
    Response.json({ status: "success", value: null }),
  );
  expect((await middleware(request())).status).toBe(404);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(cacheSet.mock.calls[0]?.[2]).toEqual({
    ttl: 5,
  });
});

test("simultaneous misses share one lookup, including failed lookups", async () => {
  const fetcher = lookup(null);
  for (const fail of [false, true]) {
    entries.clear();
    const deferred = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(deferred.promise);
    const first = middleware(request());
    const second = middleware(request());
    await Promise.resolve();
    await Promise.resolve();
    if (fail) deferred.reject(new Error("directory down"));
    else
      deferred.resolve(
        Response.json({
          status: "success",
          value: { origin: "https://coffee-123.convex.site" },
        }),
      );
    const responses = await Promise.all([first, second]);
    expect(responses.map((r) => r.status)).toEqual(
      fail ? [503, 503] : [200, 200],
    );
  }
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test("malformed cached routes are replaced by a fresh lookup", async () => {
  seed("https://evil.test");
  const fetcher = lookup({ origin: "https://coffee-123.convex.site" });
  expect(
    (await middleware(request())).headers.get("x-middleware-rewrite"),
  ).toBe("https://coffee-123.convex.site/");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("current app routes do not depend on legacy directory availability", async () => {
  lookup(null);
  process.env.ROUTING_APP_CONVEX_URL = "https://current-123.convex.cloud";
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url) !== "https://current-123.convex.cloud/api/query")
      throw new Error("legacy offline");
    return Response.json({
      status: "success",
      value: { origin: "https://new-app-123.convex.site" },
    });
  });
  const response = await middleware(request());
  expect(response.headers.get("x-middleware-rewrite")).toBe(
    "https://new-app-123.convex.site/",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
