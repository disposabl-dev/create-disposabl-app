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
