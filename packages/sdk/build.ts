await Bun.$`bun run generate`;
await Bun.$`tsc -p tsconfig.build.json`;
await Bun.write(
  "dist/verify-metadata.mjs",
  Bun.file("../disposabl-kit/server/release/verify-metadata.mjs"),
);

await Bun.write("LICENSE", Bun.file("../../LICENSE"));

export {};
