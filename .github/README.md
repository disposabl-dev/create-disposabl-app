# Build and test your app

Use local builds for development and testing whenever your machine has the tools you need. You do not need to push changes or wait for GitHub Actions to check them.

## Run locally

From the app's folder:

```sh
bun run dev
```

This starts local development. Keep it running while you work. In another terminal:

```sh
bun run test
```

Tests live in `packages/tests`. The backend is always checked. Web and mobile checks follow the platforms in `disposabl.json`; API checks run only when API is selected. No E2E login, AI subscription, or model key is needed.

To check just the website and backend, use `bun run test --target web,backend`.

Mobile tests need an app built and installed on a simulator or emulator. Build locally with `bun run --cwd apps/mobile ios` on a Mac with Xcode, or `bun run --cwd apps/mobile android` with the Android SDK. Keep Metro running for debug builds, then test with `bun run test --target ios` or `bun run test --target android`.

These are starter checks. Add flows as your app grows. They do not cover desktop, MCP, CLI, or SDK clients. The [testing guide](../packages/tests/README.md) explains device selection, backend setup, reports, and CI use.

E2E telemetry is disabled. PostHog analytics is production-only.

## Publish previews and releases

GitHub Actions is still used for hosted previews and releases. Local testing does not publish your app. The existing release workflows do not automatically run the E2E suite; adding a complete release gate requires an isolated backend and the required mobile devices.

Install Disposabl on your personal GitHub account or an organization you administer, then connect Convex. Mobile apps also need Expo. A GitHub organization and a separate runner service are not required.

The included workflows use GitHub-hosted Linux, Windows, and macOS runners. See [pipeline.yml](workflows/pipeline.yml) for their current settings. Production iOS distribution uses EAS Build. Existing app repositories keep their workflows until you update them.

GitHub Actions, EAS, and hosting providers have usage limits. Local builds avoid consuming hosted build minutes.
