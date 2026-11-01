# Convex + TypeScript + ESLint

This template provides a minimal setup to get Convex working, with TypeScript
and ESLint.

Start by editing `convex/myFunctions.ts` and interact with your backend from the
dashboard or via the CLI:

```sh
npx convex run myFunctions:myQuery '{"first": 1, "second": "Hello"}'
```

See Convex docs at https://docs.convex.dev/home

## Setting up

```
npm create convex@latest -t bare
```

# App drafts and sandbox setup

App drafts require `website`; `cli`, `typescript`, and `python` require `api`, and `openai` and `claude` require `mcp`. App lists currently return at most 100 records. Existing records without platforms read as `website`.

Boat requires `BOAT_API_KEY` in the Convex deployment. Set `SANDBOX_OPENAI_API_KEY` to a separately scoped, budget-limited OpenAI API key before sending a message; it is exposed to code inside the sandbox. Creation and resume use `noEnv: true`. Codex credentials are written to protected files in its sandbox home, and healthy running sandboxes are reused without stopping them. The user-scoped MCP key is revoked on completion or after one hour, so long-running prompts can lose MCP access. An uncertain prompt submission stays locked for review instead of being retried automatically. Live sandbox provisioning, Codex credential loading, and dispatch have not been verified.
