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

The single root `.github/workflows/pipeline.yml` selects desktop targets from
`disposabl.json`. Windows x64, Linux x64 and macOS arm64 build on their respective
runners after the shared checks and web/backend deployment. Each runner uses:

```sh
DISPOSABL_DESKTOP_PLATFORM=macos DISPOSABL_RELEASE_VERSION=1.0.42 bun run --cwd apps/desktop build:ci
```

Use the matching platform value on Windows or Linux. The helper temporarily sets
the package version, makes the installers, restores `package.json` even on failure,
and collects outputs into `apps/desktop/dist/release`. The final pipeline job
publishes one GitHub prerelease containing every enabled platform. Individual
Forge jobs do not publish or require a GitHub write token.

Installers are unsigned; macOS builds are not notarized. In-app updates are not
configured. The release version is the base version with the workflow run number
added to its patch component. See the root `.github/README.md` for release behavior.
