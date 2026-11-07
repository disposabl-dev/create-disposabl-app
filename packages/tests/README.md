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

The repository's agent fixture flow (`flows/agent.e2e.ts`) creates test users, an app, and component history to verify ownership, pagination, and worker state without calling Boat. It requires `E2E_CONVEX_ADMIN_KEY` and explicitly skips when the key is absent; admin fixture calls are restricted to a loopback backend. Use only a disposable local deployment and keep the key out of source control and logs. Run through the `bun run e2e` or `bun run test` wrappers so E2E telemetry stays disabled.

The storage fallback flow (`flows/files.e2e.ts`) uses the same loopback/admin restriction to confirm R2 is not configured before uploading. It checks downloaded bytes, anonymous and cross-user rejection, and owner deletion, removing only its own new file. It makes no R2 requests and skips when R2 is fully configured.

The connections browser flow additionally exercises invalid Autumn key submission when `E2E_CONNECTIONS_ENABLED=1`. Set a temporary `CONNECTIONS_ENCRYPTION_KEY` on the isolated backend for that run; the invalid input is rejected before any Autumn request. Restore the backend setting afterward.

## Email provider verification

`bun run e2e run email-delivery.e2e.ts --target backend --retries 0` tests signup, email verification, a new login, and the verified account. It requires an isolated loopback backend configured with `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, plus `E2E_RESEND_API_KEY` for reading the test message. This explicit provider test sends to a unique `delivered+…@resend.dev` address and polls Resend for that message and consumes one email from the sending quota. It never sends to a person. It skips when the test credential is absent. Keep credentials in the process environment and restore the backend configuration after this run before running username-based fixtures.

## Mobile

Use a development build, not Expo Go. From the repository root:

```sh
bun run --cwd apps/mobile ios          # macOS/Xcode; builds and installs locally
bun run --cwd apps/mobile android      # Android SDK; builds and installs locally
```

Debug builds need Metro running with the current source. A release build embeds JavaScript and must be rebuilt after changes. Configure the app's backend URLs before building. Missing SDKs, devices, or installed apps are setup failures, not passing tests.

The config evaluates `apps/mobile/app.config.js` to use the same bundle IDs and channel as the build. Match `DISPOSABL_MOBILE_CHANNEL` to the installed app. Override with `E2E_IOS_APP_ID` or `E2E_ANDROID_APP_ID` when testing a different artifact. Set `E2E_IOS_DEVICE` to a simulator name/UDID or `E2E_ANDROID_DEVICE` to an emulator serial to reserve a specific device. Keep each device under one owner's control.

For a development client with several Metro servers running, set `E2E_MOBILE_DEV_URL` to this app's Metro URL and `E2E_MOBILE_DEV_SCHEME` to its unique installed URL scheme. The mobile flows explicitly connect after launch and restart. This prevents accidentally testing another server or backend. Release builds omit both variables.

When supplying an isolated backend through Metro's shell environment, also set `EXPO_NO_DOTENV=1` and `EXPO_PUBLIC_E2E=true`. The Metro configuration excludes dotenv files in this mode: SDK 58's development environment module otherwise reloads `.env.local` after shell values. Set both `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL` to the test backend, using the emulator's reachable host address. The test runner's `E2E_CONVEX_URL` and `E2E_CONVEX_SITE_URL` must address that same deployment from the host.

## CI

The same commands work in CI without model credentials. On Linux, install Chromium's system dependencies with `bun run --cwd packages/tests setup:browser`. Provision an isolated backend and deploy the current functions before testing. Set its URLs, then run `bun run test --target web,backend` and include `,api` when `disposabl.json` enables it.

Run Android separately on a runner with an emulator and iOS on macOS with Xcode and a simulator. Build/install the test artifact before its E2E run. Gate publication on the required target results; native E2E cannot run before an app exists to install. This setup does not replace or automatically gate the repository's existing deployment workflows.

Upload `packages/tests/.e2e/report.json`, `junit.xml`, and `results/` even after failure. Reports and screenshots can contain app data, so keep them out of source control. A scoped run proves only the named targets, not the entire app.

## Telemetry and optional AI

Both `bun run test` and `bun run e2e ...` set `E2E_TELEMETRY_DISABLED=1`. Keep using those wrappers: directly invoking the upstream binary bypasses that setting. No PostHog reporter is installed, and app analytics is production-only. A future Disposabl telemetry preference will control whether testing metrics are sent centrally.

Upstream telemetry otherwise sends command/engine/runtime versions, environment categories, durations, test counts, error codes, and AI/cache usage to the maintainers' PostHog project. It excludes test titles, source, URLs, screenshots, prompts, credentials, and error messages. See [the event inventory](https://github.com/tester-army/e2e/blob/main/docs/telemetry.mdx) and [transport source](https://github.com/tester-army/e2e/blob/main/packages/e2e/src/telemetry/posthog.ts).

AI is optional. To add it later, read `bun run e2e guide setup` and configure a provider or the upstream Codex/Claude Code ACP adapter. Keep model-backed flows separate from the required deterministic suite; an AI key appearing in the environment must not silently change the build gate or start spending.
