import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";
export default {
  tests: ["flows/billing-web*.e2e.ts"],
  targets: [
    { name: "web", engine: web(), app: { url: "http://127.0.0.1:3450" } },
  ],
  workers: 1,
  reporters: ["list"],
} satisfies E2EConfig;
