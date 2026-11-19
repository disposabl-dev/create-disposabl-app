import { acceptedCookieCategory } from "../../../packages/disposabl-kit/client/components/cookie-consent";
import { PostHog } from "posthog-js";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createTelemetryLeaseController } from "../../../packages/disposabl-kit/client/lib/telemetry-lease";
import {
  isProductAction,
  productPageCategory,
  safeTelemetryEvent,
} from "./telemetry-policy";

const preferenceKey = "disposabl.product.analytics.optout.v1";
const preferenceEvent = "disposabl-product-analytics-preference";
let storageFailed = false;
let consent: boolean | null | undefined;
function allowed(token: string | null) {
  try {
    return (
      consent !== undefined &&
      consent !== false &&
      !storageFailed &&
      !(
        "globalPrivacyControl" in navigator &&
        navigator.globalPrivacyControl === true
      ) &&
      navigator.doNotTrack !== "1" &&
      navigator.doNotTrack !== "yes" &&
      localStorage.getItem(preferenceKey) !== "1" &&
      (token !== null ||
        (consent === true && acceptedCookieCategory("analytics")))
    );
  } catch {
    return false;
  }
}

let stopActive: (() => void) | undefined;
let sendAction: ((action: unknown) => void) | undefined;
export function captureProductAction(action: unknown) {
  try {
    sendAction?.(action);
  } catch {
    // Analytics must never interrupt the user's action.
  }
}
export function productTelemetrySource(): "web" | "desktop" {
  return (
    window as Window & { disposablDesktop?: { authentication?: boolean } }
  ).disposablDesktop?.authentication === true
    ? "desktop"
    : "web";
}
export function invalidateAnalyticsConsent() {
  consent = undefined;
  stopActive?.();
}

export function setAnalyticsConsent(enabled: boolean | null) {
  consent = enabled;
  try {
    if (enabled === false) stopActive?.();
    if (enabled !== null)
      localStorage.setItem(preferenceKey, enabled ? "0" : "1");
    storageFailed = false;
  } catch {
    storageFailed = true;
    stopActive?.();
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

/** Product capture boundary; replay is deliberately disabled in every configuration. */
export function createWebTelemetryAdapter(options: {
  origin: string;
  transport: typeof fetch;
  page: () => string;
  allowed: () => boolean;
  source: "web" | "desktop";
  token?: () => string | null;
}) {
  let sdk: PostHog | undefined;
  let deadline = 0;
  let live = false;
  let activeToken: string | null | undefined;
  let lastView = "";
  let capture: (() => void) | undefined;
  const controller = createTelemetryLeaseController({
    origin: options.origin,
    transport: options.transport,
    adapter: {
      renew(lease) {
        activeToken = options.token?.();
        deadline = Math.min(lease.expiresAt, Date.now() + 30_000);
      },
      start(lease) {
        activeToken = options.token?.();
        if (activeToken && !lease.identified)
          throw new Error("Unidentified telemetry lease");
        live = true;
        deadline = Math.min(lease.expiresAt, Date.now() + 30_000);
        sdk = new PostHog();
        sdk.init(lease.projectToken, {
          api_host: lease.host,
          persistence: "memory",
          consent_persistence_name: "disposabl-product-usage-consent",
          bootstrap: {
            distinctID: lease.distinctId,
            isIdentifiedID: lease.identified,
          },
          capture_pageview: false,
          capture_pageleave: false,
          autocapture: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_external_dependency_loading: true,
          advanced_disable_feature_flags: true,
          advanced_disable_decide: true,
          capture_exceptions: false,
          capture_performance: false,
          capture_heatmaps: false,
          capture_dead_clicks: false,
          enable_recording_console_log: false,
          request_batching: false,
          before_send(event) {
            const properties = safeTelemetryEvent(event.event, {
              active:
                live && activeToken === options.token?.() && options.allowed(),
              deadline,
              now: Date.now(),
              page: options.page(),
              action:
                typeof event.properties.action === "string"
                  ? event.properties.action
                  : undefined,
              sessionId: event.properties.$session_id,
              windowId: event.properties.$window_id,
              source: options.source,
              projectToken: lease.projectToken,
              distinctId: lease.distinctId,
            });
            return properties
              ? {
                  uuid: event.uuid,
                  event: event.event,
                  timestamp: event.timestamp,
                  properties,
                }
              : null;
          },
        });
        const sendPage = () => {
          const key = `${lease.distinctId}:${productPageCategory(options.page())}`;
          if (key === lastView) return;
          sdk?.capture("$pageview");
          lastView = key;
        };
        capture = sendPage;
        sendPage();
      },
      stop() {
        live = false;
        capture = undefined;
        lastView = "";
        sdk?.reset(true);
        sdk = undefined;
      },
    },
  });
  return {
    update: controller.update,
    stop: controller.stop,
    page: () => capture?.(),
    error: () => sdk?.capture("$exception"),
    action: (action: unknown) => {
      if (isProductAction(action)) sdk?.capture("product_action", { action });
    },
  };
}

export function ProductTelemetry({
  pathname,
  token,
  ready,
}: {
  pathname: string;
  token: string | null;
  ready: boolean;
}) {
  const page = useRef(pathname);
  const identity = useRef({ token, ready });
  const capture = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    page.current = pathname;
    identity.current = { token, ready };
  }, [pathname, token, ready]);
  useLayoutEffect(() => {
    const origin = import.meta.env.VITE_CONVEX_SITE_URL;
    if (
      !import.meta.env.PROD ||
      import.meta.env.VITE_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
      ["true", "1"].includes(import.meta.env.VITE_E2E ?? "") ||
      import.meta.env.VITE_DO_NOT_TRACK === "1" ||
      !origin
    )
      return;
    const adapter = createWebTelemetryAdapter({
      origin,
      transport: fetch.bind<typeof fetch>(window),
      page: () => page.current,
      allowed: () => identity.current.ready && allowed(identity.current.token),
      token: () => identity.current.token,
      source: productTelemetrySource(),
    });
    const update = () =>
      adapter.update({
        enabled: identity.current.ready && allowed(identity.current.token),
        token: identity.current.token,
      });
    stopActive = adapter.stop;
    sendAction = adapter.action;
    capture.current = adapter.page;
    const reportError = () => adapter.error();
    const reportAction = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target
        .closest("[data-telemetry-action]")
        ?.getAttribute("data-telemetry-action");
      adapter.action(action);
    };
    window.addEventListener(preferenceEvent, update);
    window.addEventListener("storage", update);
    window.addEventListener("error", reportError);
    window.addEventListener("unhandledrejection", reportError);
    window.addEventListener("click", reportAction);
    return () => {
      window.removeEventListener(preferenceEvent, update);
      window.removeEventListener("storage", update);
      window.removeEventListener("error", reportError);
      window.removeEventListener("unhandledrejection", reportError);
      window.removeEventListener("click", reportAction);
      if (stopActive === adapter.stop) stopActive = undefined;
      if (sendAction === adapter.action) sendAction = undefined;
      capture.current = undefined;
      adapter.stop();
    };
  }, []);
  useLayoutEffect(() => {
    window.dispatchEvent(new Event(preferenceEvent));
  }, [token, ready]);
  useEffect(() => {
    capture.current?.();
  }, [pathname]);
  return null;
}
