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

The provider-inert agent fixture in `fixtures/agent-inert-convex/` exercises queued messages, ownership, history, access-token rotation, and CLI status using real product handlers without Boat credentials. Its isolated adapter substitutes the scheduled worker with a no-op; see its README. The flow accepts matched 3530/3531 or 3540/3541 loopback pairs with the required provider and telemetry preflight. It does not test real provider dispatch or remote stop.

The opt-in account-deletion receipt flow runs through `python3 packages/tests/fixtures/billing-handoff-browser/run.py receipt` with `CONVEX_LOCAL_BINARY` and `PLAYWRIGHT_BROWSERS_PATH` set as documented in that fixture's README. It uses a fresh owned 3530/3531 backend and a synthetic account, downloads a private receipt, then clears that account's authentication. Retained logs, screenshots, database and receipt may contain synthetic session data; keep them private. This does not prove whole-account deletion.

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

TesterArmy claims the device for its own session. Run automated flows before opening a Device panel or manual agent-device session, or release only your own manual session first. A manual session can block the test runner even when the same agent owns both. After the runner releases its claim, open the device for visual inspection. Never close another owner's session or take over an occupied device to make a test proceed.

For the product username flow only, `E2E_IOS_SAVE_PASSWORD_DIAGNOSTIC=1` opts into a single post-Go raw alert inspection before the usual assertions. It dismisses only if the observed English title is exactly `Save Password?` and the two buttons are exactly `Not Now` and `Save`; unknown, absent, or unreadable alerts fail the diagnostic. Inspection and dismissal are separate calls and cannot guarantee the surface does not change between them. The pinned TesterArmy client includes agent-device 0.21.36, whose installed runner has an `SFDialogView` path, but a prepared or reused runner may differ: verify the actual runner provenance before using this experiment. The raw calls are unstable, absent from E2E trace steps, and do not wait for settling. Use an exclusively owned local iOS Simulator, treat output as private, and do not pass credentials to raw calls. The ordinary login assertions remain required. This diagnostic has not been verified against the save sheet.

For a development client with several Metro servers running, set `E2E_MOBILE_DEV_URL` to this app's Metro URL and `E2E_MOBILE_DEV_SCHEME` to its unique installed URL scheme. The mobile flows explicitly connect after launch and restart. This prevents accidentally testing another server or backend. Release builds omit both variables.

Verify that only the intended installed app registers that scheme. A scheme matching the bundle ID can still collide when another test build copied it. On iOS, inspect `CFBundleURLTypes` in the installed apps' `Info.plist` files. If the driver reports that the target is not running while Metro serves a bundle or shows a missing-native-module error, identify the receiving app before changing dependencies. Select a scheme registered only to the intended client, or rebuild it with a unique scheme; preserve other apps and their data.

When supplying an isolated backend through Metro's shell environment, also set `EXPO_NO_DOTENV=1` and `EXPO_PUBLIC_E2E=true`. The Metro configuration excludes dotenv files in this mode: SDK 58's development environment module otherwise reloads `.env.local` after shell values. Set both `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL` to the test backend, using the emulator's reachable host address. The test runner's `E2E_CONVEX_URL` and `E2E_CONVEX_SITE_URL` must address that same deployment from the host.

## CI

Desktop navigation can be checked locally with `E2E_DESKTOP_NAVIGATION=1 bun run e2e run desktop-navigation.e2e.ts --target backend --retries 0`. This opt-in flow requires the desktop workspace, installed Electron binary, and a graphical session. It launches an isolated Electron instance against local fixture pages, intercepts browser launches, and checks the application's navigation and OAuth callback handling. No backend or provider calls are made. This is separate from real Google sign-in, installed protocol registration, and two-version native update verification.

The same commands work in CI without model credentials. On Linux, install Chromium's system dependencies with `bun run --cwd packages/tests setup:browser`. Provision an isolated backend and deploy the current functions before testing. Set its URLs, then run `bun run test --target web,backend` and include `,api` when `disposabl.json` enables it.

