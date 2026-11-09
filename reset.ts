import { cp, lstat, readdir, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

// Run only in the generator's disposable staging copy, never the product repo.
const root = await realpath(import.meta.dir);
const marker = await readFile(join(root, ".disposabl-staging.json"), "utf8")
  .then(JSON.parse)
  .catch(() => {
    throw new Error(
      "Reset requires a generator staging copy; run the generator build.",
    );
  });
if (
  !marker ||
  typeof marker.source !== "string" ||
  typeof marker.directory !== "string" ||
  (await realpath(marker.directory)) !== root ||
  (await realpath(marker.source)) === root ||
  (await lstat(join(root, ".git")).catch(() => null))
)
  throw new Error(
    "Refusing to reset a working checkout or an invalid staging directory.",
  );

// Product-only proof harnesses must not enter generated apps. Keep the same
// paths in the symlink validation and removal inventories.
const productProofTests = [
  "packages/tests/ui-telemetry-policy.test.ts",
  "packages/tests/components/ui-telemetry-mobile.test.mjs",
  "packages/tests/components/ui-telemetry-web.test.mjs",
  "apps/web/src/telemetry.tsx",
  "apps/web/src/telemetry-policy.ts",
  "apps/web/src/telemetry-replay.ts",
  "apps/mobile/src/features/product-telemetry.tsx",
  "apps/mobile/src/features/telemetry-policy.ts",
  "packages/tests/compute-stop.test.ts",
  "packages/tests/auth-deletion-current.test.ts",
  "packages/tests/flows/billing-checkout-auth.e2e.ts",
  "packages/tests/fixtures/billing-checkout-browser",
  "packages/tests/flows/sdk-auth.e2e.ts",
  "packages/tests/helpers/sdk-auth",
  "packages/tests/fixtures/starter-payment-reconfigure",
  "packages/tests/starter-payment-reconfigure.test.ts",
  "packages/tests/flows/support-contact.e2e.ts",
  "packages/tests/fixtures/telemetry-http-convex",
  "packages/tests/telemetry-http-integration.test.ts",
  "packages/tests/fixtures/telemetry-link-convex",
  "packages/tests/telemetry-link-transactions.test.ts",
  "packages/tests/platform-error-telemetry.test.ts",
  "packages/tests/cli-first-execution.test.ts",
  "packages/tests/cli-version-lifecycle.test.ts",
  "packages/tests/web-action-policy.test.ts",
  "packages/tests/sdk-source-attribution.test.ts",
  "packages/tests/fixtures/posthog-replay-browser",
  "packages/tests/fixtures/telemetry-guard-convex",
  "packages/tests/telemetry-guard-transactions.test.ts",
  "packages/tests/telemetry-deletion-guard.test.ts",
  "packages/tests/flows/billing-handoff-auth.e2e.ts",
  "packages/tests/fixtures/billing-handoff-browser",
  "packages/tests/billing-handoff-local.test.ts",
  "packages/tests/fixtures/billing-handoff-local",
  "packages/tests/ios-save-password.test.ts",
  "packages/tests/helpers/ios-save-password.ts",
  "packages/tests/flows/account-deletion-receipt.e2e.ts",
  "packages/tests/legal-product-providers.test.ts",
  "packages/tests/fixtures/file-deletion-convex",
  "packages/tests/fixtures/ephemeral-deletion-convex",
  "packages/tests/ephemeral-deletion-transactions.test.ts",
  "packages/tests/fixtures/auth-identity-erasure-convex",
  "packages/tests/fixtures/agent-inert-convex",
  "packages/tests/fixtures/auth-erasure-convex",
  "packages/tests/mcp-deletion-product.test.ts",
  "packages/tests/fixtures/mcp-deletion-product-convex",
  "packages/tests/mobile-theme-identity.test.ts",
  "packages/tests/mcp-erasure-component.test.ts",
  "packages/tests/fixtures/mcp-erasure-convex",
  "packages/tests/mcp-deletion-guard.test.ts",
  "packages/tests/account-deletion-active.test.ts",
  "packages/tests/flows/account-deletion.e2e.ts",
  "packages/tests/account-deletion-stop.test.ts",
  "packages/tests/account-deletion-transactions.test.ts",
  "packages/tests/fixtures/account-deletion-convex",
  "packages/tests/flows/cli-oauth.e2e.ts",
  "packages/tests/helpers/cli-oauth-fixture.ts",
  "packages/tests/cli-oauth-build.test.ts",
  "packages/tests/flows/desktop-real.e2e.ts",
  "packages/tests/components/desktop-real.cjs",
  "packages/tests/billing-deletion.test.ts",
  "packages/tests/components/billing-deletion.test.mjs",
  "packages/tests/billing-handoff-transactions.test.ts",
  "packages/tests/fixtures/billing-handoff-convex",
  "packages/tests/architecture-transactions.test.ts",
  "packages/tests/fixtures/architecture-convex",
  "packages/tests/generator-architecture-setup.test.ts",
  "packages/tests/architecture-token.test.ts",
  "packages/tests/components/architecture-token.test.mjs",
  "packages/tests/mobile-architecture-settings.test.ts",
  "packages/tests/components/mobile-architecture-settings.test.mjs",
  "packages/tests/generator-packaging-proof.test.ts",
  "packages/tests/compute-provider-http.test.ts",
  "packages/tests/billing-web.config.ts",
  "packages/tests/fixtures/billing-web",
  "packages/tests/flows/billing-web-handoff.e2e.ts",
  "packages/tests/autumn-checkout-integration.test.ts",
  "packages/tests/fixtures/autumn-checkout",
  "packages/tests/native-inbox-transactions.test.ts",
  "packages/tests/fixtures/native-inbox-convex",
  "packages/tests/low-credit-email-integration.test.ts",
  "packages/tests/low-credit-elapsed.test.ts",
  "packages/tests/fixtures/low-credit-convex",
];

// Validate every required input before removing anything. Unrelated skill
// symlinks may be packaged, but reset must never read or write through a link.
const touched = [
  ...productProofTests,
  "packages/backend/convex/users/receipts.ts",
  "packages/backend/convex/users/authDeletion.ts",
  "packages/backend/convex/users/fileDeletion.ts",
  "packages/backend/convex/users/ephemeralDeletion.ts",
  "packages/backend/convex/users/localDeletion.ts",
  "packages/backend/convex",
  "packages/backend/generated",
  "packages/backend/package.json",
  "packages/backend/README.md",
  "packages/tests/README.md",
  "packages/sdk/src",
  "packages/cli",
  "packages/create-disposabl-app",
  "starter",
  ".github/workflows",
  "apps/web/src/router",
  "apps/web/package.json",
  "apps/mobile/src/app/index.tsx",
  "apps/mobile/package.json",
  "apps/mobile/app.json",
  "packages/disposabl-kit/package.json",
  "packages/disposabl-kit/legal/publisher.ts",
  "packages/disposabl-kit/client/components/account-deletion.tsx",
  "packages/tests/components/account-deletion.test.mjs",
  "packages/disposabl-kit/mobile/components/use-dictation.ts",
  "packages/tests/mobile-dictation.test.ts",
  "packages/tests/components/mobile-dictation.test.mjs",
  "packages/tests/mobile-attachments.test.ts",
  "packages/tests/mobile-attachment-lifecycle.test.ts",
  "packages/tests/components/mobile-attachment-lifecycle.test.mjs",
  "packages/tests/mobile-conversation-scroll.test.ts",
  "packages/tests/mobile-submission-policy.test.ts",
  "packages/tests/agent-attachments.test.ts",
  "packages/tests/agent-events.test.ts",
  "packages/tests/app-telemetry.test.ts",
  "packages/tests/installer-download.test.ts",
  "packages/tests/components/installer-download.test.mjs",
  "packages/tests/flows/installer-download.e2e.ts",
  "packages/tests/generator-service-origin.test.ts",
  "apps/mobile/src/app/_layout.tsx",
  "apps/mobile/src/app/settings.tsx",
  "apps/mobile/src/app/(authenticated)/apps",
  "apps/mobile/src/features/management",
  "apps/mobile/src/features/studio",
  "apps/mobile/src/app/(tabs)",
  "apps/mobile/src/app/compose.tsx",
  "apps/mobile/src/app/connections.tsx",
  "apps/mobile/src/app/example.tsx",
  "apps/mobile/src/app/guide-detail.tsx",
  "packages/tests/flows/mobile.e2e.ts",
  "packages/tests/flows/mobile-management.e2e.ts",
  "packages/tests/flows/mobile-chat.e2e.ts",
  "packages/tests/flows/connections-onboarding.e2e.ts",
  "packages/tests/connections-flow.test.ts",
  "packages/tests/configuration.test.ts",
  "packages/tests/agent-access.test.ts",
  "packages/tests/agent-bootstrap.test.ts",
  "packages/tests/agent-creation.test.ts",
  "packages/tests/agent-credits.test.ts",
  "packages/tests/low-credit-email.test.ts",
  "packages/tests/compute-windows.test.ts",
  "packages/tests/compute-transactions.test.ts",
  "packages/tests/fixtures/compute-convex",
  "packages/tests/fixtures/telemetry-convex",
  "packages/tests/telemetry-transactions.test.ts",
  "packages/tests/billing-transactions.test.ts",
  "packages/tests/fixtures/billing-convex",
  "packages/tests/cli-credit-errors.test.ts",
  "packages/tests/cli-telemetry.test.ts",
  "packages/tests/cli-release-recovery.test.ts",
  "packages/tests/autumn-connections.test.ts",
  "packages/tests/platform-connections.test.ts",
  "packages/tests/browser-handoff.test.ts",
  "packages/tests/helpers/browser-handoff.ts",
  "packages/tests/flows/browser-handoff.e2e.ts",
  "apps/web/site.json",
  "apps/web/public/og",
  "apps/web/src/components/connections",
  "apps/web/src/components/agent-onboarding",
  "packages/tests/flows/agent-onboarding.e2e.ts",
  "apps/web/src/router/pricing.tsx",
  "apps/web/src/router/build.tsx",
  "apps/web/src/router/stack.tsx",
  "apps/web/src/router/why-disposabl.tsx",
  "apps/web/src/routeTree.gen.ts",
  "packages/tests/flows/landing.e2e.ts",
  "packages/tests/flows/github-identity.e2e.ts",
  "bun.lock",
  "packages/tests/flows/agent.e2e.ts",
  "turbo.json",
];
const pending = [""];
while (pending.length) {
  const directory = pending.pop()!;
  for (const entry of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (
      !touched.some(
        (target) =>
          path === target ||
          path.startsWith(target + "/") ||
          target.startsWith(path + "/"),
      )
    )
      continue;
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected symlink in staging copy: ${path}`);
    if (entry.isDirectory()) pending.push(path);
  }
}
const json = async (path: string) =>
  JSON.parse(await readFile(join(root, path), "utf8"));
const backendPath = "packages/backend/package.json";
const backend = await json(backendPath);
const lock = Bun.JSONC.parse(
  await readFile(join(root, "bun.lock"), "utf8"),
) as {
  workspaces: Record<string, unknown>;
  packages: Record<string, unknown>;
};
const turbo = await json("turbo.json");
if (
  !backend ||
  !lock ||
  !turbo ||
  backend.name !== "@disposabl/backend" ||
  !backend.dependencies ||
  !backend.devDependencies ||
  !lock.workspaces?.["packages/backend"] ||
  !lock.packages ||
  !turbo.tasks
)
  throw new Error(
    "Starter reset inputs changed: expected backend, lockfile, and Turbo metadata.",
  );
const convex = join(root, "packages/backend/convex");
const keep = new Set([
  "_generated",
  "auth.ts",
  "authSetup.ts",
  "authEmail.ts",
  "emails.ts",
  "telemetry.ts",
  "auth.config.ts",
  "mcp.ts",
  "tsconfig.json",
  "files",
  "desktopUpdates",
  "desktopUpdates.ts",
]);
for (const entry of keep) await lstat(join(convex, entry));
await lstat(join(convex, "users"));
for (const path of [
  "README.md",
  "convex/schema.ts",
  "convex/http.ts",
  "convex/convex.config.ts",
  "convex/_generated/api.d.ts",
  "convex/_generated/server.d.ts",
  "convex/users/index.ts",
  "convex/users/internal.ts",
  "convex/users/validator.ts",
  "generated/platforms.ts",
  "generated/openapi.json",
  "generated/pages.json",
])
  await readFile(join(root, "starter/backend", path));

const starterCopies = [
  [
    "starter/client/account-deletion.tsx",
    "packages/disposabl-kit/client/components/account-deletion.tsx",
  ],
  [
    "starter/client/account-deletion-check.mjs",
    "packages/tests/components/account-deletion.test.mjs",
  ],
  ["starter/legal/publisher.ts", "packages/disposabl-kit/legal/publisher.ts"],
  ["starter/web/index.tsx", "apps/web/src/router/index.tsx"],
  ["starter/web/root.tsx", "apps/web/src/router/__root.tsx"],
  ["starter/cli/README.md", "packages/cli/README.md"],
  ["starter/cli/commands.ts", "packages/cli/commands.ts"],
  [
    "starter/web/dashboard.tsx",
    "apps/web/src/router/_authenticated/dashboard.tsx",
  ],
  ["starter/mobile/index.tsx", "apps/mobile/src/app/index.tsx"],
  ["starter/mobile/settings.tsx", "apps/mobile/src/app/settings.tsx"],
  ["starter/mobile/layout.tsx", "apps/mobile/src/app/_layout.tsx"],
  ["starter/mobile/mobile.e2e.ts", "packages/tests/flows/mobile.e2e.ts"],
] as const;
for (const [source] of starterCopies) await readFile(join(root, source));
const testsReadmePath = join(root, "packages/tests/README.md");
const testsReadme = await readFile(testsReadmePath, "utf8");
const agentFixtureParagraph =
  /^The provider-inert agent fixture in `fixtures\/agent-inert-convex\/`[^\n]*\n\n/m;
const passwordDiagnosticParagraph =
  /^For the product username flow only, `E2E_IOS_SAVE_PASSWORD_DIAGNOSTIC=1`[^\n]*\n\n/m;
const receiptFixtureParagraph =
  /^The opt-in `flows\/account-deletion-receipt.e2e.ts`[^\n]*\n\n/m;
if (!agentFixtureParagraph.test(testsReadme))
  throw new Error(
    "Starter reset inputs changed: agent fixture guidance missing.",
  );

// Generated apps start with their own origin and copy, never Disposabl's SEO.
await Bun.write(
  testsReadmePath,
  testsReadme
    .replace(agentFixtureParagraph, "")
    .replace(passwordDiagnosticParagraph, "")
    .replace(receiptFixtureParagraph, ""),
);
await Bun.write(
  join(root, "apps/web/site.json"),
  JSON.stringify(
    {
      name: "My App",
      title: "My App",
      description: "A clean starting point for your next application.",
      origin: "",
      backendOrigin: "",
      image: "",
      imageAlt: "",
      analytics: false,
    },
    null,
    2,
  ) + "\n",
);
await rm(join(root, "apps/web/public/og"), { recursive: true, force: true });

for (const entry of await readdir(convex)) {
  if (!keep.has(entry))
    await rm(join(convex, entry), { recursive: true, force: true });
}
for (const path of [
  ...productProofTests,
  "packages/backend/convex/users/receipts.ts",
  "packages/backend/convex/users/authDeletion.ts",
  "packages/backend/convex/users/fileDeletion.ts",
  "packages/backend/convex/users/ephemeralDeletion.ts",
  "packages/backend/convex/users/localDeletion.ts",
  "packages/tests/generator-service-origin.test.ts",
  "packages/tests/mobile-attachment-lifecycle.test.ts",
  "packages/tests/components/mobile-attachment-lifecycle.test.mjs",
  "packages/disposabl-kit/mobile/components/use-dictation.ts",
  "packages/tests/mobile-dictation.test.ts",
  "packages/tests/components/mobile-dictation.test.mjs",
  "packages/tests/mobile-attachments.test.ts",
  "packages/tests/mobile-conversation-scroll.test.ts",
  "packages/tests/mobile-submission-policy.test.ts",
  "packages/tests/agent-attachments.test.ts",
  "packages/tests/agent-events.test.ts",
  "packages/tests/app-telemetry.test.ts",
  "packages/tests/installer-download.test.ts",
  "packages/tests/components/installer-download.test.mjs",
  "packages/tests/flows/installer-download.e2e.ts",
  "packages/backend/generated",
  "packages/sdk/src/generated",
  "packages/create-disposabl-app",
  ".github/workflows/publish.yml",
  "apps/web/src/router/_authenticated/dashboard.connections.tsx",
  "apps/web/src/router/mobile-login.tsx",
  "apps/mobile/src/app/(authenticated)/apps",
  "apps/mobile/src/features/management",
  "apps/mobile/src/features/studio",
  "apps/mobile/src/app/(tabs)",
  "apps/mobile/src/app/compose.tsx",
  "apps/mobile/src/app/connections.tsx",
  "apps/mobile/src/app/example.tsx",
  "apps/mobile/src/app/guide-detail.tsx",
  "packages/tests/flows/mobile-management.e2e.ts",
  "packages/tests/flows/mobile-chat.e2e.ts",
  "packages/tests/flows/connections-onboarding.e2e.ts",
  "packages/tests/connections-flow.test.ts",
  "packages/tests/configuration.test.ts",
  "packages/tests/agent-access.test.ts",
  "packages/tests/agent-bootstrap.test.ts",
  "packages/tests/agent-creation.test.ts",
  "packages/tests/agent-credits.test.ts",
  "packages/tests/low-credit-email.test.ts",
  "packages/tests/compute-windows.test.ts",
  "packages/tests/compute-transactions.test.ts",
  "packages/tests/fixtures/compute-convex",
  "packages/tests/fixtures/telemetry-convex",
  "packages/tests/telemetry-transactions.test.ts",
  "packages/tests/billing-transactions.test.ts",
  "packages/tests/fixtures/billing-convex",
  "packages/tests/cli-credit-errors.test.ts",
  "packages/tests/cli-telemetry.test.ts",
  "packages/tests/cli-release-recovery.test.ts",
  "packages/tests/autumn-connections.test.ts",
  "packages/tests/platform-connections.test.ts",
  "packages/tests/browser-handoff.test.ts",
  "packages/tests/helpers/browser-handoff.ts",
  "packages/tests/flows/browser-handoff.e2e.ts",
  "apps/web/src/components/connections",
  "apps/web/src/components/agent-onboarding",
  "packages/tests/flows/agent-onboarding.e2e.ts",
  "apps/web/src/router/pricing.tsx",
  "apps/web/src/router/build.tsx",
  "apps/web/src/router/stack.tsx",
  "apps/web/src/router/why-disposabl.tsx",
  "apps/web/src/routeTree.gen.ts",
  "packages/tests/flows/landing.e2e.ts",
  "packages/tests/flows/agent.e2e.ts",
  "packages/tests/flows/github-identity.e2e.ts",
])
  await rm(join(root, path), { recursive: true, force: true });
await cp(join(root, "starter/backend"), join(root, "packages/backend"), {
  recursive: true,
});
for (const [source, destination] of starterCopies)
  await cp(join(root, source), join(root, destination));

for (const dependency of [
  "@convex-dev/workflow",
  "@convex-dev/agent",
  "@boatdev/convex",
  "@octokit/rest",
  "@vercel/connect",
  "libsodium-wrappers",
  "node-forge",
])
  delete backend.dependencies[dependency];
delete backend.devDependencies["@types/node-forge"];
for (const file of ["delete.ts", "preview.ts", "repository.ts"])
  await rm(join(root, "packages/cli", file));
delete lock.workspaces["packages/create-disposabl-app"];
delete lock.packages["create-disposabl-app"];
lock.workspaces["packages/backend"] = {
  name: backend.name,
  version: backend.version,
  dependencies: backend.dependencies,
  devDependencies: backend.devDependencies,
};
delete turbo.tasks["create-disposabl-app#build"];
// Chat capture and rendering belong to the Disposabl product.
const mobile = await json("apps/mobile/package.json");
const web = await json("apps/web/package.json");
delete web.dependencies["posthog-js"];
for (const name of [
  "posthog-react-native",
  "@posthog/react-native-plugin",
  "expo-application",
  "expo-localization",
])
  delete mobile.dependencies[name];
const mobileConfig = await json("apps/mobile/app.json");
// Store listing identities belong to Disposabl, not newly generated apps.
delete mobileConfig.expo.ios.bundleIdentifier;
delete mobileConfig.expo.android.package;
const kit = await json("packages/disposabl-kit/package.json");
const chatPackages = [
  "expo-image-picker",
  "expo-document-picker",
  "expo-file-system",
  "expo-speech-recognition",
  "react-native-enriched-markdown",
];
for (const name of chatPackages) delete mobile.dependencies[name];
delete kit.peerDependencies["expo-speech-recognition"];
delete kit.peerDependenciesMeta["expo-speech-recognition"];
mobileConfig.expo.plugins = mobileConfig.expo.plugins.filter(
  (plugin: string | [string, unknown]) =>
    !chatPackages.includes(typeof plugin === "string" ? plugin : plugin[0]),
);
for (const [path, value] of [
  ["apps/mobile/package.json", mobile],
  ["apps/web/package.json", web],
  ["apps/mobile/app.json", mobileConfig],
  ["packages/disposabl-kit/package.json", kit],
  [backendPath, backend],
  ["bun.lock", lock],
  ["turbo.json", turbo],
] as const)
  await Bun.write(join(root, path), JSON.stringify(value, null, 2) + "\n");
console.log("Reset staging copy to the starter.");
