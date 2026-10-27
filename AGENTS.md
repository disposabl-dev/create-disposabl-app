# Project guidance

## Setup

### CLI

To publish an npm package for the first time, the user must run `npm login` and, after a successful login, run `npm publish` for the first version, which is always `0.0.1`.

### SDK

To publish an npm package for the first time, the user must run `npm login` and, after a successful login, run `npm publish` for the first version, which is always `0.0.1`.

## Versioning and releases

- Use `bun fmt` for formatting and ESLint for linting; the root uses the starter's ESLint configuration. Do not add another formatter or retained test files.
- App code belongs in `cli/templates/default/`; keep CLI and release tooling minimal and outside the generated app.
- Keep each published package's version in its own `package.json`; the CLI's source of truth is `cli/package.json`. Stable releases increment the patch automatically; set a higher stable version manually for a minor or major release.
- Use semantic versioning tools. Record the actual release version in Git; never derive it from a CI run number.
- Choose patch for compatible fixes, minor for compatible features, and major for breaking contracts. Before 1.0, use at least a minor increment for breaking changes and document them.
- Use `X.Y.Z` with npm tag `latest` for stable releases and `X.Y.Z-beta.N` with npm tag `beta` for betas. Never publish a beta to `latest`.
- For a beta, manually set a future version such as `0.1.0-beta.1` in `cli/package.json`. Publish that exact version with npm `--tag beta` and mark its GitHub Release as a prerelease. npm does not automatically choose the beta tag. Increment the suffix manually for each beta; remove it to resume stable releases. Do not publish PR builds.
- Create a matching Git tag, such as `v0.1.0` or `v0.1.0-beta.1`, for the exact source commit used to build and test the npm artifact. A rerun must not invent a new version.
- Publish the tested artifact, confirm that version is available on npm, then create the matching GitHub Release. Mark beta releases as prereleases and keep them out of GitHub's latest stable release.
- Retry a failed GitHub Release creation without republishing an npm version that already succeeded.
