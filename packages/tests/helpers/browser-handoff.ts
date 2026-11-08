import { randomUUID } from "node:crypto";
import { backendUrl } from "../project.ts";

export async function handoffCall(
  kind: "query" | "mutation",
  path: string,
  args: object,
  token?: string,
) {
  const url = new URL(backendUrl());
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error(
      "Browser handoff fixtures require the isolated loopback backend",
    );
  const response = await fetch(`${url.origin}/api/${kind}`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return response.json();
}
export async function handoffFixture(mobile = false) {
  const username = `handoff${randomUUID().replaceAll("-", "")}`;
  const signed = await handoffCall(
    "mutation",
    "auth:signUpWithUsernamePassword",
    {
      username,
      password: `Handoff-${randomUUID()}!`,
    },
  );
  if (signed.value?.status !== "complete")
    throw new Error("Local username fixture could not sign in");
  const token = signed.value.tokens.accessToken as string;
  const started = await handoffCall(
    "mutation",
    "browserHandoff:create",
    mobile ? { mobile: true } : {},
    token,
  );
  if (started.status !== "success") throw new Error("Could not create handoff");
  const url = new URL(started.value);
  return {
    username,
    token,
    refreshToken: signed.value.tokens.refreshToken as string,
    code: url.hash.slice(1),
    path: url.pathname + url.search + url.hash,
    userId: signed.value.tokens.userId as string,
  };
}
