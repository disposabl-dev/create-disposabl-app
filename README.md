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

Install [Bun](https://bun.sh) and [Git](https://git-scm.com), then run:

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

Choose one of these commands. All create the same project, which uses Bun to install dependencies and run locally. npm, pnpm, and Yarn also need Node.js 22.12 or newer.

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

## Need more detail?

- [Setup options and troubleshooting](packages/create-disposabl-app/README.md)
- [Instructions for coding agents](packages/skill/SKILL.md)
- [Mobile development](apps/mobile/README.md) and [desktop development](apps/desktop/README.md)
- [Report a problem](https://github.com/disposabl-dev/create-disposabl-app/issues)

Disposabl is open source under the [MIT license](LICENSE).
