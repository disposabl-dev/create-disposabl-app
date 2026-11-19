import { getCache, rewrite } from "@vercel/functions";

type Resolution = { origin: string } | null;
// Shared across requests so simultaneous misses reuse one lookup.
const pending = new Map<string, Promise<Resolution | Error>>();

const directoryPattern =
  /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.cloud\/?$/;
const originPattern =
  /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.site\/?$/;

async function resolveFromDirectory(endpoint: string, hostname: string) {
  const response = await fetch(new URL("/api/query", endpoint), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: "gateway/index:resolve",
      args: { hostname },
      format: "json",
    }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Routing directory unavailable");
  const result = (await response.json()) as {
    status?: string;
    value?: unknown;
  };
  if (result.status !== "success") throw new Error("Routing query failed");
  const value = result.value;
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    !value ||
    !("origin" in value) ||
    typeof value.origin !== "string" ||
    !originPattern.test(value.origin)
  )
    throw new Error("Invalid routing response");
  return { origin: value.origin.replace(/\/$/, "") };
}

async function resolveHostname(hostname: string): Promise<Resolution> {
  // New app names include their UUID prefix and have a single authoritative directory.
  // Older directories remain available for existing apps, without gating new app traffic.
  const apps = process.env.ROUTING_APP_CONVEX_URL;
  if (apps) {
    if (!directoryPattern.test(apps)) throw new Error("Invalid app directory");
    const route = await resolveFromDirectory(apps, hostname);
    if (route) return route;
  }
  const development = process.env.ROUTING_CONVEX_URL;
  const production = process.env.ROUTING_PRODUCTION_CONVEX_URL;
  const previews = (process.env.ROUTING_PREVIEW_CONVEX_URLS ?? "")
    .split(",")
    .map((endpoint) => endpoint.trim())
    .filter(Boolean);
  const endpoints = [development, ...previews, production];
  if (
    !development ||
    !production ||
    previews.length > 8 ||
    endpoints.some(
      (endpoint) => !endpoint || !directoryPattern.test(endpoint),
    ) ||
    new Set(endpoints).size !== endpoints.length
  )
    throw new Error("Invalid routing directories");

  const routes = (
    await Promise.all(
      endpoints.map((endpoint) => resolveFromDirectory(endpoint!, hostname)),
    )
  ).filter((route) => route !== null);
  if (routes.length > 1)
    throw new Error("Routing slug collision across environments");
  return routes[0] ?? null;
}

export default async function middleware(request: Request) {
  const incoming = new URL(request.url);
  const hostname = incoming.hostname;
  const key = `hostname:${hostname}`;
  let lookup:
    ReturnType<typeof Promise.withResolvers<Resolution | Error>> | undefined;
  try {
    if (
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.disposabl\.xyz$/.test(hostname)
    )
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    const cache = getCache({
      namespace: "gateway-hostnames-v4",
      // Preserve full hostname keys to avoid cross-tenant hash collisions.
      keyHashFunction: (key: string) => key,
    });
    let route: Resolution | undefined;
    try {
      const cached = (await cache.get(key)) as
        { route: Resolution; expiresAt: number } | undefined;
      if (
        cached &&
        cached.expiresAt > Date.now() &&
        (cached.route === null ||
          (typeof cached.route?.origin === "string" &&
            originPattern.test(cached.route.origin)))
      )
        route = cached.route;
    } catch {
      // Cache failures fall back to the routing directory.
    }
    if (route === undefined) {
      const existing = pending.get(hostname);
      if (existing) {
        const result = await existing;
        if (result instanceof Error) throw result;
        route = result;
      } else {
        lookup = Promise.withResolvers<Resolution | Error>();
        pending.set(hostname, lookup.promise);
        // Count lookup time against the cache lease.
        const startedAt = Date.now();
        route = await resolveHostname(hostname);
        const ttl = route ? 30 : 5;
        try {
          await cache.set(
            key,
            { route, expiresAt: startedAt + ttl * 1000 },
            {
              ttl,
            },
          );
        } catch {
          // A cache write failure must not discard a valid route.
        }
        lookup.resolve(route);
        pending.delete(hostname);
        lookup = undefined;
      }
    }
    if (!route)
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    const destination = new URL(route.origin);
    destination.pathname = incoming.pathname;
    destination.search = incoming.search;
    // The Convex origin owns response caching and application authentication.
    return rewrite(destination);
  } catch (error) {
    if (lookup) {
      lookup.resolve(
        error instanceof Error ? error : new Error("Routing lookup failed"),
      );
      pending.delete(hostname);
    }
    return new Response("Temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const config = { runtime: "nodejs", matcher: "/:path*" };
