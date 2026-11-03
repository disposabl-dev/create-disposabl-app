# create-disposabl-app

Create a Disposabl app with Bun:

```sh
bun create disposabl-app@latest my-app
```

Web is always included. Frontend authentication is enabled by default; pass
`--features none` to disable it, or include `authentication` in a comma-separated
feature list. Auth-disabled projects omit login/signup routes and auth-dependent
example screens, so missing routes return 404. Backend authentication code and
its access checks remain installed.

Releases publish automatically after changes reach `main`. Commit messages
determine the next version; no manual version edit is needed.

Every creation checks your Disposabl login and asks you to sign in through `disposabl login` if needed. It then creates the app, saves its UUID in `disposabl.json`, and configures a named development preview. There is no setup option. `--yes`, `--json`, and `--skip-install` still require login and app creation. The service is `https://www.disposabl.dev`.

```sh
bun create disposabl-app@latest my-app
cd my-app
bun run dev
```

New apps start on `main`, which is also their initial preview name. No branch prompt is needed.

The website opens automatically and Metro starts with development-client support. Install a development build once with `bun run --cwd apps/mobile android` or `bun run --cwd apps/mobile ios`. Expo Go is not used.

To get another development key in a worktree, run `disposabl previews token create --configure .`. The branch is detected automatically, or the worktree name when detached. Repeated requests reuse the preview and issue a new key. This configures local development; it does not deploy or require a git push. Push the scaffold Initial commit to `main` first, then open a same-repository feature PR to `main` for a CI preview. A feature branch push alone does not deploy.

If app creation is interrupted, rerun `bun create disposabl-app@latest my-app` from the parent directory. It resumes setup using the existing files and app UUID.

Generated apps do not include the `create-disposabl-app` package, its workspace lockfile entry, or its Turbo build task. The generator and bundled Disposabl CLI run externally.
