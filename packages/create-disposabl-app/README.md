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
