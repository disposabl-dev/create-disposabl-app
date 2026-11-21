import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
const path = process.env.DISPOSABL_BUN_LINT;
const revision = path && spawnSync(path, ["--revision"], { encoding: "utf8" });
const fast =
  revision?.status === 0 &&
  revision.stdout.trim() === "1.4.6-canary.1+7bb427f3b"
    ? path
    : undefined;
const root = fileURLToPath(new URL("../../", import.meta.url));
const configs = {
  backend: {
    cwd: `${root}packages/backend`,
    eslint: [".", "--report-unused-disable-directives", "--max-warnings", "0"],
    bun: [
      ".",
      "--type-aware",
      "--report-unused-disable-directives",
      "--max-warnings=0",
    ],
  },
  web: { cwd: `${root}apps/web`, eslint: [], bun: [".", "--type-aware"] },
  mobile: {
    cwd: root,
    eslint: [
      "--config",
      "apps/mobile/eslint.config.js",
      "apps/mobile/src",
      "packages/disposabl-kit/mobile",
    ],
    bun: [
      "--config",
      "apps/mobile/eslint.config.js",
      "--disable-nested-config",
      "apps/mobile/src",
      "packages/disposabl-kit/mobile",
      "--type-aware",
    ],
  },
  kit: {
    cwd: `${root}packages/disposabl-kit`,
    eslint: [],
    bun: [".", "--type-aware"],
  },
  generator: {
    cwd: root,
    eslint: [
      "--config",
      "packages/create-disposabl-app/eslint.config.ts",
      "packages/create-disposabl-app",
      "reset.ts",
    ],
    bun: [
      "--config",
      "packages/create-disposabl-app/eslint.config.ts",
      "--disable-nested-config",
      "packages/create-disposabl-app",
      "reset.ts",
      "--type-aware",
    ],
  },
};
const selected = configs[mode];
if (!selected) throw new Error(`Unknown lint mode ${mode}`);
const result = spawnSync(
  fast || "eslint",
  fast ? ["lint", "--no-script", ...selected.bun] : selected.eslint,
  {
    cwd: selected.cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
