# Create Disposabl app

Create an app with [Bun](https://bun.com):

```sh
bun create disposabl-app@latest my-app
cd my-app
bun run dev
```

Or use npm with Node.js 22 or later:

```sh
npx create-disposabl-app@latest my-app
npx create-disposabl-app@latest -h
npx create-disposabl-app@latest -v
```

The CLI copies the starter bundled in its npm package and runs `bun install`. It never downloads this repository. Existing folders are never overwritten. The starter is a single `index.ts` using `Bun.serve` at http://localhost:3000.

Options: `-h` / `--help`, `-v` / `--version`, and `--skip-install`. Installing dependencies and running the app require Bun; help, version, and `--skip-install` work without it.

The standard CLI uses Node.js 22 or later. In a Bun-only environment, run `bunx --bun create-disposabl-app@latest my-app`.

## Maintaining the CLI

The CLI source lives in `cli/`; starter files live in `cli/templates/default/`. Edit the starter there. Its `gitignore` becomes `.gitignore` in generated apps. Only the built CLI and template are packed, so generated apps receive no CLI source, release scripts, or GitHub workflows.

From the repository root:

```sh
bun install
bun run typecheck
bun run lint
bun run test
bun run build
cd cli
npm pack --ignore-scripts
cd ..
bun cli/smoke.ts cli/create-disposabl-app-0.0.1.tgz
```

`bun run dev` runs the starter directly. GitHub's **Use this template** copies the complete development repository; the CLI creates a clean app. Publishing is guarded to run only in the original repository.

Publish the first version, `0.0.1`, after building, running `npm login`, and then running `npm publish` inside `cli/`. Configure npm trusted publishing for `disposabl-dev/create-disposabl-app` and `publish.yml`.

Every push to `main` runs checks, builds the CLI and template, and tests the packed artifact through npx, Bun install, and a running HTTP server. That exact artifact is published through npm trusted publishing. The version is set before building so `--version` matches npm.

The patch is the workflow run number plus one. Failed runs leave a version gap; reruns keep the same version. The local manifest stays at `0.0.1`. No npm token is stored in GitHub.
