import { readFile, realpath, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

const target = await realpath(process.argv[2] ?? "");
const temp = await realpath("/tmp");
if (!target.startsWith(`${temp}/disposabl-checkout-browser-`))
  throw new Error("Expected a disposable checkout fixture under /tmp");
await readFile(join(target, ".checkout-fixture"));
const configPath = join(target, "disposabl.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
if (!config.features.includes("payments")) config.features.push("payments");
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
const handler = join(
  target,
  "packages/disposabl-kit/server/billing-functions.ts",
);
let source = await readFile(handler, "utf8");
const replacements: Record<string, string> = {
  'import { paymentsEnabled } from "../features";': `import { paymentsEnabled } from "../features";\nimport { fixtureRequest, fixtureCheckoutUrl, fixtureContext } from "./billing-checkout-fixture";`,
  "return billingContext(paymentsEnabled, process.env, () =>\n    getSessionUserId(ctx),\n  );":
    "return fixtureContext(paymentsEnabled, () => getSessionUserId(ctx));",
  "await billingRequest(": "await fixtureRequest(ctx, ",
  "const url = checkoutUrl(result);":
    "const url = fixtureCheckoutUrl(checkoutUrl(result));",
};
for (const [before, after] of Object.entries(replacements)) {
  const count = source.split(before).length - 1;
  if (count !== (before === "await billingRequest(" ? 4 : 1))
    throw new Error(`Unexpected adapter boundary: ${count}`);
  source = source.replaceAll(before, after);
}
await writeFile(handler, source);
await copyFile(
  join(import.meta.dir, "transport.ts.txt"),
  join(target, "packages/disposabl-kit/server/billing-checkout-fixture.ts"),
);
await copyFile(
  join(import.meta.dir, "bridge.ts.txt"),
  join(target, "packages/backend/convex/fixtureBillingCheckout.ts"),
);
const schemaPath = join(target, "packages/backend/convex/schema.ts");
let schema = await readFile(schemaPath, "utf8");
const anchor = "export default defineSchema({";
if (schema.split(anchor).length !== 2) throw new Error("Unexpected schema");
schema = schema.replace(
  anchor,
  `${anchor}\n  fixtureCheckoutDispatches: defineTable({ userId: v.string(), planId: v.string(), feature: v.optional(v.string()), quantity: v.optional(v.number()) }).index("by_userId", ["userId"]),`,
);
await writeFile(schemaPath, schema);
