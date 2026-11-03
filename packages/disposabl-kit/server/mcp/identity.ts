/** Claude publishes this public client with token_endpoint_auth_method: none. */
export const CLAUDE_CLIENT_ID =
  "https://claude.ai/oauth/mcp-oauth-client-metadata";
export const JWT_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
export const ID_JAG_PROFILE = "urn:ietf:params:oauth:grant-profile:id-jag";
export const TOKEN_PREFIX = "mcp_ema_";

export function claudeIssuer(value: string) {
  if (
    !/^https:\/\/identity\.anthropic\.com\/issuers\/[A-Za-z0-9_-]+$/.test(value)
  )
    throw new Error(
      "Use the exact Claude organization issuer URL, without a trailing slash.",
    );
  return value;
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("A verified email is required.");
  return email;
}

export async function tokenHash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
