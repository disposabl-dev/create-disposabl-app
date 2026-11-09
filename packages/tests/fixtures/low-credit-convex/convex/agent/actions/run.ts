import { internalActionGeneric } from "convex/server";
import { v } from "convex/values";
// Enqueued work remains inert; no sandbox or provider is started.
export const tick = internalActionGeneric({
  args: { id: v.string() },
  handler: () => null,
});
