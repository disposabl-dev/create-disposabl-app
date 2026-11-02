/// <reference types="node" />
"use node";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ConvexError } from "convex/values";
import { env } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

export const connectionsUrl = () =>
  `${env.CONNECTIONS_ORIGIN || "https://www.disposabl.dev"}/dashboard/connections`;
function encryptionKey() {
  const key = Buffer.from(env.CONNECTIONS_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32)
    throw new ConvexError("Account connections are not configured yet.");
  return key;
}
export function seal(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function unseal(value: string, context: string) {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    data.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function credential(
  ctx: ActionCtx,
  userId: string,
  provider: "convex" | "expo",
) {
  const connection = await ctx.runQuery(internal.connections.internal.get, {
    userId,
    provider,
  });
  if (!connection)
    throw new ConvexError(
      `Connect ${provider === "convex" ? "Convex" : "Expo"} at ${connectionsUrl()} to continue setup.`,
    );
  return {
    ...connection,
    token: unseal(connection.token, `${userId}:${provider}`),
  };
}
