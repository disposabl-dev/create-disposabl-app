# Documentation

Choose `--features docs` when creating an app. The generator includes Fumapress,
the web build dependency and copy step, and the `/docs` HTTP routes. Without
docs, it removes this workspace and all of those hooks.

Add Markdown or MDX files in `apps/docs/content` and commit them with your PR.
`content/index.mdx` is the docs home. `content/guides/writing.mdx` becomes
`/docs/guides/writing`. Fumapress builds the sidebar and static search index from
these files. Use `/guides/writing` for internal docs links; Fumapress adds `/docs`.
Use an ordinary `<a href="/docs/">` link from the web app to enter docs.

Run `bun run build`, or `bun run build --filter=@disposabl/web` for the website
and its dependencies. Turbo builds docs first, then web copies the rendered site
into its output. Both build tasks run without caching so deleted pages cannot
survive a cache restore:

```text
apps/web/dist/client/
  index.html
  assets/
  docs/
    index.html
    guides/writing/index.html
    assets/
    RSC/
    api/search
```

The PR and production pipeline template uses that same web build command and
uploads `apps/web/dist/client` once to Convex static hosting. Docs changes ship
with the web app. There is no docs dev server or runtime build process.

Run `bun run --cwd apps/docs build` to build only the documentation. Local web
development does not serve docs; rendered docs are included in the combined
build and deployment. Adding docs to an app generated without them requires
restoring the workspace and build hooks, not just changing `disposabl.json`.
