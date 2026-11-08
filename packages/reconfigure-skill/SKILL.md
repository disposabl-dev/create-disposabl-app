---
name: disposabl-reconfigure
description: Update an existing Disposabl app's code when adding or removing features or platforms in disposabl.json, preserving customizations. Does not provision providers or publish the app.
---

# Change app features and platforms

Use this skill in the existing generated app, including an app already published. Keep its app ID, native identities, backend URLs, data, and custom code.

Read `disposabl.json`, the Git diff, and the affected workspace instructions. Record the current selections and the user's intended complete selections. `--features` and `--platforms` replace their respective lists; omit a flag to keep that list. Dependencies are resolved by the generator, including Authentication for Payments and Analytics, API for CLI/SDK, and Web for every app.

`--android-architectures` replaces the Android ABI list. The default is `arm64-v8a,x86_64`; `armeabi-v7a` and `x86` are available when needed. A change requires a compatible native build and produces one APK containing the selected ABIs.

## Apply code changes

Use the generator version recorded in `disposabl.json`, not `latest`. From the parent directory, run the following with the actual version, directory, and complete desired lists:

```sh
npx create-disposabl-app@<version> <app-directory> --reconfigure-only --platforms web,android --features authentication,payments --skip-install --json
```

This mode changes local files only. It does not log in, provision services, write secrets, commit, or deploy. Run `bun install` in the app afterward to update dependencies and the lockfile, then review the diff.

The generator needs the prior selections in `disposabl.json` to calculate which files to restore. If the lists were already edited, compare with the known working revision. Preserve the desired lists, restore only the prior selection fields, and run the command with the desired lists. If the prior selections cannot be established, explain that missing baseline before changing files. Never reset the whole configuration or discard unrelated edits.

Reconfiguration preserves customized files and rejects conflicting starter changes. Resolve each conflict by combining the user's implementation with the necessary feature integration. Do not replace customized files with template copies just to make the command succeed. A version mismatch requires the matching generator; upgrading templates is separate work.

Disabling a platform keeps its source so it can be restored later. Feature flags control routes and runtime behavior. Disabling Payments removes unchanged native billing files and SDK dependencies; customized billing files require deliberate reconciliation. Do not delete provider resources, stored data, customer subscriptions, or credentials. Existing subscriptions need a management/cancellation path even when new purchases are disabled.

## Wire and verify

Trace the added or removed capability through routes, imports, navigation, feature guards, native config, dependencies, and tests. Preserve the app's design. For mobile styling, use NativeWind classes and existing tokens.

For Payments, read `packages/disposabl-kit/PAYMENTS.md` and the editable `payments/config.ts`. Non-mobile checkout uses Autumn. Mobile also requires RevenueCat configuration and native products; adding source cannot configure store accounts or prove purchases work. Keep provider setup as a separate, explicit next step. Never copy another app's keys or invent a credit grant to bypass setup.

Read `packages/tests/README.md`. Run the affected typechecks, lint, builds, and behavior flows against the app's development or isolated backend, with telemetry disabled. Check enabled behavior and disabled routes, including direct links. Native dependency changes require rebuilding the client before device verification. Missing credentials or devices are verification limits, not passing checks.

Report the changed selections and files, checks that passed or failed, and remaining provider or release steps. Leave publishing to the app's normal delivery workflow.
