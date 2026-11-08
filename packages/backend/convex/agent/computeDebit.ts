import { pricing } from "../../../disposabl-kit/payments/config";
import { billingRequest } from "@disposabl/disposabl-kit/server/billing";

export type DebitResult =
  | { outcome: "confirmed"; responseBalance: number }
  | { outcome: "denied" | "unknown" | "disabled" };

/** Call only after persisting an exclusive dispatch claim. Never retry unknown. */
export async function debitCompute(
  userId: string,
  enabled: boolean,
  key: string | undefined,
  request = billingRequest,
): Promise<DebitResult> {
  if (!enabled) return { outcome: "disabled" };
  if (!key?.trim()) return { outcome: "unknown" };
  try {
    const result = await request(key.trim(), "balances.check", {
      customer_id: userId,
      feature_id: pricing.featureId,
      required_balance: 10,
      send_event: true,
    });
    if (result.customer_id !== userId || result.required_balance !== 10)
      return { outcome: "unknown" };
    if (result.allowed === false) return { outcome: "denied" };
    const balance = result.balance;
    if (
      result.allowed !== true ||
      !balance ||
      typeof balance !== "object" ||
      Array.isArray(balance)
    )
      return { outcome: "unknown" };
    const details = balance as Record<string, unknown>;
    return details.feature_id === pricing.featureId &&
      details.unlimited === false &&
      details.overage_allowed === false &&
      typeof details.remaining === "number" &&
      Number.isFinite(details.remaining)
      ? { outcome: "confirmed", responseBalance: details.remaining }
      : { outcome: "unknown" };
  } catch {
    return { outcome: "unknown" };
  }
}
