import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { v } from "convex/values";
import { setup } from "../disposabl-kit/server/billing-functions";

const root = resolve(import.meta.dirname, "../..");
const exec = promisify(execFile);

test("catalog setup is internal, validated and runs on the dev deployment's first push", async () => {
  assert.equal(setup.isInternal, true);
  assert.ok("args" in setup);
  assert.ok("returns" in setup);
  assert.deepEqual(setup.args, {});
  assert.deepEqual(
    setup.returns,
    v.object({
      enabled: v.boolean(),
      created: v.array(v.string()),
      preserved: v.array(v.string()),
    }),
  );
  const manifest = JSON.parse(
    await readFile(join(root, "packages/backend/package.json"), "utf8"),
  );
  assert.equal(manifest.scripts.dev, "convex dev --run billing:setup");
});

test("CI uses the deployed target, runs setup before upload and stops on setup failure", async () => {
  const workflow = await readFile(
    join(root, ".github/workflows/pipeline.yml"),
    "utf8",
  );
  const parsed = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
      ],
      { input: workflow, encoding: "utf8" },
    ),
  ) as {
    jobs: { web: { steps: Array<{ name?: string; run?: string }> } };
  };
  const deploy = parsed.jobs.web.steps.find(
    (step) => step.name === "Deploy",
  )?.run;
  assert.equal(typeof deploy, "string");
  assert.ok(deploy);
  const temp = await mkdtemp(join(tmpdir(), "billing-deploy-hook-"));
  try {
    await mkdir(join(temp, "packages/backend"), { recursive: true });
    await mkdir(join(temp, "bin"));
    // Record the actual shell command boundaries without running any tools/providers.
    await writeFile(
      join(temp, "bin/bun"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
case "$*" in *'convex run '*) exit "$SETUP_EXIT";; esac
`,
      { mode: 0o755 },
    );
    const callsFile = join(temp, "calls");
    for (const channel of ["production", "pr-42"]) {
      for (const setupExit of ["0", "1"]) {
        await writeFile(callsFile, "");
        const run = exec("bash", ["-e", "-c", deploy], {
          cwd: temp,
          env: {
            NODE_ENV: "test",
            PATH: `${join(temp, "bin")}:${process.env.PATH}`,
            TRUSTED: "true",
            CONVEX_DEPLOY_KEY: "fixture",
            CHANNEL: channel,
            CALLS: callsFile,
            SETUP_EXIT: setupExit,
          },
        });
        if (setupExit === "0") await run;
        else await assert.rejects(run);
        const calls = (await readFile(callsFile, "utf8")).trim().split("\n");
        assert.match(calls[0], /convex deploy --yes/);
        const target =
          channel === "production" ? "--prod" : "--preview-name pr-42";
        assert.equal(
          calls[1],
          `x --no-install convex run ${target} billing:setup {}`,
        );
        assert.equal(calls.length, setupExit === "0" ? 3 : 2);
        if (setupExit === "0")
          assert.ok(calls[2].includes(`static-hosting upload ${target}`));
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
