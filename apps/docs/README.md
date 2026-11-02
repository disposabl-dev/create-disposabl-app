# Documentation

Enable `docs` in the root `disposabl.json` features array. Generated apps include
this folder when created with `--features docs`.

Run the usual web development command, `bun run --cwd apps/web dev`, and open
`/docs`. The kit builds Fumapress and serves its static output at `/docs/`.
Changes to `content`, `src`, or the docs configuration rebuild the docs; refresh
the browser after the terminal reports completion. Restart the web dev server
after changing the feature flag or dependencies.

Write pages in `content` using Markdown or MDX. `content/index.mdx` is the docs
home, and `content/guides/writing.mdx` is `/docs/guides/writing`. Fumapress adds the
`/docs` base path to internal links, so use `/guides/writing` within docs content.
Use ordinary `<a href="/docs/">` links from the TanStack app to enter docs.

## One build and deployment

Run `bun run build`, or `bun run --cwd apps/web build` for just the website.
The web build owns the docs build so it runs once, then copies the output:

```text
apps/web/dist/client/
  index.html                 Web app
  assets/                    Web assets
  docs/
    index.html               Fumapress home
    guides/writing/index.html
    assets/                  Docs assets
    RSC/                     Static navigation payloads
    api/search               Static search index
```

Deploy the existing `apps/web/dist/client` directory through Convex static
hosting. Web and docs ship in the same upload. The kit's small `/docs` HTTP
handler maps clean URLs to directory indexes, redirects `/docs` to `/docs/`, and
returns 404 for missing pages. Fumapress runs at build time; production needs no
Waku server. Deploy backend changes when enabling or disabling the docs feature.

Run `bun run --cwd apps/docs build` to build docs on their own. The root build
excludes the standalone docs task because the web build already builds and copies
docs when enabled.

With `docs` disabled, the web build skips Fumapress and emits no docs directory.
The generator also omits this workspace and its dependencies. Search runs in the
browser using a static index. Server-only Fumapress plugins require a different
hosting setup and are outside this static integration.
