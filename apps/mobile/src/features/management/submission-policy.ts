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
