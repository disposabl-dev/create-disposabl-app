"use node";

import { ConvexError, v } from "convex/values";
import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../../_generated/api";
import { seal } from "./credentials";

export type AutumnKeys = { sandbox: string; live?: string };
export async function validateAutumnKey(
  key: string,
  environment: "test" | "live",
  fetcher = fetch,
) {
  if (
    !key.startsWith(`am_sk_${environment}_`) ||
    key.length > 4096 ||
    /\s/.test(key)
  )
    throw new ConvexError(
      `Enter an Autumn ${environment === "test" ? "sandbox" : "live"} secret key.`,
    );
  try {
    const response = await fetcher("https://api.useautumn.com/v1/plans.list", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "x-api-version": "2.6.0",
      },
      body: "{}",
    });
    if (!response.ok || !Array.isArray((await response.json()).list))
      throw new Error();
  } catch {
    throw new ConvexError(
      "Autumn could not verify this key. Check its environment and permissions, then try again.",
    );
  }
}

export const connect = internalAction({
  args: {
    ...identityFields,
    sandboxKey: v.string(),
    liveKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, sandboxKey, liveKey }) => {
    const keys: AutumnKeys = {
      sandbox: sandboxKey.trim(),
      ...(liveKey?.trim() ? { live: liveKey.trim() } : {}),
    };
    await validateAutumnKey(keys.sandbox, "test");
    if (keys.live) await validateAutumnKey(keys.live, "live");
    await ctx.runMutation(internal.connections.internal.save, {
      userId,
      provider: "autumn",
      accountId: "autumn",
      name: keys.live
        ? "Sandbox and live keys saved"
        : "Sandbox key saved; no live key saved in this connection",
      token: seal(JSON.stringify(keys), `${userId}:autumn`),
    });
    return null;
  },
});
