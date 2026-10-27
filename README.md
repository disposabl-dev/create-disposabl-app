# Create Disposabl app

Create an app with [Bun](https://bun.com) 1.4.4 or later:

```sh
bun create disposabl-app@latest my-app
cd my-app
bun run dev
```

The command downloads this repository's `main` branch with [giget](https://github.com/unjs/giget), leaves out `cli/` and the npm publishing workflow, and runs `bun install`. It refuses to overwrite an existing folder. The empty starter serves a plain response at http://localhost:3000. Add your application code at the repository root.

You can also use GitHub's **Use this template** button. When creating a repo through GitHub, remove `cli/` and `.github/workflows/publish.yml` yourself. Publishing is guarded to run only in the original repository.

## Maintaining the CLI

The npm package lives in `cli/`. To install its dependencies and test:

```sh
cd cli
bun install
bun test
```

Every push to `main` runs the tests and publishes the next patch version through npm trusted publishing. Versions are calculated from npm in CI without a version commit. The local manifest starts at `0.0.1`; npm shows the current published version. No npm token is stored in GitHub.
