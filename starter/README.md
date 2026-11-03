# Starter backend

`reset.ts` owns the product-to-starter boundary. The generator copies the project
to a disposable staging directory and runs that script there before packaging.
The script keeps shared auth, users, MCP, and Convex support modules, overlays
`backend/`, removes product routes and dependencies, and updates workspace
metadata. Running it again produces the same output.

Reset requires the generator-created `.disposabl-staging.json` marker and refuses
a working Git checkout or symlinks in paths it changes. Run the generator build to create
a clean starter; do not run reset against the product checkout. The staging
marker, script, and replacement source files are excluded from the npm template.

The generated bindings and contract here were regenerated from a fresh starter
using `convex codegen` and `bun run generate`. When shared auth/users/component
definitions change, regenerate them in a scaffold, build the web routes, run
`bun run generate`, and copy the resulting API/server declarations and backend
contract back here. Do not copy generated output from the Disposabl backend.
SDK output is regenerated from the starter contract by its normal build script.