Run Android separately on a runner with an emulator and iOS on macOS with Xcode and a simulator. Build/install the test artifact before its E2E run. Gate publication on the required target results; native E2E cannot run before an app exists to install. This setup does not replace or automatically gate the repository's existing deployment workflows.

Upload `packages/tests/.e2e/report.json`, `junit.xml`, and `results/` even after failure. Reports and screenshots can contain app data, so keep them out of source control. A scoped run proves only the named targets, not the entire app.

## Telemetry and optional AI

Both `bun run test` and `bun run e2e ...` set `E2E_TELEMETRY_DISABLED=1`. Keep using those wrappers: directly invoking the upstream binary bypasses that setting. No PostHog reporter is installed, and app analytics is production-only. A future Disposabl telemetry preference will control whether testing metrics are sent centrally.

Upstream telemetry otherwise sends command/engine/runtime versions, environment categories, durations, test counts, error codes, and AI/cache usage to the maintainers' PostHog project. It excludes test titles, source, URLs, screenshots, prompts, credentials, and error messages. See [the event inventory](https://github.com/tester-army/e2e/blob/main/docs/telemetry.mdx) and [transport source](https://github.com/tester-army/e2e/blob/main/packages/e2e/src/telemetry/posthog.ts).

AI is optional. To add it later, read `bun run e2e guide setup` and configure a provider or the upstream Codex/Claude Code ACP adapter. Keep model-backed flows separate from the required deterministic suite; an AI key appearing in the environment must not silently change the build gate or start spending.

<!-- mobile-simulator-preflight:start -->

### Isolated iOS simulator acceptance preflight

For a disposable E2E-only simulator build, select a unique preview bundle ID and URL scheme, set `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_E2E=true`, `E2E_TELEMETRY_DISABLED=1`, and the two `EXPO_PUBLIC_CONVEX_*` URLs to the assigned `http://127.0.0.1:<port>` backend. Disable updates and payments in the fixture. Use an allowlisted environment with Expo telemetry disabled and no provider credentials. Keep the original app and its data. On macOS, create a disposable simulator-only entitlements plist with `application-identifier` and the sole `keychain-access-groups` entry both set to `local.<unique-preview-bundle-id>`. After Expo prebuild and pod installation, from `apps/mobile` the tested Xcode invocation is:

```sh
xcodebuild -workspace ios/Disposabl.xcworkspace -scheme Disposabl -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$SIMULATOR_DERIVED" -jobs 2 CODE_SIGNING_ALLOWED=YES \
  CODE_SIGNING_REQUIRED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= \
  CODE_SIGN_ENTITLEMENTS="$SIMULATOR_ENTITLEMENTS" build
```

This is a local simulator fixture, not a production signing recipe. Capture a build record JSON with exactly `source_revision`, `js_sha256`, `app_id`, `backend`, `site`, and Boolean `e2e`, `telemetry_disabled`, `updates_disabled`, `payments_disabled`. The SHA is of the finished `main.jsbundle`; record the actual build inputs, not intended ones. Run:

```sh
python3 packages/tests/helpers/mobile-simulator/preflight.py \
  --app "$SIMULATOR_APP" --record "$BUILD_RECORD" --source "$SOURCE_CHECKOUT" \
  --app-id "$PREVIEW_APP_ID" --group "local.$PREVIEW_APP_ID" \
  --backend "$EXPO_PUBLIC_CONVEX_URL" --site "$EXPO_PUBLIC_CONVEX_SITE_URL" \
  --hermesc "$SOURCE_CHECKOUT/apps/mobile/ios/Pods/hermes-engine/destroot/bin/hermesc"
```

Preflight checks ARM64 simulator platform, linked simulator entitlement sections and identities, embedded URLs, disabled updates, JS hash and matching record. A record is an operator attestation: it cannot independently prove source provenance, E2E flags, payments or telemetry behavior. Retain the build logs and confirm the checkout and build inputs separately. A passing preflight does not establish installation or behavior. Xcode's separate codesign entitlement dictionary is not a substitute for inspecting the simulated Mach-O entitlement sections.
<!-- mobile-simulator-preflight:end -->
