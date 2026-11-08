import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { root } from "../project";

// All fixture writes are restricted to the isolated loopback backend.
test(
  "mobile chat presents local conversation states",
  { platforms: ["android", "ios"], timeout: 180000 },
  async ({ app, screen, platform, device }) => {
    const url = new URL(process.env.E2E_CONVEX_URL || "http://invalid");
    const key = process.env.E2E_CONVEX_ADMIN_KEY;
    test.skip(
      !key || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
      "Requires isolated loopback admin fixture",
    );
    async function call(
      path: string,
      args: Record<string, unknown>,
      opts: {
        admin?: boolean;
        component?: string;
        mutation?: boolean;
        token?: string;
      } = {},
    ) {
      const response = await fetch(
        `${url.origin}/api/${opts.admin ? "function" : opts.mutation ? "mutation" : "query"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(opts.admin
              ? { Authorization: `Convex ${key}` }
              : opts.token
                ? { Authorization: `Bearer ${opts.token}` }
                : {}),
          },
          body: JSON.stringify({
            path,
            args,
            format: "json",
            ...(opts.component ? { componentPath: opts.component } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        },
      ).then((r) => r.json());
      if (response.status !== "success")
        throw new Error(`${path}: ${response.errorMessage ?? response.status}`);
      return response.value;
    }
    const username = `chat${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const password = `Chat-${randomUUID()}!`;
    const signup = await call(
      "auth:signUpWithUsernamePassword",
      { username, password },
      { mutation: true },
    );
    const owner = await call(
      "users/index:current",
      {},
      { token: signup.tokens.accessToken },
    );
    const token = randomUUID();
    const ids = [randomUUID(), randomUUID()];
    const threads = await Promise.all(
      ids.map(() =>
        call(
          "threads:createThread",
          { userId: owner.id, title: "Chat proof" },
          { admin: true, component: "agent" },
        ),
      ),
    );
    const directory = mkdtempSync(join(tmpdir(), "chat-proof-"));
    try {
      const file = join(directory, "apps.json");
      writeFileSync(
        file,
        JSON.stringify(
          ids.map((appId, index) => ({
            appId,
            userId: owner.id,
            name: index ? "Chat unconfirmed" : "Chat proof",
            platforms: ["web"],
            features: ["authentication"],
            agent: {
              threadId: threads[index]._id,
              status: "processing",
              pending: [],
              updatedAt: Date.now(),
              startedAt: Date.now() - 1000,
            },
          })),
        ),
      );
      const cli = join(
        dirname(createRequire(import.meta.url).resolve("convex/package.json")),
        "bin/main.js",
      );
      const result = spawnSync(
        process.execPath,
        [
          cli,
          "import",
          "--append",
          "--table",
          "apps",
          file,
          "--url",
          url.origin,
          "--admin-key",
          key!,
        ],
        { cwd: join(root, "packages/backend"), encoding: "utf8" },
      );
      if (result.status !== 0)
        throw new Error(
          `Fixture import failed: ${(result.stderr || "unknown").replaceAll(key!, "[redacted]")}`,
        );
      const preview = join(directory, "previews.json");
      writeFileSync(
        preview,
        JSON.stringify([
          {
            appId: ids[0],
            reference: "preview/chat-proof",
            stage: "building",
            releases: {
              web: {
                status: "failed",
                run: {
                  id: 42422781201,
                  attempt: 1,
                  number: 1,
                  commitSha: "0".repeat(40),
                  url: "https://github.com/disposabl-dev/create-disposabl-app/actions/runs/42422781201",
                },
              },
            },
            updatedAt: Date.now(),
          },
        ]),
      );
      const imported = spawnSync(
        process.execPath,
        [
          cli,
          "import",
          "--append",
          "--table",
          "previews",
          preview,
          "--url",
          url.origin,
          "--admin-key",
          key!,
        ],
        { cwd: join(root, "packages/backend"), encoding: "utf8" },
      );
      if (imported.status !== 0)
        throw new Error(
          `Preview import failed: ${(imported.stderr || "unknown").replaceAll(key!, "[redacted]")}`,
        );
      const activeId = threads[0]._id as string;
      const failedId = threads[1]._id as string;
      const markdown = `${"A useful markdown paragraph with **bold** and a [link](https://example.com).\n\n".repeat(24)}\n\nEnd of response.`;
      const claims = new Set<string>();
      try {
        for (const id of [activeId, failedId]) {
          await call("agent/state:claim", { id, token }, { admin: true });
          claims.add(id);
          await call(
            "agent/state:append",
            {
              id,
              token,
              events: [
                {
                  id: `message-${id}`,
                  content: `# Conversation proof\n\n${markdown}`,
                  streaming: false,
                  reverted: false,
                },
              ],
            },
            { admin: true },
          );
        }
        await call(
          "agent/state:finish",
          { id: failedId, token, unconfirmed: true },
          { admin: true },
        );
        claims.delete(failedId);
        await app.restart();
        await expect(
          screen.getByRole("button", "Settings", { exact: true }),
        ).toBeVisible();
        await screen.getByRole("button", "Settings", { exact: true }).tap();
        const signIn = screen.getByRole("button", "Sign in", { exact: true });
        const logOut = screen.getByRole("button", "Log out", { exact: true });
        await expect(signIn.or(logOut).first()).toBeVisible();
        if (await logOut.isVisible()) {
          await expect(
            screen.getByRole("button", "Change password", { exact: true }),
          ).toBeVisible();
          await logOut.tap();
          await expect(
            screen.getByRole("button", "Close settings", { exact: true }),
          ).toHaveCount(0);
          await screen.getByRole("button", "Settings", { exact: true }).tap();
        }
        await signIn.tap();
        const name = screen.getByRole("textbox", "Username", { exact: true });
        await name.tap();
        await name.fill(username);
        if (platform === "ios")
          await screen.getByText("next", { exact: true }).tap();
        await screen
          .getByRole("textbox", "Password", { exact: true })
          .fill(password);
        await expect(
          screen.getByRole("button", "Log in", { exact: true }),
        ).toBeEnabled();
        if (platform === "ios")
          await screen.getByText("go", { exact: true }).tap();
        else await screen.getByRole("button", "Log in", { exact: true }).tap();
        const savePassword = screen.getByRole("button", "Not Now", {
          exact: true,
        });
        await expect(
          screen.getByText(username, { exact: true }).first().or(savePassword),
        ).toBeVisible();
        if (await savePassword.isVisible()) await savePassword.tap();
        await expect(
          screen.getByRole("button", "Close settings", { exact: true }),
        ).toBeVisible({ timeout: 30000 });
        await expect(
          screen.getByText(username, { exact: true }).first(),
        ).toBeVisible();
        await screen
          .getByRole("button", "Close settings", { exact: true })
          .tap();
        await screen
          .getByRole("tab", "Your apps", { exact: true })
          .or(screen.getByRole("button", "Your apps", { exact: true }))
          .tap();
        await screen
          .getByRole("button", "Open Chat unconfirmed", { exact: true })
          .tap();
        await expect(
          screen.getByRole("button", "Retry stop", { exact: true }),
        ).toBeVisible();
        await app.screenshot("chat-stop-unconfirmed");
        await screen.getByRole("button", "Back", { exact: true }).tap();
        await screen
          .getByRole("button", "Open Chat proof", { exact: true })
          .tap();
        await expect(
          screen.getByRole("button", "Stop generating", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByRole("button", "New chat", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByRole("button", "Chat options", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByText("preview/chat-proof", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByText("Assistant", { exact: true }),
        ).toHaveCount(0);
        await app.screenshot("chat-active");
        await screen.getByRole("button", "Chat options", { exact: true }).tap();
        await (
          platform === "ios"
            ? screen.getByRole("button", "App settings", { exact: true })
            : screen.getByText("App settings", { exact: true })
        ).tap();
        await screen.scrollUntilVisible(
          platform === "ios"
            ? screen.getByRole("link", "View web build logs", { exact: true })
            : screen.getByText("View build logs", { exact: true }),
        );
        await app.screenshot("chat-build-logs");
        if (platform === "ios") {
          // A visible link does not mean its native scroll view has settled.
          await device.unstable_raw.client.command.wait({
            stable: true,
            quietMs: 500,
            timeoutMs: 5000,
          });
          await device.back();
        } else
          await screen
            .getByRole("button", "Navigate up", { exact: true })
            .tap();
        const transcript =
          platform === "ios" ? screen.getByTestId("chat-transcript") : screen;
        if (platform === "ios")
          await expect(screen.getByTestId("chat-transcript")).toBeVisible();
        await transcript.scrollUntilVisible(
          screen.getByText("End of response.", { exact: true }),
        );
        await transcript.scrollUntilVisible(
          screen.getByText("Conversation proof", { exact: true }),
          { direction: "up" },
        );
        await call(
          "agent/state:append",
          {
            id: activeId,
            token,
            events: [
              {
                id: `message-${activeId}`,
                content: `# Conversation refreshed\n\n${markdown}`,
                streaming: false,
                reverted: false,
              },
              {
                id: "while-reading",
                content: "While reading earlier content.",
                streaming: false,
                reverted: false,
              },
            ],
          },
          { admin: true },
        );
        // The heading changes in the same subscription update as the appended
        // message, so the assertion cannot pass against the previous snapshot.
        await expect(
          screen.getByText("Conversation refreshed", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          screen.getByText("While reading earlier content.", { exact: true }),
        ).not.toBeVisible();
        await transcript.scrollUntilVisible(
          screen.getByText("While reading earlier content.", { exact: true }),
        );
        await call(
          "agent/state:append",
          {
            id: activeId,
            token,
            events: [
              {
                id: "follow-latest",
                content: "Latest response follows.",
                streaming: false,
                reverted: false,
              },
            ],
          },
          { admin: true },
        );
        await expect(
          screen.getByText("Latest response follows.", { exact: true }),
        ).toBeVisible();
        const input = screen.getByTestId("chat-message");
        await input.tap();
        await input.fill(
          "This is a multiline draft for the local composer.\nIt stays within the available width.",
        );
        await expect(input).toBeFocused();
        await expect(
          screen.getByRole("button", "Send message", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByRole("button", "Dictation", { exact: true }),
        ).toBeVisible();
        await expect(
          screen.getByRole("button", "Add attachment", { exact: true }),
        ).toBeVisible();
        await app.screenshot("chat-multiline");
        await input.fill("");
        await call(
          "agent/state:finish",
          { id: activeId, token, done: true },
          { admin: true },
        );
        claims.delete(activeId);
        await expect(
          screen.getByRole("button", "Send message", { exact: true }),
        ).toBeVisible();
        await app.screenshot("chat-completed");
      } finally {
        for (const id of claims)
          await call(
            "agent/state:finish",
            { id, token, done: true },
            { admin: true },
          );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
