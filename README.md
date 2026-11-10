# Create Disposabl App

Create an app for web, mobile, and desktop. Start with a prompt in your coding agent or a command in your terminal.

Disposabl sets up the project, sign-in, and a development environment. You and your coding agent build the app from there. Your code lives in your GitHub account.

## What you get

- **A working starting point:** a website with sign-in and a dashboard, ready for your own screens and features.
- **A shared backend:** a database and server functions powered by Convex, used by your website and other selected apps.
- **The platforms you choose:** mobile and desktop apps, plus optional tools for developers and AI assistants.
- **Tests included:** starter checks in a separate `packages/tests` folder, with no E2E account or AI subscription needed.
- **Help for your coding agent:** project instructions and a Disposabl skill covering setup, development, testing, and delivery.
- **A path to publishing:** GitHub workflows for previews and releases when you are ready to share your app.

This is a starter kit. You or your coding agent still add your app's features and tests. You can read, change, and keep the generated source code.

## Start with your coding agent

Copy this into **Codex, Claude Code, Cursor**, or another coding agent:

```text
Help me build an app with Disposabl. Read https://github.com/disposabl-dev/create-disposabl-app, then ask me what I want to make and where it should run.
```

Tell your agent your idea. It can guide you through setup and help build your first version. You will need to sign in and connect your accounts when prompted.

## Or start in your terminal

