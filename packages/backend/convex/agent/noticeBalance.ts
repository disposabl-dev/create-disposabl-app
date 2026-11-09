import { billingRequest } from "@disposabl/disposabl-kit/server/billing";
import { pricing } from "../../../disposabl-kit/payments/config";

/** Observe the balance without consuming or creating a customer. */
export async function observeNoticeBalance(
  userId: string,
  key: string | undefined,
  request = billingRequest,
): Promise<number> {
  if (!key?.trim()) throw new Error("Balance observation unavailable.");
  const result = await request(key.trim(), "balances.check", {
    customer_id: userId,
    feature_id: pricing.featureId,
    required_balance: 10,
    send_event: false,
  });
  const balance = result.balance;
  if (
    result.customer_id !== userId ||
    result.required_balance !== 10 ||
    typeof result.allowed !== "boolean" ||
    !balance ||
    typeof balance !== "object" ||
    Array.isArray(balance)
  )
    throw new Error("Balance observation unavailable.");
  const value = balance as Record<string, unknown>;
  if (
    value.feature_id !== pricing.featureId ||
    value.unlimited !== false ||
    value.overage_allowed !== false ||
    typeof value.remaining !== "number" ||
    !Number.isFinite(value.remaining)
  )
    throw new Error("Balance observation unavailable.");
  return value.remaining;
}
