// Create local-only copies of the actual handlers with fixture config substituted.
// Handler bodies are unchanged; no provider calls or production env changes occur.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
const here = import.meta.dirname;
const source = resolve(
  here,
  "../../../disposabl-kit/server/billing-handoff.ts",
);
const generated = resolve(here, "generated");
await mkdir(generated, { recursive: true });
let original = await readFile(source, "utf8");
for (const [from, target] of Object.entries({
  "../../backend/convex/_generated/api": "../../backend/convex/_generated/api",
  "../../backend/convex/_generated/server":
    "../../backend/convex/_generated/server",
  "../../../package.json": "../../../package.json",
  "./billing": "./billing",
  "./browser-session": "./browser-session",
})) {
  const path = relative(generated, resolve(dirname(source), target));
  const rewritten = path.startsWith(".") ? path : `./${path}`;
  const literal = `"${from}"`;
  if (!original.includes(literal))
    throw new Error(`Missing source import ${from}`);
  original = original.replace(literal, JSON.stringify(rewritten));
}
const feature = 'import { paymentsEnabled } from "../features";';
if (
  !original.includes(feature) ||
  !original.includes("process.env.BILLING_IOS_RETURN_CHANNELS")
)
  throw new Error("Unexpected handoff source");
for (const [mode, enabled, channels] of [
  ["on", true, "production,preview"],
  ["removed", true, ""],
  ["off", false, "production,preview"],
] as const) {
  const env = {
    AUTUMN_SECRET_KEY: "fixture-only",
    BILLING_RETURN_URL: "https://fixture.invalid/pricing",
    MOBILE_WEB_CHECKOUT_ENABLED: "true",
    REVENUECAT_SYNC_ENABLED: "true",
    BILLING_IOS_RETURN_CHANNELS: channels,
  };
  const content = original
    .replace(
      feature,
      `const paymentsEnabled = ${enabled};\nconst fixtureEnv = ${JSON.stringify(env)};`,
    )
    .replaceAll("process.env", "fixtureEnv")
    .replace('"billingHandoff:cleanup"', '"billingHandoff:cleanupFixture"');
  await writeFile(resolve(generated, `${mode}.ts`), content);
}
