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

The build helper temporarily sets version `1.0.<workflow run number>`, creates the installers, restores `package.json`, and collects outputs in `dist/release`. Build jobs upload artifacts; the separate publisher checks the source commit and publishes Windows/Linux releases from trusted `main` scripts. Main release tags include the platform and workflow run. Forge itself does not publish.

Windows and Linux installers are unsigned. macOS uses ad hoc signing and provides a DMG as a workflow artifact retained for three days. The pipeline does not currently configure Developer ID signing, notarization, or macOS GitHub releases. The signed macOS update lane still requires separate configuration described below.

The desktop window uses `http://localhost:3000` during development and the deployed `CONVEX_SITE_URL` in packaged builds. It shares the website and authentication flow; if the site is unavailable, it shows the bundled starter page.

## Native updates

The website is loaded from `CONVEX_SITE_URL`; refreshing it receives deployed web changes independently of a native update. The app menu's **Check for updates** checks the installed native binary on macOS and Windows, downloads an available update, and asks before restarting. A downloaded update may also install at the next launch. Development builds and builds without a feed report that updates are not configured. Linux uses the system package manager; the menu explains this and does not claim to check for an update. The existing DEB/RPM artifacts do not configure an apt or RPM repository, so operators must provide one for package-manager updates.

Each scaffolded app receives a random persistent `desktopId` in `disposabl.json`. It determines the native package and bundle identifiers and the update path; retain it when regenerating the app. The first CI build embeds its production Convex site URL and identity. Existing installations built before this updater or with a different identity require a new installation. Channels and platform/architecture paths are separate. Feed access is unauthenticated, so update packages are publicly downloadable even when the GitHub repository is private. Do not put private material or credentials in them. Windows packages are currently unsigned and lack publisher signature verification.

After building and verifying Windows artifacts, CI uses the same production `CONVEX_DEPLOY_KEY` already used for backend deployment to upload the full package to Convex file storage and atomically publish its feed record. The website's static-hosting component is not modified. Each release has an immutable versioned filename; existing packages remain in storage so in-flight clients can finish. Feed records are scoped to the app identity, channel, platform and architecture, and reject older or repeated build numbers. Feed metadata is served without caching; package requests redirect to Convex storage, avoiding the HTTP action response limit. Failed or stale uploads do not replace the previous feed but may leave an unreferenced blob. Storage and egress are billable and retained versions require an explicit future retention policy. Convex upload URLs have a two-minute timeout; a slow or failed upload leaves the prior release available.

macOS also produces a ZIP for Squirrel.Mac. A properly Developer ID signed and notarized build with `MACOS_NOTARIZE=true`, Apple API credentials and a matching signing identity can use the same upload path. Successive releases must retain the same signing identity and bundle identifier. The current CI lane has no signing credentials and creates only ad-hoc signed workflow artifacts, so it deliberately does not publish a macOS update feed. Signature verification remains enabled. Configure signing and notarization before expecting installed macOS updates to work. The existing Linux DEB/RPM artifacts do not configure an apt or RPM repository, so Linux native updates are unavailable until such a repository is provided.

Verify delivery using two installed versions on each supported OS, checking no-update, download, restart, signature rejection and recovery from a failed feed. Building or staging an artifact alone does not prove update delivery. See [Electron's updater documentation](https://www.electronjs.org/docs/latest/api/auto-updater) and [static feed format](https://www.electronjs.org/docs/latest/tutorial/updates).
