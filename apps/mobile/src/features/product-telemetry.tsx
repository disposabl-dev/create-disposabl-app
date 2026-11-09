import PostHog from "posthog-react-native";
import * as SecureStore from "expo-secure-store";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  PreferenceRow,
  PreferenceSection,
} from "../../../../packages/disposabl-kit/mobile/design/preferences";
import { screenCategory } from "./telemetry-policy";
import { createTelemetryLeaseController } from "../../../../packages/disposabl-kit/client/lib/telemetry-lease";

const key = "disposabl.product.analytics.optout.v1";
let allowed: boolean | null = null;
let preferencePending = false;
let preferenceLoad: Promise<void> | undefined;
const listeners = new Set<() => void>();
let stopActive: (() => void) | undefined;
let sendAction:
  ((action: "open_create" | "open_connections") => void) | undefined;
export function captureProductAction(
  action: "open_create" | "open_connections",
) {
  sendAction?.(action);
}
function notify() {
  for (const listener of listeners) listener();
}
function loadPreference() {
  if (allowed !== null) return Promise.resolve();
  // The provider and settings row may mount together. Only one storage read
  // may initialize the preference, so a stale second read cannot undo opt-out.
  return (preferenceLoad ??= (async () => {
    try {
      allowed = (await SecureStore.getItemAsync(key)) !== "1";
    } catch {
      allowed = false;
    }
    notify();
  })());
}
function usePreference() {
  const [value, setValue] = useState(allowed);
  useEffect(() => {
    const update = () => setValue(allowed);
    listeners.add(update);
    void loadPreference();
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return value;
}
export function AnalyticsPreference() {
  const value = usePreference();
  const [failed, setFailed] = useState(false);
  async function toggle() {
    if (value === null || preferencePending) return;
    preferencePending = true;
    if (value) stopActive?.();
    const next = failed ? false : !value;
    allowed = false;
    notify();
    try {
      await SecureStore.setItemAsync(key, next ? "0" : "1");
      allowed = next;
      setFailed(false);
    } catch {
      allowed = false;
      setFailed(true);
    }
    preferencePending = false;
    notify();
  }
  return (
    <PreferenceSection title="Privacy">
      <PreferenceRow
        icon={{ ios: "hand.raised", android: "privacy_tip" }}
        label="Allow analytics"
        value={
          value === null
            ? "Loading"
            : failed
              ? "Not saved; tap to retry"
              : value
                ? "Yes"
                : "No"
        }
        disabled={value === null}
        onPress={() => void toggle()}
      />
    </PreferenceSection>
  );
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
  const preference = usePreference();
  const page = useRef(pathname);
  const identity = useRef({ token, ready, preference });
  const send = useRef<(() => void) | undefined>(undefined);
  const updateRef = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    page.current = pathname;
    identity.current = { token, ready, preference };
  }, [pathname, token, ready, preference]);
  useLayoutEffect(() => {
    const origin = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
    if (
      __DEV__ ||
      ["true", "1"].includes(process.env.EXPO_PUBLIC_E2E ?? "") ||
      process.env.EXPO_PUBLIC_DO_NOT_TRACK === "1" ||
      process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
      !origin
    )
      return;
    let sdk: PostHog | undefined;
    let live = false;
    let deadline = 0;
    let lastView = "";
    const controller = createTelemetryLeaseController({
      origin,
      transport: fetch,
      adapter: {
        renew(lease) {
          deadline = lease.expiresAt;
        },
        start(lease) {
          live = true;
          deadline = Math.min(lease.expiresAt, Date.now() + 30_000);
          sdk = new PostHog(lease.projectToken, {
            host: lease.host,
            persistence: "memory",
            bootstrap: {
              distinctId: lease.distinctId,
              isIdentifiedId: lease.identified,
            },
            captureAppLifecycleEvents: false,
            errorTracking: { autocapture: false },
            rageClickConfig: { enabled: false },
            enableSessionReplay: false,
            disableRemoteFeatureFlags: true,
            preloadFeatureFlags: false,
            disableSurveys: true,
            flushAt: 1,
            fetchRetryCount: 0,
            before_send(event) {
              if (
                !live ||
                allowed !== true ||
                Date.now() >= deadline ||
                (event.event !== "$screen" && event.event !== "product_action")
              )
                return null;
              const action = event.properties?.action;
              if (
                event.event === "product_action" &&
                action !== "open_create" &&
                action !== "open_connections"
              )
                return null;
              return {
                uuid: event.uuid,
                event: event.event,
                timestamp: event.timestamp,
                properties: {
                  token: lease.projectToken,
                  distinct_id: lease.distinctId,
                  ...(event.event === "$screen"
                    ? { $screen_name: screenCategory(page.current) }
                    : { action: String(action) }),
                  platform: "mobile",
                },
              };
            },
          });
          const capture = () => {
            const current = `${lease.distinctId}:${screenCategory(page.current)}`;
            if (lastView === current) return;
            sdk?.screen(screenCategory(page.current));
            lastView = current;
          };
          send.current = capture;
          sendAction = (action) => sdk?.capture("product_action", { action });
          capture();
        },
        stop() {
          live = false;
          send.current = undefined;
          sendAction = undefined;
          void sdk?.optOut();
          sdk?.reset();
          sdk = undefined;
        },
      },
    });
    const update = () =>
      controller.update({
        enabled: identity.current.ready && identity.current.preference === true,
        token: identity.current.token,
      });
    stopActive = controller.stop;
    updateRef.current = update;
    return () => {
      if (stopActive === controller.stop) stopActive = undefined;
      updateRef.current = undefined;
      controller.stop();
    };
  }, []);
  useLayoutEffect(() => {
    updateRef.current?.();
  }, [token, ready, preference]);
  useEffect(() => {
    send.current?.();
  }, [pathname]);
  return null;
}
