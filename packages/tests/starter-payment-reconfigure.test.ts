import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { mkdtemp, realpath, symlink } from "node:fs/promises";
import { createOutputDirectory } from "./fixtures/starter-payment-reconfigure/output";

test("starter qualification confines new output to the real temporary tree", async () => {
  const parent = await mkdtemp("/tmp/starter-output-boundary-");
  const output = await createOutputDirectory(`${parent}/accepted`);
  assert.equal(output, `${await realpath(parent)}/accepted`);
  await assert.rejects(createOutputDirectory(`${parent}/accepted`));
  await assert.rejects(
    createOutputDirectory("/tmp/../starter-output-outside"),
    /within \/tmp/,
  );
  await symlink("/", `${parent}/escape`);
  await assert.rejects(
    createOutputDirectory(`${parent}/escape/starter-output-outside`),
    /within \/tmp/,
  );
  await assert.rejects(createOutputDirectory("relative-output"), /absolute/);
});

test(
  "offline starter mobile payment reconfiguration qualification",
  {
    skip: process.env.STARTER_PAYMENT_RECONFIGURE !== "1",
    timeout: 1_800_000,
  },
  () => {
    const work = process.env.STARTER_QUALIFICATION_DIR;
    const cache = process.env.STARTER_BUN_CACHE;
    if (!work || !cache)
      throw new Error(
        "Set STARTER_QUALIFICATION_DIR and STARTER_BUN_CACHE; see fixture README.",
      );
    execFileSync(
      "bun",
      [
        resolve(
          import.meta.dirname,
          "fixtures/starter-payment-reconfigure/run.ts",
        ),
      ],
      {
        stdio: "inherit",
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          STARTER_QUALIFICATION_DIR: work,
          STARTER_BUN_CACHE: cache,
        },
      },
    );
  },
);
