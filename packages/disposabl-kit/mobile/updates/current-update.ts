type Check = { isAvailable: boolean; isRollBackToEmbedded: boolean };
type Fetch = { isNew: boolean; isRollBackToEmbedded: boolean };

/** Recheck before restarting; unavailable does not revoke a cached update. */
export async function fetchCurrentUpdate(
  check: () => Promise<Check>,
  fetch: () => Promise<Fetch>,
  embedded: boolean,
): Promise<"ready" | "unavailable" | "rollback"> {
  const advertised = await check();
  if (!advertised.isAvailable && !advertised.isRollBackToEmbedded)
    return "unavailable";

  const downloaded = await fetch();
  // Persist rollback metadata even on an embedded launch, so a withdrawn
  // downloaded bundle cannot win selection on the next cold start.
  if (downloaded.isRollBackToEmbedded) return embedded ? "rollback" : "ready";
  return downloaded.isNew ? "ready" : "unavailable";
}
