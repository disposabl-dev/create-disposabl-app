import { useEffect } from "react";

/** Coarse route categories only; never send URLs or query parameters. */
export function usePageTelemetry(pathname: string) {
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      import.meta.env.VITE_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
      !import.meta.env.VITE_CONVEX_SITE_URL
    )
      return;
    const page =
      pathname === "/"
        ? "home"
        : pathname.startsWith("/dashboard/connections")
          ? "connections"
          : pathname.startsWith("/dashboard")
            ? "dashboard"
            : pathname === "/login"
              ? "login"
              : pathname === "/signup"
                ? "signup"
                : "other";
    void fetch(`${import.meta.env.VITE_CONVEX_SITE_URL}/telemetry/page`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ platform: "web", page }),
    }).catch(() => {});
  }, [pathname]);
}
