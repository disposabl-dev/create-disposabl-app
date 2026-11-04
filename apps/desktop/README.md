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
`bun run dev --filter=desktop` also starts it.

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

The root [pipeline](../../.github/workflows/pipeline.yml) selects enabled targets from `disposabl.json`. After web/backend deployment succeeds, Windows x64, Linux x64, and macOS arm64 build in parallel. Bun installs only the desktop workspace, and dependency downloads and Electron binaries are cached.

The build helper temporarily sets version `1.0.<workflow run number>`, creates the installers, restores `package.json`, and collects outputs in `dist/release`. Build jobs upload artifacts; the separate publisher checks the source commit and publishes Windows/Linux releases from trusted `main` scripts. Main release tags include the platform and workflow run. Forge itself does not publish.

Windows and Linux installers are unsigned. macOS uses ad hoc signing and provides a DMG as a workflow artifact retained for three days. The pipeline does not currently configure Developer ID signing, notarization, or macOS GitHub releases. In-app updates are not configured.

The desktop window uses `http://localhost:3000` during development and the deployed `CONVEX_SITE_URL` in packaged builds. It shares the website and authentication flow; if the site is unavailable, it shows the bundled starter page.
