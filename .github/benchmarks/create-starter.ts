import { resolve } from "node:path";
import { createApp } from "../../packages/create-disposabl-app/scaffold";
import {
  selectFeatures,
  selectPlatforms,
} from "../../packages/create-disposabl-app/options";
await createApp(
  resolve("packages/create-disposabl-app/dist/templates/default"),
  process.argv[2],
  "lint-benchmark",
  {
    version: "test",
    platforms: selectPlatforms(
      "web,android,ios,macos,windows,linux,api,mcp,cli,typescript-sdk",
    ),
    features: selectFeatures("authentication,payments,analytics,docs"),
  },
);
