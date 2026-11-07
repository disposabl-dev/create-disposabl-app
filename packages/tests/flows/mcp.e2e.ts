import { test, expect } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl, project, siteUrl } from "../project.ts";

test(
  "MCP API keys authenticate and revoke without enterprise grants",
  { platforms: ["backend"], tags: ["mcp"] },
  async () => {
    test.skip(
      !project.platforms.includes("mcp") ||
        !project.features.includes("authentication"),
      "MCP and authentication must be enabled",
    );
    const backend = new URL(backendUrl());
    const site = new URL(siteUrl());
    test.skip(
      ![backend, site].every((url) =>
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      ),
      "Account fixtures require loopback deployments",
    );
    const discovery = await fetch(
      `${site.origin}/.well-known/oauth-authorization-server`,
    );
    expect(discovery.status).toBe(200);
    const metadata = await discovery.json();
    expect(metadata.grant_types_supported).toContain("authorization_code");
    expect(metadata.grant_types_supported).toContain("refresh_token");
    expect(
      metadata.grant_types_supported.includes(
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      ),
    ).toBe(false);

    async function convex(
      kind: "query" | "mutation" | "action",
      path: string,
      args: Record<string, unknown>,
      token?: string,
    ) {
      const response = await fetch(`${backend.origin}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15_000),
      });
      return response.json();
    }
    const providers = await convex("query", "auth:providers", {});
    expect(providers.status).toBe("success");
    test.skip(
      providers.value.emailPassword || providers.value.googleOnly,
      "Username authentication is required for this local fixture",
    );
    const username = `mcptest${randomUUID().replaceAll("-", "")}`;
    const password = `Mcp-${randomUUID()}!`;
    const signup = await convex("mutation", "auth:signUpWithUsernamePassword", {
      username,
      password,
    });
    expect(signup.value?.status).toBe("complete");
    const signin = await convex("mutation", "auth:signInWithUsernamePassword", {
      username,
      password,
    });
    expect(signin.value?.status).toBe("complete");
    const session = signin.value.tokens.accessToken as string;
    const key = await convex(
      "action",
      "mcp:createApiKey",
      { name: "MCP E2E" },
      session,
    );
    expect(key.status).toBe("success");
    const { id, apiKey } = key.value as { id: string; apiKey: string };
    async function list(token?: string) {
      return fetch(`${site.origin}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/list",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    }
    try {
      expect((await list()).status).toBe(401);
      const authorized = await list(apiKey);
      expect(authorized.status).toBe(200);
      const result = await authorized.json();
      expect(Array.isArray(result.result?.tools)).toBe(true);
    } finally {
      const revoked = await convex(
        "mutation",
        "mcp:revokeConnection",
        { id },
        session,
      );
      expect(revoked.status).toBe("success");
    }
    expect((await list(apiKey)).status).toBe(401);
  },
);
