import {
  createHandoff,
  inspectHandoff,
  redeemHandoff,
} from "@disposabl/disposabl-kit/server/billing-handoff";
import { requireBillingEligibility } from "./billing";
export const create = createHandoff(requireBillingEligibility);
export const inspect = inspectHandoff(requireBillingEligibility);
export const redeem = redeemHandoff(requireBillingEligibility);
export {
  returnTarget,
  cleanup,
} from "@disposabl/disposabl-kit/server/billing-handoff";
