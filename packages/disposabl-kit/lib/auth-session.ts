// The Convex Auth access token subject is the stable session ID across refreshes.
// It is used only to choose presentation, never to authorize an operation.
export function sessionId(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const value = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof value.sub === "string" ? value.sub : null;
  } catch {
    return null;
  }
}
