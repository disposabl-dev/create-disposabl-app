import { test } from "@e2e-dev/web";
import { expect, test as backendTest } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl, siteUrl } from "../project";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

test(
  "account deletion request survives reload and a fresh password session",
  { platforms: ["web"], timeout: 90_000 },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_ACCOUNT_DELETION !== "1",
      "Explicit local account deletion qualification only",
    );
    if (
      ![
        ["http://127.0.0.1:3310", "http://127.0.0.1:3311"],
        ["http://127.0.0.1:3550", "http://127.0.0.1:3551"],
      ].some(
        ([backend, site]) => backendUrl() === backend && siteUrl() === site,
      ) ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error(
        "Deletion fixture requires the designated isolated backend and disabled telemetry.",
      );
    const username = `deletecheck${randomUUID().replaceAll("-", "")}`;
    const password = `Test-${randomUUID()}!`;
    const path = "/legal/delete-account";
    await app.open("/signup?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password", { exact: true }).fill(password);
    await screen.getByRole("button", "Create account", { exact: true }).tap();
    const request = screen.getByRole("button", "Request account deletion", {
      exact: true,
    });
    await expect(request).toBeVisible();
    await request.tap();
    const confirm = screen.getByRole("button", "Confirm deletion request", {
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await screen.getByLabel("Confirmation", { exact: true }).fill("delete");
    await expect(confirm).toBeDisabled();
    await screen.getByRole("button", "Cancel", { exact: true }).tap();
    await request.tap();
    await screen.getByLabel("Confirmation", { exact: true }).fill("DELETE");
    await confirm.tap();
    const pending = screen
      .getByRole("status")
      .filter({ hasText: "Account deletion requested on" });
    await expect(pending).toBeVisible();
    await expect(pending).toContainText("deletion is not confirmed");
    const receipt = await pending.textContent();
    await browser.reload();
    await expect(pending).toHaveText(receipt!);
    await expect(request).not.toBeVisible();
    await app.screenshot("account-deletion-requested");
    await app.open("/dashboard");
    await screen.getByRole("button", "Logout", { exact: true }).tap();
    await expect(browser).toHaveURL("/");
    await app.open(path);
    await expect(
      screen.getByText("Sign in to manage your account deletion request."),
    ).toBeVisible();
    await app.open("/login?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await expect(pending).toHaveText(receipt!);
    await expect(request).not.toBeVisible();
    await app.screenshot("account-deletion-restored");
  },
);

backendTest(
  "pending deletion denies uploads but permits removal of an owned local file",
  { platforms: ["backend"], timeout: 90_000 },
  async () => {
    backendTest.skip(
      process.env.E2E_ACCOUNT_DELETION !== "1",
      "Explicit local deletion qualification only",
    );
    if (
      ![
        ["http://127.0.0.1:3310", "http://127.0.0.1:3311"],
        ["http://127.0.0.1:3550", "http://127.0.0.1:3551"],
      ].some(
        ([backend, site]) => backendUrl() === backend && siteUrl() === site,
      ) ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error(
        "File deletion proof requires the isolated local backend.",
      );
    const adminKey = process.env.E2E_CONVEX_ADMIN_KEY;
    backendTest.skip(
      !adminKey,
      "Admin access must establish local-only storage",
    );
    for (const name of [
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "E2E_TELEMETRY_DISABLED",
    ]) {
      const response = await fetch(`${backendUrl()}/api/query`, {
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
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      expect(result.status).toBe("success");
      expect(result.value?.value?.trim() ?? "").toBe(
        name === "E2E_TELEMETRY_DISABLED" ? "1" : "",
      );
    }
    const client = new ConvexHttpClient(backendUrl());
    const signup = await client.mutation(
      makeFunctionReference<"mutation">("auth:signUpWithUsernamePassword"),
      {
        username: `deletefile${randomUUID().replaceAll("-", "")}`,
        password: `Test-${randomUUID()}!`,
      },
    );
    expect(signup.status).toBe("complete");
    client.setAuth(signup.tokens.accessToken);
    const upload = makeFunctionReference<"action">("files/index:upload");
    const remove = makeFunctionReference<"action">("files/index:remove");
    const args = {
      filename: "deletion-proof.txt",
      mediaType: "text/plain",
      bytes: new TextEncoder().encode("Disposable local deletion proof").buffer,
    };
    const id = await client.action(upload, args);
    let unexpectedId: string | undefined;
    try {
      await client.mutation(
        makeFunctionReference<"mutation">("users/index:requestDeletion"),
        { confirmation: "DELETE" },
      );
      let denied = false;
      try {
        unexpectedId = await client.action(upload, args);
      } catch (error) {
        denied = String(error).includes("Account deletion has been requested");
      }
      expect(denied).toBe(true);
    } finally {
      if (unexpectedId) await client.action(remove, { id: unexpectedId });
      await client.action(remove, { id });
    }
    let removed = false;
    try {
      await client.action(
        makeFunctionReference<"action">("files/index:getDownload"),
        { id },
      );
    } catch (error) {
      removed = String(error).includes("File not found.");
    }
    expect(removed).toBe(true);
  },
);

backendTest(
  "pending deletion fences an existing MCP key and new keys while preserving revocation",
  { platforms: ["backend"], timeout: 90_000 },
  async () => {
    backendTest.skip(
      process.env.E2E_ACCOUNT_DELETION !== "1",
      "Explicit local deletion qualification only",
    );
    if (
      ![
        ["http://127.0.0.1:3310", "http://127.0.0.1:3311"],
        ["http://127.0.0.1:3550", "http://127.0.0.1:3551"],
      ].some(
        ([backend, site]) => backendUrl() === backend && siteUrl() === site,
      ) ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error(
        "Deletion fixture requires the designated isolated backend and disabled telemetry.",
      );
    const call = async (
      kind: string,
      path: string,
      args: object,
      token?: string,
    ) => {
      const response = await fetch(`${backendUrl()}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15_000),
      });
      return response.json();
    };
    const username = `deletekey${randomUUID().replaceAll("-", "")}`;
    const signup = await call("mutation", "auth:signUpWithUsernamePassword", {
      username,
      password: `Test-${randomUUID()}!`,
    });
    expect(signup.value?.status).toBe("complete");
    const session = signup.value.tokens.accessToken as string;
    const key = await call(
      "action",
      "mcp:createApiKey",
      { name: "Local deletion proof" },
      session,
    );
    expect(key.status).toBe("success");
    const { id, apiKey } = key.value as { id: string; apiKey: string };
    const invoke = async () => {
      const response = await fetch(`${siteUrl()}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "users_internal_current",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "users_internal_current",
            arguments: {},
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.json() };
    };
    const rest = () =>
      fetch(`${siteUrl()}/api/users/current`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    try {
      const before = await invoke();
      expect(before.status).toBe(200);
      expect(JSON.stringify(before.body)).toContain(username);
      expect((await rest()).status).toBe(200);
      const requested = await call(
        "mutation",
        "users/index:requestDeletion",
        { confirmation: "DELETE" },
        session,
      );
      expect(requested.value?.status).toBe("requested");
      const after = await invoke();
      expect(after.status).toBe(200);
      expect(after.body.result?.isError).toBe(true);
      expect(JSON.stringify(after.body)).not.toContain(username);
      expect((await rest()).status).toBe(401);
      expect(
        (
          await call(
            "action",
            "mcp:createApiKey",
            { name: "Must be denied" },
            session,
          )
        ).status,
      ).toBe("error");
      expect(
        (await call("query", "users/index:deletionStatus", {}, session)).value,
      ).toEqual(requested.value);
    } finally {
      expect(
        (await call("mutation", "mcp:revokeConnection", { id }, session))
          .status,
      ).toBe("success");
    }
    expect((await invoke()).status).toBe(401);
  },
);
