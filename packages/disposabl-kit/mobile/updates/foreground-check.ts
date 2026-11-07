const INACTIVE_INTERVAL = 5 * 60_000;

/** Brief interruptions do not fetch; returning after five minutes does. */
export function foregroundCheck(
  check: () => void,
  initialState: string | null | undefined,
  now: () => number = Date.now,
) {
  let inactiveAt: number | null = initialState === "active" ? null : now();
  return (state: string) => {
    if (state !== "active") {
      inactiveAt ??= now();
      return;
    }
    const elapsed = inactiveAt === null ? 0 : now() - inactiveAt;
    inactiveAt = null;
    if (elapsed >= INACTIVE_INTERVAL) check();
  };
}
