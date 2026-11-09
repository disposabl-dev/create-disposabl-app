import { internalActionGeneric as internalAction } from "convex/server";
import { v } from "convex/values";
export {
  claimIdentity,
  expireIdentity,
  getLink,
  beginLink,
  finishLink,
} from "../../../../backend/convex/telemetry";
// The scheduled transport is deliberately inert. Tests invoke the registered
// transactional claim, lookup, reservation and acknowledgement directly.
export const deliverLink = internalAction({
  args: { id: v.id("telemetryIdentities") },
  returns: v.null(),
  handler: async () => null,
});
