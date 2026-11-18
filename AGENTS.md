# Development

- Keep code concise. Aim for roughly 300 lines per source file, but this is a guideline, not a hard limit. Keep related logic together; do not split files just to meet a line count.
- Simplify related code with each change.
- Use NativeWind classes and shared theme tokens for mobile UI. Do not add StyleSheet definitions or inline layout styles. Pass measured values through NativeWind CSS variables; keep native navigation and rendering API parameters at their integration boundary.

# Testing

- Keep end-to-end behavior tests in `packages/tests`, separate from application code. Use TesterArmy E2E and read `packages/tests/README.md` before adding or running flows. `bun run e2e guide` provides the installed version's documentation.
- Run `bun run test` for the platforms selected in `disposabl.json`. Backend checks always apply; API checks only apply when the API platform is selected. Use `--target` for an explicitly scoped run and report which platforms were tested.
- Use deterministic locators and assertions by default. No E2E login, model subscription, or API key is required. Coding agents should extend the flows when application behavior changes.
- Build and verify locally when the toolchain is available. Do not push or start GitHub Actions merely to test a change. Mobile tests need a locally built and installed app plus a simulator/emulator; a successful compilation is not behavioral proof.
- Before pushing app code for a preview, run `bun run check:preview` with the app's development web environment from a clean checkout of the commit you plan to push. This also runs the production web build and prerenders public routes.
- After changes to Convex functions or schemas, let the app's development backend regenerate `packages/backend/convex/_generated` and commit those changes with the source.
- Use the starter's Convex provider in web routes. Start separate realtime clients or subscriptions after browser hydration to keep public route prerendering independent of live connections.
- Run checks against the app's development or isolated preview backend. Never copy another app's credentials or seed production data. Report missing infrastructure and failed tests rather than silently skipping required platforms.
- E2E telemetry is disabled by the provided commands. Leave it disabled until it follows Disposabl's telemetry preference.
- PostHog analytics is production-only; do not enable it for local development or E2E runs.
