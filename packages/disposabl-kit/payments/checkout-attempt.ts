export type CheckoutResult = { url: string | null; retryAllowed?: true };

/** Keep an uncertain attempt's identity until the server confirms its outcome. */
export async function requestCheckout(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  customerId: string,
  purchase: "monthly" | "topup",
  start: (args: {
    purchase: "monthly" | "topup";
    requestId: string;
  }) => Promise<CheckoutResult>,
  newId: () => string = () => crypto.randomUUID(),
) {
  const key = `billing-attempt:${customerId}:${purchase}`;
  const requestId = storage.getItem(key) ?? newId();
  storage.setItem(key, requestId);
  const result = await start({ purchase, requestId });
  if (result.url || result.retryAllowed === true) storage.removeItem(key);
  return result;
}

/** A query parameter marks the iOS context but cannot grant a purchase option. */
export function handoffSelection(value: string | null) {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    return typeof record.userId === "string" &&
      typeof record.expiresAt === "number" &&
      record.expiresAt > Date.now() &&
      (record.purchase === "monthly" || record.purchase === "topup")
      ? {
          userId: record.userId,
          purchase: record.purchase,
          expiresAt: record.expiresAt,
        }
      : null;
  } catch {
    return null;
  }
}
export function handoffAllows(
  fromIos: boolean,
  selection: ReturnType<typeof handoffSelection>,
  customerId: string | null,
  purchase: "monthly" | "topup",
) {
  return (
    !fromIos ||
    (!!customerId &&
      selection?.userId === customerId &&
      selection.expiresAt > Date.now() &&
      selection.purchase === purchase)
  );
}

/** Preserve native origin even when its selected purchase has expired or is malformed. */
export function handoffContext(stored: string | null, search: string) {
  return {
    handoff: handoffSelection(stored),
    fromIos:
      stored !== null || new URLSearchParams(search).get("source") === "ios",
  };
}

/** A claim is checked against the redeemed browser session by the backend. */
export function handoffReturnClaim(value: string | null) {
  try {
    const record = JSON.parse(value ?? "null");
    return typeof record?.returnClaim === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(record.returnClaim)
      ? record.returnClaim
      : null;
  } catch {
    return null;
  }
}
export function safeBillingReturnUrl(value: string | undefined) {
  return value &&
    /^disposabl-billing-[a-f0-9]{12}-[a-z][a-z0-9-]{0,62}:\/\/billing-return$/.test(
      value,
    )
    ? value
    : null;
}
