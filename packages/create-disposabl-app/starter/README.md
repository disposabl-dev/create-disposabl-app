# Starter backend

`build.ts` copies only the shared auth, users, MCP, and Convex support modules
from the product backend, then overlays `backend/`. Keep product tables,
provider credentials, and provisioning handlers out of this template.

The generated bindings and contract here were regenerated from a fresh starter
using `convex codegen` and `bun run generate`. When shared auth/users/component
definitions change, regenerate them in a scaffold, build the web routes, run
`bun run generate`, and copy the resulting API/server declarations and backend
contract back here. Do not copy generated output from the Disposabl backend.
SDK output is regenerated from the starter contract by its normal build script.
