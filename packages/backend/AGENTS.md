# Backend code

- Read `convex/_generated/ai/guidelines.md` before changing Convex code.
- `schema.ts` contains tables only. Put argument and return validators in `validator.ts`.
- Keep the schema small. Store each fact once; derive what you can.

## Modules

- `index.ts`: web/mobile functions. Resolve `userId`, then call the internal function with the same name.
- `internal.ts`: shared queries and mutations. Use `platforms: true` to expose functions to enabled platforms in `disposabl.json`.
- `actions/`: all actions, including ordinary and `"use node"` actions. Never put queries or mutations in a Node action file.
- Re-export ordinary platform actions from `internal.ts`. Call Node actions through `ctx.runAction`; never import a Node file into the default runtime.
- Use the kit's `internalQuery`, `internalMutation`, and `internalAction` builders, not `_generated/server` builders.
- Helpers do one specific job. Share them when another caller needs that same logic.

## Keep it simple

- Keep every source file at 300 lines or fewer; regenerate generated files instead of editing them.
- Prefer clear, concise code over extra layers, fields, or abstractions.
- With each change, review it from a fresh perspective: simplify related code, remove duplication, and address nearby debt without expanding scope.
