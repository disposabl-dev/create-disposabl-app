# End-to-end testing

This private workspace tests Disposabl and generated apps using [TesterArmy E2E](https://github.com/tester-army/e2e). Tests stay outside application bundles. The generator includes this workspace without adding setup questions. No E2E login, model, subscription, or API key is required.

```sh
bun run test                           # all configured targets
bun run test --target web,backend      # a scoped local or CI run
bun run test --target android          # an installed Android app
bun run test --target ios              # an installed iOS app
bun run e2e list                       # discovered flows and targets
bun run e2e guide                      # installed version's documentation
```

Use Node `^22.22.3 || >=24.8.0` and Bun. `bun run test` installs the pinned Chromium browser if missing, then runs E2E. It does not build native apps, provision a new backend, or authenticate a model provider. Prefer local builds and test runs; publishing a PR is not a prerequisite for testing.

## Targets and environment

`e2e.config.ts` reads root `disposabl.json`. Backend checks always apply. Web uses Chromium; selected Android/iOS platforms use the mobile engine. API uses an engine-free target only when `api` is selected. MCP, CLI, SDK, and desktop are not additional E2E engines; these starter flows do not claim to verify those clients.

Run `bun run dev` once to configure this app's managed development environment and synchronize backend functions. Tests read `packages/backend/.env.local` and `apps/web/.env.local`, with shell/CI variables taking precedence. Keep the backend synchronized while developing. The runner starts and stops an isolated Vite server on a free port. Set `E2E_WEB_URL` to test an already running app instead.

For an isolated preview or CI deployment, set `E2E_CONVEX_URL` and `E2E_CONVEX_SITE_URL`. Otherwise the checks use `CONVEX_URL` and `CONVEX_SITE_URL`. Use the backend for the exact source revision under test. A passing check against an old deployment does not verify changed backend code.

The initial flows check the public web page, the dashboard's authentication boundary, an anonymous backend auth query, the API contract when enabled, and the mobile home screen. They do not create users or modify data. Add product-specific flows here as behavior changes, including login and saved-state checks using dedicated test users. Keep required flows deterministic; an agent can write and debug tests without adding model calls to their execution.

## Mobile

Use a development build, not Expo Go. From the repository root:

```sh
bun run --cwd apps/mobile ios          # macOS/Xcode; builds and installs locally
bun run --cwd apps/mobile android      # Android SDK; builds and installs locally
```

Debug builds need Metro running with the current source. A release build embeds JavaScript and must be rebuilt after changes. Configure the app's backend URLs before building. Missing SDKs, devices, or installed apps are setup failures, not passing tests.

The config evaluates `apps/mobile/app.config.js` to use the same bundle IDs and channel as the build. Match `DISPOSABL_MOBILE_CHANNEL` to the installed app. Override with `E2E_IOS_APP_ID` or `E2E_ANDROID_APP_ID` when testing a different artifact. Set `E2E_IOS_DEVICE` to a simulator name/UDID or `E2E_ANDROID_DEVICE` to an emulator serial to reserve a specific device. Keep each device under one owner's control.

## CI

The same commands work in CI without model credentials. On Linux, install Chromium's system dependencies with `bun run --cwd packages/tests setup:browser`. Provision an isolated backend and deploy the current functions before testing. Set its URLs, then run `bun run test --target web,backend` and include `,api` when `disposabl.json` enables it.

Run Android separately on a runner with an emulator and iOS on macOS with Xcode and a simulator. Build/install the test artifact before its E2E run. Gate publication on the required target results; native E2E cannot run before an app exists to install. This setup does not replace or automatically gate the repository's existing deployment workflows.

Upload `packages/tests/.e2e/report.json`, `junit.xml`, and `results/` even after failure. Reports and screenshots can contain app data, so keep them out of source control. A scoped run proves only the named targets, not the entire app.

## Telemetry and optional AI

Both `bun run test` and `bun run e2e ...` set `E2E_TELEMETRY_DISABLED=1`. Keep using those wrappers: directly invoking the upstream binary bypasses that setting. No PostHog reporter is installed, and app analytics is production-only. A future Disposabl telemetry preference will control whether testing metrics are sent centrally.

Upstream telemetry otherwise sends command/engine/runtime versions, environment categories, durations, test counts, error codes, and AI/cache usage to the maintainers' PostHog project. It excludes test titles, source, URLs, screenshots, prompts, credentials, and error messages. See [the event inventory](https://github.com/tester-army/e2e/blob/main/docs/telemetry.mdx) and [transport source](https://github.com/tester-army/e2e/blob/main/packages/e2e/src/telemetry/posthog.ts).

AI is optional. To add it later, read `bun run e2e guide setup` and configure a provider or the upstream Codex/Claude Code ACP adapter. Keep model-backed flows separate from the required deterministic suite; an AI key appearing in the environment must not silently change the build gate or start spending.
