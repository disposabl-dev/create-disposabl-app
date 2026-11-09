import { test, expect } from "e2e";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { backendUrl, siteUrl, project } from "../project.ts";
import { packagedSdk } from "../helpers/sdk-auth/prepare.ts";

test(
  "packed SDK follows real username session identity and logout",
  { platforms: ["backend"], tags: ["sdk"] },
  async () => {
    test.skip(
      process.env.E2E_SDK_AUTH_FIXTURE !== "1",
      "Explicit local packaged SDK qualification only",
    );
    test.skip(
      !project.features.includes("authentication") ||
        !project.platforms.includes("api"),
      "Requires authentication and API",
    );
    if (project.features.includes("payments"))
      throw new Error("SDK fixture requires payments disabled");
    if (
      backendUrl() !== "http://127.0.0.1:3530" ||
      siteUrl() !== "http://127.0.0.1:3531"
    )
      throw new Error("SDK fixture requires isolated loopback 3530/3531");
    const adminKey = process.env.E2E_CONVEX_ADMIN_KEY;
    if (!adminKey)
      throw new Error(
        "SDK fixture requires a local admin key for isolation preflight",
      );
    for (const name of [
      "BOAT_API_KEY",
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "AUTUMN_SECRET_KEY",
      "POSTHOG_PROJECT_TOKEN",
      "RESEND_API_KEY",
      "AUTH_GOOGLE_CLIENT_SECRET",
      "REVENUECAT_WEBHOOK_AUTH",
      "E2E_TELEMETRY_DISABLED",
    ]) {
      const result = await fetch(`${backendUrl()}/api/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${adminKey}`,
        },
        body: JSON.stringify({
          path: "_system/cli/queryEnvironmentVariables:get",
          args: { name },
          format: "json",
        }),
      }).then((r) => r.json());
      if (
        result.status !== "success" ||
        (result.value?.value?.trim() ?? "") !==
          (name === "E2E_TELEMETRY_DISABLED" ? "1" : "")
      )
        throw new Error("Unsafe SDK fixture environment");
    }
    async function auth(
      path: string,
      args: object,
      token?: string,
      kind: "query" | "mutation" | "action" = "mutation",
    ) {
      const response = await fetch(`${backendUrl()}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
      });
      const result = await response.json();
      if (result.status !== "success") throw new Error(`${path} failed`);
      return result.value;
    }
    async function account() {
      const username = `sdktest${randomUUID().replaceAll("-", "")}`;
      const password = `Fixture-${randomUUID()}!`;
      expect(
        (await auth("auth:signUpWithUsernamePassword", { username, password }))
          .status,
      ).toBe("complete");
      const result = await auth("auth:signInWithUsernamePassword", {
        username,
        password,
      });
      expect(result.status).toBe("complete");
      return {
        username,
        accessToken: result.tokens.accessToken as string,
        refreshToken: result.tokens.refreshToken as string,
      };
    }
    const first = await account();
    const second = await account();
    const redirectUri = "http://127.0.0.1:49200/callback";
    const registration = await fetch(`${siteUrl()}/mcp/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [redirectUri],
        client_name: "Local SDK fixture",
        token_endpoint_auth_method: "none",
      }),
    });
    expect(registration.status).toBe(201);
    const clientId = (await registration.json()).client_id as string;
    async function grant(sessionToken: string) {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const parameters = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      const authorization = await fetch(
        `${siteUrl()}/mcp/oauth/authorize?${parameters}`,
        { redirect: "manual" },
      );
      expect(authorization.status).toBe(302);
      const consent = new URL(
        authorization.headers.get("location")!,
        siteUrl(),
      );
      expect(consent.origin).toBe(siteUrl());
      expect(consent.pathname).toBe("/consent");
      const requestId = consent.searchParams.get("request");
      if (!requestId) throw new Error("Missing local consent request");
      const decision = await auth(
        "mcp:authorize",
        { requestId, approve: true },
        sessionToken,
        "action",
      );
      const callback = new URL(decision.redirectUrl);
      if (
        callback.origin !== "http://127.0.0.1:49200" ||
        callback.pathname !== "/callback"
      )
        throw new Error("Unexpected local callback");
      const code = callback.searchParams.get("code");
      if (!code) throw new Error("Missing local authorization code");
      const tokenResponse = await fetch(`${siteUrl()}/mcp/oauth/token`, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code,
          code_verifier: verifier,
        }),
      });
      expect(tokenResponse.status).toBe(200);
      const tokens = await tokenResponse.json();
      return {
        accessToken: tokens.access_token as string,
        refreshToken: tokens.refresh_token as string,
      };
    }
    const firstGrant = await grant(first.accessToken);
    const secondGrant = await grant(second.accessToken);
    const { sdk, integrity, tarball, version } = await packagedSdk();
    console.info(
      "Local SDK tarball",
      JSON.stringify({ tarball, version, integrity }),
    );
    expect(integrity.startsWith("sha512-")).toBe(true);
    sdk.client.setConfig({
      baseUrl: siteUrl(),
      auth: first.accessToken,
      throwOnError: false,
    });
    expect((await sdk.usersCurrent()).response?.status).toBe(401);
    sdk.client.setConfig({
      baseUrl: siteUrl(),
      auth: firstGrant.accessToken,
      throwOnError: false,
    });
    const one = await sdk.usersCurrent();
    expect(one.response?.status).toBe(200);
    expect(one.data?.username).toBe(first.username);
    sdk.client.setConfig({ auth: secondGrant.accessToken });
    const two = await sdk.usersCurrent();
    expect(two.response?.status).toBe(200);
    expect(two.data?.username).toBe(second.username);
    expect(two.data?.id).not.toBe(one.data?.id);
    sdk.client.setConfig({ auth: "not-a-valid-token" });
    expect((await sdk.usersCurrent()).response?.status).toBe(401);
    sdk.client.setConfig({ auth: undefined });
    expect((await sdk.usersCurrent()).response?.status).toBe(401);
    sdk.client.setConfig({ auth: secondGrant.accessToken });
    for (const token of [secondGrant.refreshToken, secondGrant.accessToken]) {
      const revoked = await fetch(`${siteUrl()}/mcp/oauth/revoke`, {
        method: "POST",
        body: new URLSearchParams({ token, client_id: clientId }),
      });
      expect(revoked.ok).toBe(true);
    }
    await auth(
      "auth:signOut",
      { refreshToken: second.refreshToken },
      second.accessToken,
    );
    expect((await sdk.usersCurrent()).response?.status).toBe(401);
    expect(
      await auth("auth:isAuthenticated", {}, second.accessToken, "query"),
    ).toBe(false);
    sdk.client.setConfig({ auth: firstGrant.accessToken });
    expect((await sdk.usersCurrent()).data?.username).toBe(first.username);
  },
);
