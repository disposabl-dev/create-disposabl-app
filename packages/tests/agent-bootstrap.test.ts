import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boat } from "../backend/convex/agent/boat";
import {
  authorizeSandbox,
  appCredentialDirectory,
} from "../backend/convex/agent/bootstrap";
import { configureRepository } from "../cli/repository";
import { digest } from "../backend/convex/agent/access";

test("sandbox bootstrap privately installs the owning app's session without a token in commands", async () => {
  const original = {
    exec: boat.exec,
    writeFile: boat.writeFile,
    origin: process.env.CONVEX_SITE_URL,
  };
  const commands: string[] = [];
  const writes: any[] = [];
  const grants: any[] = [];
  try {
    process.env.CONVEX_SITE_URL = "https://fixture.convex.site";
    boat.exec = (async (_ctx, args) => {
      commands.push(args.command);
      return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
    }) as typeof boat.exec;
    boat.writeFile = (async (_ctx, args) => {
      writes.push(args);
      return null;
    }) as typeof boat.writeFile;
    const ctx = {
      runMutation: async (_ref: unknown, args: any) => {
        grants.push(args);
        return Date.now() + 14_400_000;
      },
      runQuery: async (_ref: unknown, args: any) => {
        const grant = grants.find((item) => item.hash === args.hash);
        assert.equal(args.worker.token, "lease");
        return (
          grant && {
            userId: grant.userId,
            appId: grant.appId,
            threadId: grant.id,
          }
        );
      },
    } as any;
    for (const appId of ["app-a", "app-b"])
      await authorizeSandbox(
        ctx,
        { userId: "owner", appId },
        { id: appId, token: "lease" },
      );
    assert.equal(writes.length, 2);
    for (const [index, write] of writes.entries()) {
      const session = JSON.parse(write.content);
      assert.equal(write.ownerId, "owner");
      assert.equal(write.key, "workspace");
      assert.ok(
        write.path.startsWith(
          appCredentialDirectory(index ? "app-b" : "app-a"),
        ),
      );
      assert.equal(
        await digest(session.tokens.access_token),
        grants[index].hash,
      );
      assert.equal(
        commands.join("\n").includes(session.tokens.access_token),
        false,
      );
      assert.ok(
        commands.some(
          (command) =>
            command.startsWith("chmod 600 ") && command.includes(write.path),
        ),
      );
    }
    assert.notEqual(writes[0].path, writes[1].path);
  } finally {
    boat.exec = original.exec;
    boat.writeFile = original.writeFile;
    if (original.origin === undefined) delete process.env.CONVEX_SITE_URL;
    else process.env.CONVEX_SITE_URL = original.origin;
  }
});

test("repository setup saves private credentials per app and origin, returning no token", async () => {
  const previous = process.env.DISPOSABL_CONFIG_DIR;
  const directory = await mkdtemp(join(tmpdir(), "disposabl-repository-test-"));
  try {
    process.env.DISPOSABL_CONFIG_DIR = directory;
    const first = await configureRepository("https://one.example", "a", {
      token: "fixture",
      repository: "owner/app",
    });
    const second = await configureRepository("https://one.example", "b", {
      token: "other",
      repository: "owner/other",
    });
    const isolated = await configureRepository("https://two.example", "a", {
      token: "preview",
      repository: "owner/app",
    });
    assert.equal(JSON.stringify(first).includes("fixture"), false);
    assert.equal((await stat(first.credentialFile)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal(
      JSON.parse(await readFile(first.credentialFile, "utf8")).token,
      "fixture",
    );
    assert.equal(
      new Set([
        first.credentialFile,
        second.credentialFile,
        isolated.credentialFile,
      ]).size,
      3,
    );
  } finally {
    if (previous === undefined) delete process.env.DISPOSABL_CONFIG_DIR;
    else process.env.DISPOSABL_CONFIG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("paid credential lifecycle uses the real issuance and access handlers", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(
        import.meta.dirname,
        "fixtures/agent-inert-convex/paid-credential.test.mjs",
      ),
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        E2E_TELEMETRY_DISABLED: "1",
        DO_NOT_TRACK: "1",
      },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /7 pass/);
});
