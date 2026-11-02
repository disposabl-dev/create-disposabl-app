import { defineConfig } from "@hey-api/openapi-ts";
export default defineConfig({
  input: "../backend/generated/openapi.json",
  output: { path: "src/generated", module: { extension: ".js" } },
  plugins: [
    "@hey-api/typescript",
    "@hey-api/sdk",
    { name: "@hey-api/client-fetch", runtimeConfigPath: "./src/config.js" },
  ],
});
