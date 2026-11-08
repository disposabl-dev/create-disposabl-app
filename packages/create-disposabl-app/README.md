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

| Option                          | What it does                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--platforms <ids>`             | Choose `web`, `ios`, `android`, `macos`, `windows`, `linux`, `mcp`, `api`, `cli`, or `typescript-sdk`. Separate multiple choices with commas. Web is always included. |
| `--android-architectures <ids>` | Choose Android ABIs for one APK. Defaults to `arm64-v8a,x86_64`; `armeabi-v7a` and `x86` are also supported.                                                          |
| `--features <ids>`              | Choose features from `--list-options`, such as `authentication` and `docs`. The default is `authentication`. Use `--features none` to omit optional features.         |
| `--yes`                         | Skip the name, platform, and feature questions. Supply an app name in the command.                                                                                    |
| `--list-options`                | Show available platforms and features without creating an app.                                                                                                        |
| `--skip-install`                | Create files without installing dependencies. Account setup still runs.                                                                                               |
| `--json`                        | Return a result coding agents can read. Supply an app name. Account setup still runs.                                                                                 |

CLI and TypeScript SDK include API support automatically. Backend authentication and access checks remain installed even with `--features none`.

## Change an existing app's features

The generated `disposabl-reconfigure` skill handles code changes separately from account setup. From the app's parent directory, use the version in its `disposabl.json`:

```sh
npx create-disposabl-app@<version> my-app --reconfigure-only --features authentication,payments --skip-install --json
```

Supply the complete desired feature list. Add `--platforms` with a complete list to change platforms too. Omitted lists stay unchanged. Run `bun install` in the app afterward, review the diff, and test affected platforms. The code-only command does not log in, provision providers, commit, or deploy. Store and payment-provider configuration is a separate step.

Use `--android-architectures arm64-v8a,x86_64` to change the Android ABI selection. This replaces the list and requires a compatible new native build; it does not create separate APKs.

## Resume setup

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

Push the generated initial commit to `main` before opening feature pull requests. A same-repository pull request to `main` starts a CI preview; changes pushed to `main` start the production workflow. A feature branch push by itself does not deploy. Desktop installers build only on pushes to `main`, when their inputs change; PRs retain web and mobile previews. Build and delivery requirements depend on the selected platforms.

See the [coding-agent guide](https://github.com/disposabl-dev/create-disposabl-app/blob/main/packages/skill/SKILL.md) for the full delivery workflow, or [report a problem](https://github.com/disposabl-dev/create-disposabl-app/issues).

Set `features` to include `faster-ci` in `disposabl.json` to use Blacksmith runners (the GitHub App must be installed). The initial selection job remains GitHub-hosted so it can read the configuration.

Faster CI selects an eight-vCPU Linux runner for universal Android builds and a two-vCPU runner for web and other Linux jobs. Android retains all four architectures and its 20-minute job limit. Blacksmith usage is billed through your existing account; runner capacity alone does not guarantee a build completes within the limit.

## Generator release checks

Before publishing the generator, `bun run --cwd packages/create-disposabl-app build && bun run --cwd packages/create-disposabl-app verify:starter` creates fresh minimal-web, Web + Android, mobile-without-authentication, and all-platform projects. Each follows the CLI's formatting and installation steps, then runs the first CI frozen install, `bun run check`, its retained unit tests, and web and selected CLI/SDK builds. Pass `web-minimal`, `web-android`, `mobile-minimal`, or `all-platforms` after `verify:starter` to check one selection. These checks use no provider credentials and do not provision or deploy resources. Native builds and installed-app behavior still need the platform checks below.

Published generator releases can collect limited Disposabl usage analytics when centrally configured. They record the generator version, operating system, package-manager category and outcome, using a random ID that can be linked to your Disposabl user ID after login. They do not collect prompts, arguments, paths, error messages, credentials or email. Set `DO_NOT_TRACK=1` or `DISPOSABL_TELEMETRY_DISABLED=1` to opt out. Local source, development, CI and E2E runs do not send events. This is separate from analytics you configure for your own app.

Release builds must receive the central public PostHog project token in `DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN` and its approved ingestion origin in `DISPOSABL_CLI_POSTHOG_HOST`. Both values are embedded at build time; a release build fails if they are missing. `DISPOSABL_CLI_TELEMETRY_REQUIRED=1` enforces this check for development-version qualification builds. Use the central public project token, never a personal API key or a generated app owner’s project token.
