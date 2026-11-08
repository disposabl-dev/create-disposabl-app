import { useEffect, useRef } from "react";
import { sessionId } from "../../lib/auth-session";
import { analyticsEnabled } from "../../features";

import { createPageTelemetry } from "../../lib/telemetry";

const telemetry = createPageTelemetry({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});

export function usePageTelemetry(
  pathname: string,
  token: string | null,
  ready = true,
) {
  const lastView = useRef<string | null>(null);
  useEffect(() => {
    if (
      !ready ||
      !analyticsEnabled ||
      !import.meta.env.PROD ||
      import.meta.env.VITE_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
      !import.meta.env.VITE_CONVEX_SITE_URL
    )
      return;
    const key = JSON.stringify([pathname, sessionId(token)]);
    if (lastView.current === key) return;
    lastView.current = key;
    telemetry.view(
      import.meta.env.VITE_CONVEX_SITE_URL,
      "web",
      pathname,
      token,
    );
  }, [pathname, token, ready]);
}
