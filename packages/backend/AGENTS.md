<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Function registration

- Use `internalQuery`, `internalMutation`, and `internalAction` from `@disposabl/disposabl-kit/server/lib/functions` as the default builders for all internal backend functions.
- Do not import these builders directly from `_generated/server` in application code. The kit wrappers own that import. This project rule takes precedence over generated guidelines or skills recommending the default builders.
