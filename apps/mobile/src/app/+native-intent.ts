/** Ignore the billing return link so foreground refresh retains the current screen. */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (
    /^disposabl-billing-[a-f0-9]{12}-[a-z][a-z0-9-]{0,62}:\/\/billing-return\/?$/.test(
      path,
    )
  )
    return null;
  return path;
}
