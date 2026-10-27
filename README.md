# Create Disposabl app

```sh
bun create disposabl-app@latest
# or
npx create-disposabl-app@latest my-app
```

Choose platforms and optional features. Web is required; Docs is optional. The CLI installs dependencies with Bun, then prints the commands to start your app.

Options: `-h` / `--help`, `-v` / `--version`, `-y` / `--yes` for defaults, `--docs`, and `--skip-install`.

The CLI uses Node.js 22.12 or later. Bun-only environments can use `bunx --bun create-disposabl-app@latest`. The generated app uses Bun, ESLint, and `bun fmt`. Docs, when selected, is available at `/docs`.

## Development

The app lives in `cli/templates/default/`. Everything outside that directory is CLI or repository tooling. `bun run build` bundles the template; generated apps receive no publishing scripts or workflows.

```sh
bun install
bun fmt
bun run lint
bun run typecheck
bun run build
bun run dev
```

## Releases

Push or merge to `main` to publish. Stable versions increment the patch automatically. Set a higher stable version in `cli/package.json` for a minor or major release. Set an explicit future version such as `0.1.0-beta.1` for a beta, incrementing it manually for each beta publication. Remove the suffix and set the intended stable version when ready.

The workflow records the actual version in a release commit, publishes to npm `latest` or `beta`, confirms availability, then creates the matching Git tag and GitHub Release. Betas become GitHub prereleases. Reruns reuse the recorded version and repair incomplete releases. No PR builds are published.

First publication only: build, run `npm login`, then `npm publish` inside `cli/` with version `0.0.1`. Later releases use npm trusted publishing without an npm token in GitHub.