Install [Bun](https://bun.sh), [Git](https://git-scm.com), and [Node.js](https://nodejs.org) 24.8 or newer, then run:

```sh
bunx create-disposabl-app@latest
```

Choose a name and the platforms you want. Setup asks you to sign in to [Disposabl](https://www.disposabl.dev) and connect GitHub and Convex. Mobile apps also need an Expo account.

When setup finishes, open your new app's folder and start it:

```sh
cd my-app
bun run dev
```

Replace `my-app` with the name you chose. Your website opens in the browser.

<details>
<summary>Using npm, pnpm, or Yarn?</summary>

Choose one of these commands. All create the same project, which uses Bun to install dependencies and run locally. Tests need Node.js 22.22.3 or newer on Node 22, or Node.js 24.8 or newer.

| Tool    | Command                                |
| ------- | -------------------------------------- |
| npm     | `npx create-disposabl-app@latest`      |
| pnpm    | `pnpm dlx create-disposabl-app@latest` |
| Yarn 2+ | `yarn dlx create-disposabl-app@latest` |

</details>

## Choose your platforms

| Build for     | Options                                       |
| ------------- | --------------------------------------------- |
| Web           | A website, always included                    |
| Mobile        | iOS and Android                               |
| Desktop       | macOS, Windows, and Linux                     |
| AI assistants | MCP tools that let agents work with your app  |
| Developers    | An API, command-line tool, and TypeScript SDK |

Choose only what you need. App sign-in is included by default. Native apps need their platform's build tools; running the website does not install a mobile or desktop app.

The API lets other software use your app. The CLI provides terminal commands, and the TypeScript SDK helps developers call your app from code. Choosing the CLI or SDK also enables the API. You can also include a documentation site.

## Tech stack

These are the main tools behind the starter. You do not need to learn all of them before creating an app.

| Part            | Technology                             | What it does                                                   |
| --------------- | -------------------------------------- | -------------------------------------------------------------- |
| Language        | TypeScript                             | Keeps application code and data types consistent               |
| Website         | React, TanStack Start and Router, Vite | Builds pages, navigation, and the local web development server |
| Styling         | Tailwind CSS                           | Styles the website                                             |
| Backend         | Convex                                 | Stores data, runs server functions, and delivers live updates  |
| Sign-in         | Convex Auth                            | Provides account creation and username/password sign-in        |
| Mobile          | Expo, React Native, Expo Router        | Builds iOS and Android apps                                    |
| Desktop         | Electron, Electron Forge               | Packages the web experience as a desktop app                   |
| Developer tools | OpenAPI, TypeScript SDK, CLI, MCP      | Connects other software and AI assistants to your app          |
| Documentation   | Fumadocs and Fumapress                 | Builds the optional documentation site                         |
| Testing         | TesterArmy E2E                         | Runs repeatable browser, mobile, backend, and API checks       |
| Project tools   | Bun and Turborepo                      | Installs dependencies and runs commands across the project     |
| Publishing      | GitHub Actions and Expo EAS            | Builds previews and releases for the selected platforms        |

Web and the backend are always included. Other apps and features follow your selections in `disposabl.json`.

## Where things live

| Folder                            | Contents                                              |
| --------------------------------- | ----------------------------------------------------- |
| `apps/web`                        | Website                                               |
| `apps/mobile`                     | iOS and Android app, when selected                    |
| `apps/desktop`                    | Desktop app, when selected                            |
| `apps/docs`                       | Documentation site, when selected                     |
| `packages/backend`                | Database schema, server functions, API, and MCP tools |
| `packages/tests`                  | End-to-end test configuration and flows               |
| `packages/cli` and `packages/sdk` | Optional developer clients                            |
| `packages/skill`                  | Instructions for coding agents                        |

The root `AGENTS.md` explains how agents should work in the project. In this repository, `packages/create-disposabl-app` contains the generator that creates new apps.

## Local Git checks

Run `bun run hooks:install` once after cloning to enable the tracked pre-commit
hook. Git shares this setting across worktrees of the same repository. If you
already use a different hook directory or active default hooks, the installer stops so you can combine
the hooks without losing yours.

The hook checks staged whitespace and formatting without changing the index or
working files, including partially staged files. It needs Bun 1.4.4. Before
pushing, run `bun run check` for generation, workspace typechecking, linting,
and formatting; Turbo reuses its local cache when inputs are unchanged. This
uses the working tree and may update generated files. Run the relevant
`bun run test` targets as well; the hook does not replace CI or E2E checks.

## Build and test locally

Use your own machine for development and testing whenever it has the tools you need. You do not need to push a commit or wait for GitHub Actions to check a change.

The frontend runs locally and connects to your Convex development backend. Setup still needs internet access and the connected accounts.

Every new app includes [E2E](https://github.com/tester-army/e2e) tests in `packages/tests`. After starting your development environment with `bun run dev`, run:

```sh
bun run test
```

This checks the backend and the web/mobile platforms you selected. API checks run only when API is enabled. There are no extra setup questions, E2E accounts, AI subscriptions, or model keys to provide. Your coding agent can add tests as it builds features.

For a quicker check of just the website and backend:

```sh
bun run test --target web,backend
```

Mobile tests need an app built and installed on a simulator or emulator first. iOS needs a Mac with Xcode; Android needs the Android SDK. Build locally with `bun run --cwd apps/mobile ios` or `bun run --cwd apps/mobile android`, then run the matching test target. Debug builds also need Metro running.

The included tests are a starting point, not complete coverage of your app. They do not test desktop, MCP, CLI, or SDK clients. See [the testing guide](packages/tests/README.md) for adding flows, choosing devices, and running in CI.

E2E telemetry is disabled. PostHog analytics is for production only.

## Publish when you are ready

Generated apps still include GitHub Actions workflows for previews and releases. These are separate from local testing. The current release workflows do not automatically run the new E2E suite; a full release gate needs an isolated backend and the required mobile devices.

Use `bun run test` before a local web build. Native tests run after building and installing the app they will check. See the [testing guide](packages/tests/README.md#ci) for the commands and environment needed in CI.

Install Disposabl on your personal GitHub account or an organization you administer, then connect Convex. Mobile apps also need Expo. A GitHub organization and a separate runner service are not required.

Hosted builds use GitHub's Linux, Windows, and macOS runners. Production iOS distribution uses EAS Build. The [app workflow](.github/workflows/pipeline.yml) contains the current build settings. Existing generated repositories keep their workflows until you update them.

GitHub Actions, Expo, and hosting providers have usage limits and may charge beyond their included allowances. Local builds avoid using hosted build minutes.

## Need more detail?

- [Setup options and troubleshooting](packages/create-disposabl-app/README.md)
- [Instructions for coding agents](packages/skill/SKILL.md)
- [Mobile development](apps/mobile/README.md) and [desktop development](apps/desktop/README.md)
- [Report a problem](https://github.com/disposabl-dev/create-disposabl-app/issues)

Disposabl is open source under the [MIT license](LICENSE).
