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

The single root `.github/workflows/pipeline.yml` selects affected desktop targets from
`disposabl.json`. Windows x64, Linux x64 and macOS arm64 build in parallel alongside
web/backend deployment on GitHub-hosted runners. Each runner uses:

```sh
DISPOSABL_DESKTOP_PLATFORM=linux DISPOSABL_RELEASE_VERSION=1.0.42 bun run --cwd apps/desktop preview
```

Use the matching platform value on Windows or macOS. The helper temporarily sets
the package version, makes the installers, restores `package.json` even on failure,
and collects outputs into the repository root `dist/release`. Each platform job
then uploads directly to its own GitHub prerelease using its job-scoped write
token, without waiting for other platforms. PR tags such as `app-pr-2-macos` stay
constant while their assets and source commit update after successful builds.
Main releases use separate platform/run tags. Forge itself does not publish.

Windows and Linux installers are unsigned. macOS builds use ad hoc signing by
default; Developer ID signing and notarization are optional. In-app updates are not configured. The release version is
`1.0.<workflow run number>`. See the [app workflow](../../.github/workflows/pipeline.yml) for release behavior.

## macOS signing

To enable Developer ID signing and notarization, configure all five repository
secrets, or grant this repository access to equivalent organization secrets:

- `MACOS_CERTIFICATES_P12_PRODUCTION`: base64-encoded Developer ID Application
  certificate and private key exported as `.p12`.
- `MACOS_CERTIFICATES_PASSWORD_PRODUCTION`: the `.p12` export password.
- `MACOS_APPLE_API_KEY_P8_PRODUCTION`: the raw App Store Connect API private key.
- `MACOS_APPLE_API_KEY_ID_PRODUCTION`: its Key ID.
- `MACOS_APPLE_API_ISSUER_PRODUCTION`: its Issuer ID.

With all five secrets present, the same credentials sign and notarize prereleases
and production releases. The suffix is a naming convention. The workflow imports
the certificate into a temporary keychain, lets Forge sign, notarize and staple
the app, and checks the app mounted from the DMG with `codesign`, Gatekeeper and `stapler`.
The keychain and temporary notarization key are cleaned up. Configured signing or
notarization failures stop publication; they do not silently downgrade the app.

Without the complete credential set, previews and production still publish an ad
hoc signed DMG. This signature does not verify the developer's identity. The
release notes identify it as unnotarized and link to Apple's installation guidance.
Users may need **System Settings > Privacy & Security > Open Anyway**; managed Macs
may disallow this. Local `make:macos` builds also use ad hoc signing by default.

Change `MACOS_BUNDLE_ID` at the top of the workflow to set your desktop bundle
identifier. CI builds only Apple Silicon (`arm64`), never Intel macOS packages.

The desktop window uses the web app at `http://localhost:3000` during development. Packaged builds use the `CONVEX_SITE_URL` supplied at build time. This shares the same home, login/signup, and authentication-disabled behavior. If the website is unavailable, a bundled Disposabl starter home is shown.
