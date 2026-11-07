import { useEffect, useRef } from "react";
import { sessionId } from "../../lib/auth-session";
import { analyticsEnabled } from "../../features";

import { sendPageTelemetry } from "../../lib/telemetry";

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
    void sendPageTelemetry(
      import.meta.env.VITE_CONVEX_SITE_URL,
      "web",
      pathname,
      token,
    );
  }, [pathname, token, ready]);
}
