# Verification record

November 7, 2026. Isolated branch `feat/disposabl-launch-landing`, based on `origin/main` at `a0d0c73`. The parent checkout's existing changes were left untouched.

## Web: verified locally

- Docs build: `bun run --cwd apps/docs build` passed.
- Web build: `bun run --cwd apps/web build` passed with local dummy Convex URLs. Public routes prerendered successfully. Nonproduction robots remains `Disallow: /`; analytics remains disabled.
- Web typecheck and lint passed. Tests workspace typecheck passed. Generator/reset lint passed.
- Final repository gate: `bun run check` passed with local placeholder Convex URLs (18 workspace typecheck/lint tasks; all 439 files formatted). This includes backend and mobile static checks, not backend or native runtime verification. The first full run caught an unchecked metadata lookup under the shared kit's stricter TypeScript settings; the route parameter now accepts only the known marketing page keys. Study artifacts were formatted with Bun.
- `bun run e2e run flows/landing.e2e.ts flows/agent-onboarding.e2e.ts flows/seo.e2e.ts --target web --action-timeout 5000`: **7 passed** in the final targeted run.
- Scope: all platform selections/dependencies, selected-target labels, coming-soon download focus/tooltips/inert behavior, all package-manager commands, successful clipboard copy and denied-clipboard fallback, mobile navigation/Escape/focus return, FAQ disclosure, links to deeper pages, social metadata without JavaScript and PNG dimensions.
- Viewports: 320, 375, 390, 640, 768, 1024, 1440, and 1920 pixels. No document overflow or offscreen headings/primary platform/price text in the final responsive test. The 320px headline clipping found in the first run was fixed.
- Saved production screenshots at 320, 390, 768, and 1440 pixels in this folder's `evidence` directory.
- Browser inspection: desktop and mobile hero, platform section, guides; live reference sites inspected separately. This is desktop Chromium with changed CSS viewport sizes, not a claim of physical iPhone or Android browser testing.
- axe-core 4.14.0: zero WCAG 2 A/AA and WCAG 2.1 AA violations reported in the marketing region for home at 1440px and 390px, and all three guides at 390px. Two initial low-contrast onboarding labels were fixed. Automated scanning is not a complete accessibility audit.
- Built HTML inspected: root and all guide pages each have the intended distinct title/description/social title, canonical URL, and 1200×630 social image. PNG is about 83 KB. Social crawler availability after deployment remains unverified.
- Built sitemap inspected: 9 public canonical URLs, including the three guides; no section-anchor duplicates, dashboard, or login URLs.
- `git diff --check` passed.

## Backend/API/auth: infrastructure unavailable

The prescribed broader command was also attempted:

```sh
bun run test --target web,backend,api --action-timeout 5000
```

Source/unit tests: **3 passed**. E2E: **12 passed, 6 failed**. The six failures require a synchronized development backend, API endpoint, or auth provider response. This isolated worktree does not have that infrastructure configured. Five failed on missing backend/site configuration; the dashboard auth flow reached login but could not load its provider-dependent form. They are not reported as passing or silently skipped. The new marketing flows all passed in that run.

For visual/marketing runs, the existing Vite server used `VITE_CONVEX_URL=http://127.0.0.1:3210` and `VITE_CONVEX_SITE_URL=http://127.0.0.1:3211` with no backend running. Expected WebSocket connection-refused errors were observed. These placeholders do not prove auth/backend health. No credentials were copied, no data seeded, and no production backend was modified.

Test reproduction for the marketing-only lane:

```sh
# Terminal 1, apps/web
VITE_CONVEX_URL=http://127.0.0.1:3210 \
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211 \
bun x --no-install vite --host 127.0.0.1 --port 4317 --strictPort

# Terminal 2, repository root
E2E_WEB_URL=http://127.0.0.1:4317 \
VITE_CONVEX_URL=http://127.0.0.1:3210 \
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211 \
EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
EXPO_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211 \
bun run e2e run flows/landing.e2e.ts flows/agent-onboarding.e2e.ts flows/seo.e2e.ts --target web
```

Wrappers keep E2E telemetry disabled. Production analytics was not enabled for these runs.

## Generated apps: package boundary verified

`bun run --cwd packages/create-disposabl-app build` passed. Inspected the resulting template: no marketing component directory, marketing routes, marketing flow, stale generated route tree, product social image, or dangling marketing metadata import. Default shared onboarding behavior is preserved; the optional numbered steps are enabled only by the product homepage.

## Android and iOS: not applicable to this change

Native app code and builds were not changed. No emulator/simulator install or native app behavior was claimed. The web layout was checked at mobile widths. Store controls describe the future Disposabl mobile builder; generated mobile app capability is described separately.

## GitHub Actions and production

Read-only inspection of historical successful jobs supplied the dated build-time examples. No workflow was manually dispatched, rerun, or changed for testing. No secrets, protected branches, or provider permissions were changed. The final PR push is for delivery, not a substitute for local checks. CI results from that push are separate from this local record. The PR is not merged and production is not deployed by this task.

## Study gallery

100 hero studies × 2 viewports rendered through TesterArmy E2E: 200 structural observations, one passing audit run. No blank pages, absent visible heading, absent visible link/button candidates, or document-level overflow was found. CTA functionality and accessibility were not asserted for every exploratory study. The production page has its own behavior and accessibility checks above.
