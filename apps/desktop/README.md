# Desktop

Electron Forge with Vite and TypeScript, managed by the repository's Bun workspace.
Requires Bun 1.4.4 and Node.js 22.13 or newer.

Run these commands from the repository root:

```sh
bun install
bun run --cwd apps/desktop dev
bun run --cwd apps/desktop typecheck
bun run --cwd apps/desktop lint
bun run --cwd apps/desktop build
bun run --cwd apps/desktop make
```

`dev` opens the app with Vite hot reload. `build` packages the application into
`apps/desktop/out/`. `make` also creates distributables for the current platform.
The desktop app participates in the root Turbo tasks, so
`bun run --cwd apps/desktop dev` also starts it.

Use the root `bun.lock`; do not generate a separate npm lockfile or run npm install
inside this workspace. Forge 8 still probes npm's version during its CLI system
check, so its output can say `Found npm`. Bun installs the dependencies and runs
the project scripts; Forge and Electron still use Node.js.

## Distribution targets

| Platform | Architecture         | Distributables                             | Bun script     |
| -------- | -------------------- | ------------------------------------------ | -------------- |
| Windows  | x64                  | Squirrel `Setup.exe`, `.nupkg`, `RELEASES` | `make:windows` |
| Linux    | x64                  | `.deb` and `.rpm`                          | `make:linux`   |
| macOS    | arm64, Apple Silicon | `.dmg` containing the `.app`               | `make:macos`   |

Run each script with `bun run --cwd apps/desktop <script>`. Packaging rejects other
platform and architecture combinations, including Windows ARM and Intel macOS.
Build Windows installers on Windows, Linux packages on Linux, and macOS packages
on macOS. Linux builders need `fakeroot`, `dpkg`, and `rpm` installed.

## CI releases

Desktop builds run only after a push or merge to `main`, when desktop files or shared build inputs change. Pull requests do not build desktop installers or create desktop prereleases.

The root [pipeline](../../.github/workflows/pipeline.yml) selects enabled targets from `disposabl.json`. After web/backend deployment succeeds, Windows x64, Linux x64, and macOS arm64 build in parallel. Bun installs the desktop and backend workspaces, and dependency downloads and Electron binaries are cached.

The build helper temporarily sets version `1.<workflow run number>.<run attempt>`, creates the installers, restores `package.json`, and collects outputs in `dist/release`. Build jobs upload artifacts; the separate publisher checks the source commit and publishes Windows/Linux releases from trusted `main` scripts. Main release tags include the platform and workflow run. Forge itself does not publish.

Windows and Linux installers are unsigned. Without signing credentials, macOS uses ad hoc signing and provides a DMG as a workflow artifact retained for three days; updates remain blocked. With the signing configuration below, the production workflow signs, notarizes, verifies and publishes the macOS release and update feed.

The desktop window uses `http://localhost:3000` during development and the deployed `CONVEX_SITE_URL` in packaged builds. It shares the website and authentication flow; if the site is unavailable, it shows the bundled starter page.

## Browser and sign-in handoff

External HTTPS links open in the system browser. Connection flows can create a temporary blank window while requesting their provider URL; it closes after opening that URL in the browser. Other native protocols and credential-bearing URLs are rejected. App pages remain sandboxed, with context isolation enabled and Node integration disabled.

Google sign-in returns through `/oauth/desktop` to the installed app's unique `disposabl-desktop-<desktopId>` protocol. The return contains only Convex's one-time ticket. The initiating app retains the flow state and redeems the ticket through the existing auth client. Keep `desktopId` unchanged between builds. macOS packaging declares the protocol; Windows registers it when the installed app starts, and Linux packages declare its MIME handler. Development builds do not register an OS protocol. Use an installed build for real browser-return verification. Other external provider pages may require their own browser session.

