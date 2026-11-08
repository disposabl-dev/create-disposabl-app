import { telemetryBuildDefine } from "./telemetry-build";
import { name, version } from "./package.json";
const result = await Bun.build({
  entrypoints: ["index.ts"],
  outdir: "dist",
  target: "node",
  packages: "external",
  define:
    name === "@disposabl/cli"
      ? telemetryBuildDefine(version)
      : telemetryBuildDefine("0.0.0-development", {}),
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");

export {};
