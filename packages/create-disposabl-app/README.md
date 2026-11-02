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

Choose managed setup to sign in through `disposabl login`, create an app, save its UUID in `disposabl.json`, and configure a named development preview. The service is `https://www.disposabl.dev`.

```sh
bun create disposabl-app@latest my-app --setup
cd my-app
bun run dev
```

New apps start on `main`, which is also their initial preview name. No branch prompt is needed.

The website opens automatically and Metro starts with development-client support. Install a development build once with `bun run --cwd apps/mobile android` or `bun run --cwd apps/mobile ios`. Expo Go is not used.

To get another development key in a worktree, run `disposabl previews token create --configure .`. The branch is detected automatically, or the worktree name when detached. Repeated requests reuse the preview and issue a new key.

If managed setup fails, rerun `bun create disposabl-app@latest my-app --setup` from the parent directory. It resumes setup using the existing files and app UUID.
