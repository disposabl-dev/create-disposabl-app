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
| macOS    | arm64, Apple Silicon | `.zip` containing the `.app`               | `make:macos`   |

Run each script with `bun run --cwd apps/desktop <script>`. Packaging rejects other
platform and architecture combinations, including Windows ARM and Intel macOS.
Build Windows installers on Windows, Linux packages on Linux, and macOS packages
on macOS. Linux builders need `fakeroot`, `dpkg`, and `rpm` installed.

## CI releases

The single root `.github/workflows/pipeline.yml` selects affected desktop targets from
`disposabl.json`. Windows x64 and Linux x64 build in parallel after shared checks and web/backend
deployment. CI always skips macOS, even when enabled in `disposabl.json`. Each runner uses:

```sh
DISPOSABL_DESKTOP_PLATFORM=linux DISPOSABL_RELEASE_VERSION=1.0.42 bun run --cwd apps/desktop preview
```

Use the matching platform value on Windows. The helper temporarily sets
the package version, makes the installers, restores `package.json` even on failure,
and collects outputs into the repository root `dist/release`. The final pipeline job
publishes one GitHub prerelease containing the affected enabled platforms. Individual
Forge jobs do not publish or require a GitHub write token.

Installers are unsigned; macOS builds are not notarized. In-app updates are not
configured. The release version is `1.0.<workflow run number>`. See the root `.github/README.md` for release behavior.
