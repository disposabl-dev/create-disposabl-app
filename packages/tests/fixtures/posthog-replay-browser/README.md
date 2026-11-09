# Isolated web replay privacy probe

Run from the repository root with the installed `posthog-js` and cached headless Chromium. The OS sandbox blocks outbound network and Playwright intercepts every page request; fixture and PostHog origins are synthetic. No backend or provider is used. The test enables SDK capture only inside its synthetic browser page, not in the application E2E configuration.

```sh
env -i HOME=/tmp PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/v24.21.0/bin:/usr/bin:/bin" \
  REPLAY_CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" \
  DO_NOT_TRACK=1 E2E_TELEMETRY_DISABLED=1 \
  /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote unix-socket))' \
  bun packages/tests/fixtures/posthog-replay-browser/probe.mjs
```

The probe decompresses actual SDK replay snapshots and checks synthetic text, input, attribute, image URL, private subtree, path, query and hash markers. It exercises a private initial document, private route changes, three synthetic identities, stop/opt-out, and a fresh instance after opt-out/reset. It intercepts configuration and ingestion locally; this is not proof of PostHog delivery, production configuration, desktop behavior, or the actual application DOM and navigation. **Production replay stays disabled until the application itself is qualified.** Screen recordings and crash capture on native remain separate work.

For the production-built app fixture, commit the candidate, ensure cached web dependencies and `apps/docs/dist` exist, then run:

```sh
REPLAY_CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell" \
  python3 packages/tests/fixtures/posthog-replay-browser/run-actual.py
```

The runner enters an outbound-denying sandbox, snapshots the clean commit, builds the unmodified app and checks its initial HTML, then builds a second copy with fixture-only auth and Convex aliases. It disables crawler discovery in that second build to avoid fixture redirects. Playwright intercepts every request and injects the recorder only in the test page. The test compares application errors against the same inert-auth build without replay, and reports both. Synthetic authenticated UI is not a real session, backend, chat or file runtime. It does not qualify live delivery or authorize production replay.

For the current product adapter and the SDK stop diagnostic, run each command below with the same environment and sandbox prefix used by the first command above:

```sh
bun packages/tests/fixtures/posthog-replay-browser/adapter-lifecycle.mjs
bun packages/tests/fixtures/posthog-replay-browser/adapter-lifecycle.mjs desktop
bun packages/tests/fixtures/posthog-replay-browser/sdk-stop.mjs
```

`adapter-lifecycle.mjs` bundles the actual product adapter and installed PostHog SDK. The desktop mode supplies the exact authenticated preload bridge shape; the default mode supplies no bridge. Bootstrap and ingestion are intercepted; it checks source, canonical views, duplicate view calls, account changes, rapid routes, opt-out, re-enablement and expiry while replay remains disabled. It does not run Electron or prove website-level mounting. Chromium's automation indicators are overridden inside this fixture because the SDK otherwise discards automation traffic. The real adapter makes no remote-configuration request in this mode, so this test does not claim a hostile remote configuration was applied.

For the actual website telemetry mount, run `REPLAY_TELEMETRY_MOUNT=1 REPLAY_CHROMIUM=... python3 packages/tests/fixtures/posthog-replay-browser/run-actual.py`. This uses the same outbound-denying sandbox and fresh committed snapshot. In the disposable build only, it enables the production telemetry gate while keeping the environment telemetry-disabled; auth, API key handlers, clipboard and all network responses are inert fixtures. It mounts the real website provider and adapter in separate web and authenticated-desktop bridge contexts, checks one pageview per dashboard navigation and no generic transport request, and exercises actual API-key submit, copy and revoke controls, opt-out and expiry. The expiry test advances only the page's Date.now; it is not an elapsed-time test. It does not launch Electron, create a real key or contact PostHog.

With `REPLAY_BILLING_MOUNT=1` in place of `REPLAY_TELEMETRY_MOUNT=1`, the billing mount fixture aliases payments on only in its disposable build and uses synthetic authentication and inert billing actions. It activates the actual pricing buttons with Enter, checks one fixed attempt per handler and verifies GeoIP, opt-out and lease controls. Checkout returns no URL and the portal returns a synthetic error: no provider navigation, purchase or payment is exercised. The build uses installed dependencies and cached browser, without frozen provenance verification.

`sdk-stop.mjs` separately starts the installed recorder with intercepted hostile remote configuration. It checks the observable console and network suppression and tests the public stop call. The SDK can flush buffered events on stop; its internal discard method is not used. The structural mutation in this diagnostic is not guaranteed to reach the recorder before stop, and the result reports whether it was seen. The commands use the current installed dependencies and cached browser rather than a separately verified frozen dependency snapshot. Neither test enables replay in the product or proves its recording lifecycle safe.

# GeoIP control

The adapter lifecycle fixture checks the decoded events from the installed web SDK for `$geoip_disable: true` in web and desktop modes. PostHog documents this as an event-level way to skip GeoIP enrichment: https://posthog.com/docs/privacy/data-collection#location-data-when-ips-are-discarded. This does not establish IP retention settings or prevent an IP address from reaching the server. React Native's `disableGeoip` option is documented at https://posthog.com/docs/libraries/react-native#configuration-options; its SDK and product filter are separately exercised by the mobile component fixtures.

For the actual Electron main/preload plus real website mount, run the same cached-dependency fixture with `REPLAY_ELECTRON_MOUNT=1 REPLAY_ELECTRON_NO_SANDBOX=1 REPLAY_ELECTRON_BINARY=/path/to/cached/Electron REPLAY_CHROMIUM=... python3 packages/tests/fixtures/posthog-replay-browser/run-actual.py`. The explicit flag permits `--no-sandbox` only for this disposable Electron launch: Chromium's nested sandbox previously failed inside the macOS outbound-denying sandbox. It compiles current main/preload in the private snapshot, uses a private Electron profile, synthetic auth and intercepted SDK traffic. The outer OS outbound denial remains in force. The test does not qualify packaged Electron security, real authentication or live telemetry; source dependencies and cached docs remain linked from the caller.
