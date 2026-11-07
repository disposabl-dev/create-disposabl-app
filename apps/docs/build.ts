import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import config from "../../disposabl.json";

if ((config.features as readonly string[]).includes("docs")) {
  const result = spawnSync("fumapress", ["build"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
rmSync("dist", { recursive: true, force: true });
