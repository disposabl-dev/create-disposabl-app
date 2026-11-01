/** Allow local destinations only, including their query string and fragment. */
export function getReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return;
  const origin = "https://disposabl.invalid";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return;
  }
}
