// The real inbox schedules this name; the fixture cannot call a provider.
import { internalActionGeneric } from "convex/server";
import { v } from "convex/values";
export const dispatch = internalActionGeneric({
  args: { balanceId: v.string() },
  returns: v.null(),
  handler: async () => null,
});
