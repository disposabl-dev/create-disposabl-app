# Disposabl

Create an app for web, mobile, and desktop. Start with a prompt in your coding agent or a command in your terminal.

Disposabl sets up the project, sign-in, and a development environment. You and your coding agent build the app from there. Your code lives in your GitHub account.

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

## Build and test locally

Use your own machine for development and testing whenever it has the tools you need. You do not need to push a commit or wait for GitHub Actions to check a change.

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

See [builds and publication](.github/README.md) for what runs locally and what runs on GitHub.

## Need more detail?

- [Setup options and troubleshooting](packages/create-disposabl-app/README.md)
- [Instructions for coding agents](packages/skill/SKILL.md)
- [Mobile development](apps/mobile/README.md) and [desktop development](apps/desktop/README.md)
- [Report a problem](https://github.com/disposabl-dev/create-disposabl-app/issues)

Disposabl is open source under the [MIT license](LICENSE).
