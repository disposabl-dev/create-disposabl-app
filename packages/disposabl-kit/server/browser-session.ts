import { components } from "../../backend/convex/_generated/api";
import type { MutationCtx } from "../../backend/convex/_generated/server";

export const browserSessionTtl = {
  accessTokenTtlSeconds: 60,
  refreshInactivityTimeoutSeconds: 30 * 24 * 60 * 60,
  sessionMaxLifetimeSeconds: 30 * 24 * 60 * 60,
};
export async function hashBrowserCode(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function exchangeBrowserSession(
  ctx: MutationCtx,
  sessionId: string,
  userId: string,
) {
  return ctx.runMutation(components.auth.public.exchangeSession, {
    sessionId,
    userId,
    ...browserSessionTtl,
  });
}
