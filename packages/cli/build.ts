const result = await Bun.build({
  entrypoints: ["index.ts"],
  outdir: "dist",
  target: "node",
  packages: "external",
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");

export {};
