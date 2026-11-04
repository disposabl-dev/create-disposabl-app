import { test, expect } from "e2e";
import { backendUrl } from "../project.ts";

test(
  "backend recognizes an unauthenticated request",
  { platforms: ["backend"] },
  async () => {
    const response = await fetch(`${backendUrl()}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:isAuthenticated",
        args: {},
        format: "json",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "success",
      value: false,
    });
  },
);
