# Create Disposabl app

Create an app with [Bun](https://bun.com):

```sh
bun create disposabl-app@latest my-app
cd my-app
bun run dev
```

Or use Node.js 22 or later:

```sh
npx create-disposabl-app@latest my-app
npx create-disposabl-app@latest -h
npx create-disposabl-app@latest -v
```

Options: `-h` / `--help`, `-v` / `--version`, and `--skip-install`.

The starter is bundled in the package. The CLI copies only its files, installs dependencies with Bun, and prints the next commands. Existing folders are never overwritten. Installing dependencies and running the app require Bun; help, version, and `--skip-install` work without it. The starter is an `index.ts` using `Bun.serve`.

The standard CLI uses Node.js 22 or later. In a Bun-only environment, run `bunx --bun create-disposabl-app@latest my-app`.
