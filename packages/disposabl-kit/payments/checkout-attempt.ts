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
