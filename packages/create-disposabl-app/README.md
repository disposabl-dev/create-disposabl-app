# create-disposabl-app

Create a Disposabl app for web, mobile, desktop, and developer tools.

## Get started

Install [Bun](https://bun.sh), [Git](https://git-scm.com), and [Node.js](https://nodejs.org) 24.8 or newer, then run:

```sh
bunx create-disposabl-app@latest
```

Choose your app's name and platforms. Web is always included, and app sign-in is enabled by default.

Setup asks you to sign in to [Disposabl](https://www.disposabl.dev) and connect GitHub and Convex. Mobile apps also need an Expo account. It creates your project and configures its development environment.

When setup finishes:

```sh
cd my-app
bun run dev
```

Use the app name you chose instead of `my-app`. Your website opens automatically. Mobile apps need a development build before you can open them on a device; they do not use Expo Go. See the generated `apps/mobile/README.md` for the next steps.

You can also launch setup with npm, pnpm, or Yarn 2+. The generated project still requires Bun. Tests need Node.js 22.22.3 or newer on Node 22, or Node.js 24.8 or newer.

| Tool | Command                                |
| ---- | -------------------------------------- |
| npm  | `npx create-disposabl-app@latest`      |
| pnpm | `pnpm dlx create-disposabl-app@latest` |
| Yarn | `yarn dlx create-disposabl-app@latest` |

## Prefer a coding agent?

Paste this into Codex, Claude Code, Cursor, or another coding agent:

```text
Help me build an app with Disposabl. Read https://github.com/disposabl-dev/create-disposabl-app, then ask me what I want to make and where it should run.
```

## Choose options in the command

For example, create a web and mobile app with sign-in:

```sh
bunx create-disposabl-app@latest my-app --platforms web,ios,android --yes
```

| Option              | What it does                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--platforms <ids>` | Choose `web`, `ios`, `android`, `macos`, `windows`, `linux`, `mcp`, `api`, `cli`, or `typescript-sdk`. Separate multiple choices with commas. Web is always included. |
| `--features <ids>`  | Choose features from `--list-options`, such as `authentication` and `docs`. The default is `authentication`. Use `--features none` to omit optional features.         |
| `--yes`             | Skip the name, platform, and feature questions. Supply an app name in the command.                                                                                    |
| `--list-options`    | Show available platforms and features without creating an app.                                                                                                        |
| `--skip-install`    | Create files without installing dependencies. Account setup still runs.                                                                                               |
| `--json`            | Return a result coding agents can read. Supply an app name. Account setup still runs.                                                                                 |

CLI and TypeScript SDK include API support automatically. Backend authentication and access checks remain installed even with `--features none`.

## If setup stops

Your files are saved. Follow the error's instructions, then run the same command from the parent folder:

```sh
bunx create-disposabl-app@latest my-app
```

Setup resumes using the existing project and app ID. If dependency installation failed, run `bun install` inside the app folder before retrying.

## Development and publishing

New apps start on the `main` branch with a configured local development environment. Use `bun run dev` for local work. Build and test on your own machine whenever its tools are available; do not push changes just to get a test run.

Every app includes E2E tests in `packages/tests`. Run `bun run test` for the selected web/mobile platforms and the backend, or `bun run test --target web,backend` for a smaller check. API checks run only when API is selected. No E2E login, AI subscription, or model key is needed.

Mobile tests need a built app installed on a simulator or emulator. Debug builds need Metro running too. The included flows are starter checks; your coding agent should add tests for the features it builds. Desktop, MCP, CLI, and SDK clients are not covered by these flows.

E2E telemetry is disabled. PostHog analytics is production-only. Read the generated `packages/tests/README.md` for test setup and CI instructions. Existing release workflows do not automatically run these tests.

For a separate Git worktree, run this inside that worktree to configure its development environment:

```sh
bunx --package create-disposabl-app disposabl previews token create --configure .
```

Push the generated initial commit to `main` before opening feature pull requests. A same-repository pull request to `main` starts a CI preview; changes pushed to `main` start the production workflow. A feature branch push by itself does not deploy. Build and delivery requirements depend on the selected platforms.

See the [coding-agent guide](https://github.com/disposabl-dev/create-disposabl-app/blob/main/packages/skill/SKILL.md) for the full delivery workflow, or [report a problem](https://github.com/disposabl-dev/create-disposabl-app/issues).
