"use node";

import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/** GitHub alone signs the repository, workflow and run identity. */
export async function verifyGitHubToken(token: string) {
  if (token.length > 16_000) throw new Error("Invalid Actions token.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Actions token.");
  const [headerPart, bodyPart, signature] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString());
  if (header.alg !== "RS256" || typeof header.kid !== "string")
    throw new Error("Invalid Actions signature.");
  const response = await fetch(
    "https://token.actions.githubusercontent.com/.well-known/jwks",
    { redirect: "error", signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error("Cannot verify Actions identity.");
  const { keys } = (await response.json()) as {
    keys: (JsonWebKey & { kid: string })[];
  };
  const key = keys.find((key) => key.kid === header.kid);
  if (
    !key ||
    !verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${bodyPart}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(signature, "base64url"),
    )
  )
    throw new Error("Invalid Actions signature.");
  const claims = JSON.parse(
    Buffer.from(bodyPart, "base64url").toString(),
  ) as Record<string, unknown>;
  const now = Date.now() / 1000;
  if (
    claims.iss !== "https://token.actions.githubusercontent.com" ||
    claims.aud !== "https://disposabl.dev" ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.nbf !== "number" ||
    claims.nbf > now + 30
  )
    throw new Error("Expired or invalid Actions identity.");
  for (const key of ["repository_id", "run_id", "run_attempt"] as const)
    if (
      typeof claims[key] !== "string" ||
      !/^[1-9]\d*$/.test(claims[key]) ||
      !Number.isSafeInteger(Number(claims[key]))
    )
      throw new Error("Invalid Actions run.");
  for (const key of [
    "repository",
    "workflow_ref",
    "ref",
    "event_name",
  ] as const)
    if (typeof claims[key] !== "string")
      throw new Error("Missing Actions identity.");
  return claims as Record<string, string>;
}
