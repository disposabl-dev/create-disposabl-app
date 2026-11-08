export function nextSubmissionStep(
  enabled: boolean,
  balance: number | null,
  connectionsReady: boolean,
  requiresExpo: boolean,
  hasExpo: boolean,
) {
  if (
    enabled &&
    (balance === null || !Number.isFinite(balance) || balance < 10)
  )
    return "payment";
  if (!connectionsReady || (requiresExpo && !hasExpo)) return "connections";
  return "send";
}

/** Reject offerings with unverified extra products or an unexpected period. */
export function validMonthlyOffering(
  packages: {
    product: { identifier: string; subscriptionPeriod: string | null };
  }[],
  productId: string,
) {
  return (
    packages.length === 1 &&
    packages[0].product.identifier === productId &&
    packages[0].product.subscriptionPeriod === "P1M"
  );
}
