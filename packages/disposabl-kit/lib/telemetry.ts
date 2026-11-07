export function pageCategory(pathname: string) {
  return pathname === "/"
    ? "home"
    : pathname.startsWith("/dashboard/connections")
      ? "connections"
      : pathname.startsWith("/dashboard")
        ? "dashboard"
        : pathname === "/login"
          ? "login"
          : pathname === "/signup"
            ? "signup"
            : pathname === "/account"
              ? "account"
              : "other";
}
export function sendPageTelemetry(
  origin: string,
  platform: "web" | "mobile",
  pathname: string,
  token: string | null,
) {
  return fetch(`${origin}/telemetry/page`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ platform, page: pageCategory(pathname) }),
  }).catch(() => {});
}
