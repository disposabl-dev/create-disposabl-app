import { createContext, useEffect, useRef, type ComponentType } from "react";
import { sessionId } from "../../lib/auth-session";
import { analyticsEnabled } from "../../features";

import { createPageTelemetry } from "../../lib/telemetry";

// Product apps can replace the generic starter transport without duplicating it.
export const TelemetryOverrideContext = createContext<ComponentType<{
  pathname: string;
  token: string | null;
  ready: boolean;
}> | null>(null);

// A shared ID is safe only when its entire read/send/write transition is locked.
// Without Web Locks, use a document-local identity rather than share stale state.
let memory: string | null = null;
const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
const telemetry = createPageTelemetry(
  locks
    ? {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      }
    : {
        getItem: () => memory,
        setItem: (_key, value) => {
          memory = value;
        },
      },
  fetch,
  locks
    ? (work) => locks.request("disposabl.analytics.identity.v1", work)
    : undefined,
);

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
