# CLI and SDK releases

Publishing runs in GitHub Actions through npm trusted publishing. The generated app's pipeline checks whether `packages/cli` and `packages/sdk` exist, builds the selected clients on PRs, and publishes them only after a production push to `main` and a successful web/backend deployment. Package publishing uses GitHub-hosted Ubuntu runners because npm OIDC does not support the pipeline's Blacksmith runners.

Each client uses semantic-release, like create-disposabl-app, with a separate `<package-name>@<version>` tag. Only commits touching that package, the shared release helper, or the API contract cause a release. Conventional commits choose patch/minor/major; an accepted contract major change forces a client major release even if the commit says `fix`. Multiple merged PRs are evaluated since each package's last tag. Releases are serialized per package and production runs are not cancelled by newer commits.

`bun run generate` refuses changed or removed operations until `bun run --cwd packages/backend generate --accept-breaking` is used. Review that change before accepting it. Additive operations advance the contract minor version. Comparisons are conservative: changes to an existing operation require acceptance, including some compatible changes.

Configure npm trusted publishing for each app-specific package name, GitHub repository, and `pipeline.yml` workflow. Activate the bundled `.github/workflows/pipeline.yml.example` as `pipeline.yml` when setting up the app's CI. No npm token is used by the workflow. If npm-side package or publisher setup is missing, the package job reports the authentication failure; configure it and rerun.

This starter repository uses the existing `publish.yml` workflow for create-disposabl-app and its own `@disposabl/cli` and `@disposabl/sdk` packages. Their trusted publisher must therefore name `publish.yml`. Generated apps receive their own package and binary names and their repository metadata is set at release time.

After a partial publication, check npm and Git tags before rerunning. If a tag exists but an artifact is missing, recover the missing artifact from that exact commit and version.
