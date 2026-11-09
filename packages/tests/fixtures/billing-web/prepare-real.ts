import { readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = await realpath(process.argv[2] ?? "");
const temp = await realpath("/tmp");
if (!target.startsWith(`${temp}/disposabl-billing-local-`))
  throw new Error("Expected disposable fixture source");
await readFile(resolve(target, ".billing-handoff-local-fixture"));
const configPath = resolve(target, "disposabl.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
if (!config.features.includes("payments")) config.features.push("payments");
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
const billingPath = resolve(target, "packages/backend/convex/billing.ts");
let billing = await readFile(billingPath, "utf8");
for (const [before, after] of [
  [
    "export const checkout = createCheckout(requireBillingEligibility);",
    "export const checkout = fixtureCheckout;",
  ],
  [
    "export const snapshot = createSnapshot(requireBillingEligibility);",
    "export const snapshot = fixtureSnapshot;",
  ],
]) {
  if (billing.split(before).length !== 2)
    throw new Error("Unexpected billing adapter input");
  billing = billing.replace(before, after);
}
billing =
  'import { fixtureCheckout, fixtureSnapshot } from "./fixtureBillingActions";\n' +
  billing;
await writeFile(billingPath, billing);
await writeFile(
  resolve(target, "packages/backend/convex/fixtureBillingActions.ts"),
  `
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
export const fixtureSnapshot = action({ args: {}, handler: async (ctx) => {
  const customerId = await getAuthUserId(ctx);
  if (!customerId) throw Error("Authentication required");
  return { balance: 0, hasMonthlyPlan: false, checkoutNeedsReview: false, customerId };
} });
export const fixtureCheckout = action({ args: { purchase: v.union(v.literal("topup"), v.literal("monthly")), requestId: v.string() }, handler: async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw Error("Authentication required");
  return { url: null };
} });
`,
);
console.log(
  "Enabled disposable web payment UI with authenticated inert checkout and snapshot.",
);
