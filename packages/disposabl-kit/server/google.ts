import { httpActionGeneric } from "convex/server";
import { ConvexError } from "convex/values";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../backend/convex/_generated/server";

const path = "/oauth/relay/google";
const issuer = "disposabl-google-preview";
const convexOrigin = /^https:\/\/[a-z0-9-]+\.convex\.site$/;

export function googleConfigured() {
  return Boolean(
    env.AUTH_GOOGLE_CLIENT_ID &&
    env.AUTH_GOOGLE_CLIENT_SECRET &&
    (!env.AUTH_GOOGLE_RELAY_URL || env.AUTH_GOOGLE_RELAY_SECRET),
  );
}

function relaySettings() {
  const url = env.AUTH_GOOGLE_RELAY_URL;
  const secret = env.AUTH_GOOGLE_RELAY_SECRET;
  if (!url || !secret || secret.length < 32)
    throw new Error("Google preview relay is not configured.");
  const parsed = new URL(url);
  if (!convexOrigin.test(parsed.origin) || url !== parsed.origin + path)
    throw new Error("Google preview relay must use a Convex HTTP endpoint.");
  return { url, key: new TextEncoder().encode(secret) };
}

/** Wrap only Google's state. Convex keeps its own state, PKCE and one-time tickets. */
export async function googleAuthorizationState(state: string) {
  if (!googleConfigured())
    throw new ConvexError("Google sign-in is unavailable.");
  if (!env.AUTH_GOOGLE_RELAY_URL) return state;
  const { url, key } = relaySettings();
  const origin = env.CONVEX_SITE_URL;
  if (!origin || !convexOrigin.test(origin))
    throw new Error("Google preview requires a Convex HTTP origin.");
  return new SignJWT({ state, origin })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(url)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

export const googleRelay = httpActionGeneric(async (_ctx, request) => {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  const incoming = new URL(request.url);
  if (incoming.origin + incoming.pathname !== env.AUTH_GOOGLE_RELAY_URL)
    return new Response("Not found", { status: 404, headers });
  try {
    const state = incoming.searchParams.get("state");
    if (!state || state.length > 2048) throw new Error("Invalid state");
    const { url, key } = relaySettings();
    const { payload } = await jwtVerify(state, key, {
      algorithms: ["HS256"],
      issuer,
      audience: url,
      maxTokenAge: "10m",
      requiredClaims: ["exp", "iat"],
    });
    if (
      typeof payload.origin !== "string" ||
      !convexOrigin.test(payload.origin) ||
      typeof payload.state !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(payload.state)
    )
      throw new Error("Invalid destination");
    const callback = new URL(payload.origin + "/oauth/google/callback");
    callback.searchParams.set("state", payload.state);
    // The destination component alone redeems the code and consumes its native state.
    for (const name of ["code", "error"])
      if (incoming.searchParams.has(name)) {
        const value = incoming.searchParams.get(name)!;
        if (value.length > 4096) throw new Error("Invalid response");
        callback.searchParams.set(name, value);
      }
    return new Response(null, {
      status: 302,
      headers: { ...headers, Location: callback.href },
    });
  } catch {
    return new Response(
      "Invalid or expired Google sign-in. Please try again.",
      {
        status: 400,
        headers,
      },
    );
  }
});