Run `E2E_DESKTOP_NAVIGATION=1 bun run e2e run desktop-navigation.e2e.ts --target backend --retries 0` on a machine with Electron installed and a graphical session. It compiles the actual main/preload, checks navigation and callback delivery using local fixture pages, and intercepts system-browser launches. It makes no provider requests and does not prove a Google transaction, OS protocol association, or native binary update. Test those separately on each supported OS.

## Native updates

The website is loaded from `CONVEX_SITE_URL`; refreshing it receives deployed web changes independently of a native update. The app menu's **Check for updates** checks the installed native binary on macOS and Windows, downloads an available update, and asks before restarting. A downloaded update may also install at the next launch. Development builds and builds without a feed report that updates are not configured. Linux uses the system package manager; the menu explains this and does not claim to check for an update. The existing DEB/RPM artifacts do not configure an apt or RPM repository, so operators must provide one for package-manager updates.

Each scaffolded app receives a random persistent `desktopId` in `disposabl.json`. It determines the native package and bundle identifiers and the update path; retain it when regenerating the app. The first CI build embeds its production Convex site URL and identity. Existing installations built before this updater or with a different identity require a new installation. Channels and platform/architecture paths are separate. Feed access is unauthenticated, so update packages are publicly downloadable even when the GitHub repository is private. Do not put private material or credentials in them. Windows packages are currently unsigned and lack publisher signature verification.

After building and verifying Windows artifacts, CI uses the same production `CONVEX_DEPLOY_KEY` already used for backend deployment to upload the full package to Convex file storage and atomically publish its feed record. The website's static-hosting component is not modified. Each release has an immutable versioned filename; existing packages remain in storage so in-flight clients can finish. Feed records are scoped to the app identity, channel, platform and architecture, and reject older workflow runs and attempts. Feed metadata is served without caching; package requests redirect to Convex storage, avoiding the HTTP action response limit. Failed or stale publications leave the previous feed in place. The publisher discards its uploaded blob only if no published feed references it; a lost cleanup response may still require manual storage reconciliation. Storage and egress are billable and retained versions require an explicit future retention policy. Convex upload URLs have a two-minute timeout; a slow or failed upload leaves the prior release available.

macOS also produces a ZIP for Squirrel.Mac. To enable signed production releases, set the GitHub Actions secret `MACOS_SIGNING_CONFIG` to a JSON object with these string fields:

- `certificateBase64`: base64-encoded `.p12` containing the Developer ID Application certificate and private key.
- `certificatePassword`: password for that `.p12`.
- `identity`: the full signing identity, for example `Developer ID Application: Example, Inc. (ABCDE12345)`.
- `teamId`: the ten-character Apple team ID matching that identity.
- `apiKeyBase64`: base64-encoded App Store Connect API `.p8` key for notarization.
- `apiKeyId` and `apiIssuer`: the API key ID and issuer ID.

Encode the base64 values on one line. Do not commit this JSON or its source files.

The workflow imports the certificate into a temporary keychain, builds and notarizes, then verifies the apps inside both the update ZIP and the read-only mounted DMG, including their signing identity, stapled tickets and Gatekeeper assessment. Their code-directory hashes must match before either is published. A shell trap and an always-run cleanup step remove only that job's keychain and temporary files on normal failures and cancellation; forced termination can prevent cleanup, so self-hosted runners must also clean their temporary directory. Keep the signing identity and bundle identifier stable across releases. A valid Apple Developer ID certificate, notarization access and a macOS runner are required; configuring the secret alone does not prove delivery. The existing Linux DEB/RPM artifacts do not configure an apt or RPM repository, so Linux native updates are unavailable until such a repository is provided.

Verify delivery using two installed versions on each supported OS, checking no-update, download, restart, signature rejection and recovery from a failed feed. Building or staging an artifact alone does not prove update delivery. See [Electron's updater documentation](https://www.electronjs.org/docs/latest/api/auto-updater) and [static feed format](https://www.electronjs.org/docs/latest/tutorial/updates).
