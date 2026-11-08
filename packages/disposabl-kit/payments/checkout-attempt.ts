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
