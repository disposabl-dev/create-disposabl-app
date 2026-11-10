import { copyFile, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Only an explicitly marked disposable archive copy may receive the test adapter.
const target = await realpath(process.argv[2] ?? "");
const temp = await realpath("/tmp");
if (!target.startsWith(`${temp}/disposabl-billing-local-`))
  throw new Error("Expected a disposable billing-local directory under /tmp.");
await readFile(resolve(target, ".billing-handoff-local-fixture"));
const handler = resolve(
  target,
  "packages/disposabl-kit/server/billing-handoff.ts",
);
let source = await readFile(handler, "utf8");
const replacements: Record<string, string> = {
  'import { paymentsEnabled } from "../features";':
    'const paymentsEnabled = true;\nconst fixtureEnv = { AUTUMN_SECRET_KEY: "fixture-only", BILLING_RETURN_URL: "https://fixture.invalid/pricing", MOBILE_WEB_CHECKOUT_ENABLED: "true", REVENUECAT_SYNC_ENABLED: "true", BILLING_IOS_RETURN_CHANNELS: "production,preview" };',
  "process.env.BILLING_IOS_RETURN_CHANNELS":
    "fixtureEnv.BILLING_IOS_RETURN_CHANNELS",
  "billingConfig(paymentsEnabled, process.env)":
    "billingConfig(paymentsEnabled, fixtureEnv)",
  "mobileWebCheckoutConfigured(paymentsEnabled, process.env)":
    "mobileWebCheckoutConfigured(paymentsEnabled, fixtureEnv)",
};
for (const [before, after] of Object.entries(replacements)) {
  if (source.split(before).length !== 2)
    throw new Error("Unexpected handoff adapter input.");
  source = source.replace(before, after);
}
await writeFile(handler, source);
await copyFile(
  resolve(import.meta.dir, "fixture.ts.txt"),
  resolve(target, "packages/backend/convex/fixtureBillingHandoff.ts"),
);
console.log(
  "Installed fixture-only configuration and expiry bridge into disposable copy.",
);

// Reuse the inert checkout adapter in the disposable copy.
const checkout = resolve(
  target,
  "packages/disposabl-kit/server/billing-functions.ts",
);
let checkoutSource = await readFile(checkout, "utf8");
const checkoutReplacements: Record<string, string> = {
  'import { paymentsEnabled } from "../features";':
    'import { paymentsEnabled } from "../features";\nimport { fixtureRequest, fixtureCheckoutUrl, fixtureContext } from "./billing-checkout-fixture";',
  "return billingContext(paymentsEnabled, process.env, () =>\n    getSessionUserId(ctx),\n  );":
    "return fixtureContext(true, () => getSessionUserId(ctx));",
  "await billingRequest(": "await fixtureRequest(ctx, ",
  "const url = checkoutUrl(result);":
    "const url = fixtureCheckoutUrl(checkoutUrl(result));",
};
for (const [before, after] of Object.entries(checkoutReplacements)) {
  const count = checkoutSource.split(before).length - 1;
  if (count !== (before === "await billingRequest(" ? 4 : 1))
    throw new Error(`Unexpected checkout adapter boundary: ${count}`);
  checkoutSource = checkoutSource.replaceAll(before, after);
}
await writeFile(checkout, checkoutSource);
const checkoutFixture = resolve(import.meta.dir, "../billing-checkout-browser");
await copyFile(
  resolve(checkoutFixture, "transport.ts.txt"),
  resolve(target, "packages/disposabl-kit/server/billing-checkout-fixture.ts"),
);
await copyFile(
  resolve(checkoutFixture, "bridge.ts.txt"),
  resolve(target, "packages/backend/convex/fixtureBillingCheckout.ts"),
);
const schemaPath = resolve(target, "packages/backend/convex/schema.ts");
let schema = await readFile(schemaPath, "utf8");
const anchor = "export default defineSchema({";
if (schema.split(anchor).length !== 2)
  throw new Error("Unexpected fixture schema");
schema = schema.replace(
  anchor,
  `${anchor}\n  fixtureCheckoutDispatches: defineTable({ userId: v.string(), planId: v.string(), feature: v.optional(v.string()), quantity: v.optional(v.number()) }).index("by_userId", ["userId"]),`,
);
await writeFile(schemaPath, schema);
