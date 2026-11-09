import { PostHog } from "posthog-js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createTelemetryLeaseController } from "../../../packages/disposabl-kit/client/lib/telemetry-lease";
import {
  isProductAction,
  productPageCategory,
  safeTelemetryEvent,
} from "./telemetry-policy";

const preferenceKey = "disposabl.product.analytics.optout.v1";
const preferenceEvent = "disposabl-product-analytics-preference";
let storageFailed = false;
function allowed() {
  try {
    return (
      !storageFailed &&
      navigator.doNotTrack !== "1" &&
      navigator.doNotTrack !== "yes" &&
      localStorage.getItem(preferenceKey) !== "1"
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
export function AnalyticsPreference() {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const update = () => setEnabled(allowed());
    update();
    window.addEventListener("storage", update);
    window.addEventListener(preferenceEvent, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(preferenceEvent, update);
    };
  }, []);
  return (
    <div className="mx-auto max-w-5xl px-6 pb-6 text-sm">
      <button
        type="button"
        className="underline"
        onClick={() => {
          try {
            if (enabled) stopActive?.();
            localStorage.setItem(preferenceKey, failed || enabled ? "1" : "0");
            storageFailed = false;
            setFailed(false);
            window.dispatchEvent(new Event(preferenceEvent));
          } catch {
            storageFailed = true;
            stopActive?.();
            setEnabled(false);
            setFailed(true);
          }
        }}
      >
        Allow analytics:{" "}
        {failed ? "not saved; select to retry" : enabled ? "yes" : "no"}
      </button>
    </div>
  );
}

/** Product capture boundary; replay is deliberately disabled in every configuration. */
export function createWebTelemetryAdapter(options: {
  origin: string;
  transport: typeof fetch;
  page: () => string;
  allowed: () => boolean;
  source: "web" | "desktop";
}) {
  let sdk: PostHog | undefined;
  let deadline = 0;
  let live = false;
  let lastView = "";
  let capture: (() => void) | undefined;
  const controller = createTelemetryLeaseController({
    origin: options.origin,
    transport: options.transport,
    adapter: {
      renew(lease) {
        deadline = Math.min(lease.expiresAt, Date.now() + 30_000);
      },
      start(lease) {
        live = true;
        deadline = Math.min(lease.expiresAt, Date.now() + 30_000);
        sdk = new PostHog();
        sdk.init(lease.projectToken, {
          api_host: lease.host,
          persistence: "memory",
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
              active: live && options.allowed(),
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
        sdk?.opt_out_capturing();
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
      allowed,
      source: productTelemetrySource(),
    });
    const update = () =>
      adapter.update({
        enabled: allowed() && identity.current.ready,
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
