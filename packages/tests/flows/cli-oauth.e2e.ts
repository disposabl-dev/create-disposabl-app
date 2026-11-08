import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { backendUrl, root, siteUrl } from "../project";
import { createLocalCli } from "../helpers/cli-oauth-fixture";

const run = promisify(execFile);
// This bundles the central CLI's actual command and auth code with a local-only
// test entry point. The published npm binary continues to use its fixed origin.
test(
  "local bundled CLI restores and logs out of an OAuth session",
  {
    platforms: ["web"],
    tags: ["cli-oauth"],
    timeout: 120_000,
  },
  async ({ app, browser, screen }) => {
    test.skip(
      process.env.E2E_CLI_OAUTH !== "1",
      "Explicit local CLI OAuth qualification only",
    );
    const backend = backendUrl();
    const site = siteUrl();
    if (
      ![
        ["http://127.0.0.1:3310", "http://127.0.0.1:3311"],
        ["http://127.0.0.1:3550", "http://127.0.0.1:3551"],
      ].some(([cloud, http]) => backend === cloud && site === http)
    )
      throw new Error(
        "CLI OAuth fixture requires the designated loopback backend and site.",
      );
    if (process.env.E2E_TELEMETRY_DISABLED !== "1")
      throw new Error("CLI OAuth fixture requires disabled E2E telemetry.");

    const fixture = await createLocalCli(root, site);
    const { binary, env } = fixture;
    let child: ChildProcess | undefined;
    let finished: Promise<number | null> | undefined;
    try {
      const cli = async (...args: string[]) => {
        const result = await run("node", [binary, ...args], {
          env,
          timeout: 30_000,
        });
        return result.stdout.trim();
      };
      expect(JSON.parse(await cli("login", "status")).currentUser).toBe(null);

      // Only the local app shell is substituted when this local backend has no
      // deployed static assets. Discovery, authorization and token endpoints stay real.
      if ((await fetch(`${site}/consent`)).status === 404)
        await browser.route(
          /^http:\/\/127\.0\.0\.1:(?:3311|3551)\/mcp\/oauth\/authorize(?:\?.*)?$/,
          async (route) => {
            const upstream = await route.fetch();
            const location = upstream.headers.location;
            const target = location ? new URL(location, site) : undefined;
            const headers = { ...upstream.headers };
            if (target?.origin === site && target.pathname === "/consent")
              headers.location = new URL(
                target.pathname + target.search,
                app.baseUrl,
              ).href;
            await route.fulfill({
              status: upstream.status,
              headers,
              body: await upstream.body(),
            });
          },
        );

      child = spawn("node", [binary, "login", "--no-browser"], {
        env,
        stdio: ["ignore", "ignore", "pipe"],
      });
      finished = new Promise<number | null>((resolve) => {
        child!.once("exit", resolve);
        child!.once("error", () => resolve(null));
      });
      const authorization = await new Promise<string>((resolve, reject) => {
        let text = "";
        const timer = setTimeout(
          () =>
            reject(
              new Error("Local CLI did not provide an authorization URL."),
            ),
          30_000,
        );
        child!.stderr!.on("data", (chunk: Buffer) => {
          text += chunk.toString();
          const match = text.match(
            /http:\/\/127\.0\.0\.1:(?:3311|3551)\/[^\s]+(?=\r?\n)/,
          );
          if (match) {
            clearTimeout(timer);
            resolve(match[0]);
          }
        });
        child!.once("error", () => {
          clearTimeout(timer);
          reject(new Error("Local CLI could not start."));
        });
        child!.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`Local CLI exited before authorization (${code}).`));
        });
      });
      const authorizationUrl = new URL(authorization);
      if (authorizationUrl.origin !== site)
        throw new Error("Unexpected authorization origin.");
      await browser.goto(authorizationUrl.href);
      const username = `clie2e${randomUUID().replaceAll("-", "")}`;
      const password = `Cli-${randomUUID()}!`;
      await screen.getByLabel("Username").fill(username);
      await screen.getByLabel("Password", { exact: true }).fill(password);
      await screen.getByLabel("Confirm password").fill(password);
      await screen.getByRole("button", "Create account").tap();
      await expect(
        screen.getByRole("heading", "Connect your agent"),
      ).toBeVisible();
      await screen.getByRole("button", "Allow", { exact: true }).tap();
      expect(await finished).toBe(0);
      const first = JSON.parse(await cli("login", "status")).currentUser;
      expect(typeof first?.id).toBe("string");
      expect(first?.username).toBe(username);
      expect(JSON.parse(await cli("login", "status")).currentUser).toEqual(
        first,
      );
      const filename = `${createHash("sha256").update(site).digest("hex")}.json`;
      const saved = JSON.parse(
        await readFile(
          join(fixture.directory, "credentials", filename),
          "utf8",
        ),
      );
      const accessToken = saved.tokens?.access_token as string;
      expect(typeof accessToken).toBe("string");
      const authenticatedRequest = () =>
        fetch(`${site}/api/users/current`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15_000),
        });
      expect((await authenticatedRequest()).status).toBe(200);
      await cli("logout");
      expect(JSON.parse(await cli("login", "status")).currentUser).toBe(null);
      expect((await authenticatedRequest()).status).toBe(401);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await Promise.race([
          finished,
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await finished;
      }
      await fixture.cleanup();
    }
  },
);
