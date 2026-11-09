import { sessionId } from "../../lib/auth-session";

/** A short-lived server authorization for a client telemetry adapter. */
export type TelemetryLease = {
  enabled: true;
  projectToken: string;
  host: string;
  anonymousId: string;
  distinctId: string;
  identified: boolean;
  expiresAt: number;
};

type Adapter = {
  start: (lease: TelemetryLease) => void;
  stop: () => void;
  renew?: (lease: TelemetryLease) => void;
};

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function valid(value: unknown, now: number): value is TelemetryLease {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.enabled === true &&
    typeof v.projectToken === "string" &&
    v.projectToken.length > 0 &&
    (v.host === "https://us.i.posthog.com" ||
      v.host === "https://eu.i.posthog.com") &&
    typeof v.anonymousId === "string" &&
    uuid.test(v.anonymousId) &&
    typeof v.distinctId === "string" &&
    v.distinctId.length > 0 &&
    v.distinctId.length <= 256 &&
    typeof v.identified === "boolean" &&
    typeof v.expiresAt === "number" &&
    Number.isFinite(v.expiresAt) &&
    v.expiresAt > now
  );
}

/**
 * Adapters must synchronously stop all capture and clear SDK identity in stop().
 * Server-side revocation is observed on refresh; the local lease is capped at
 * 30 seconds. A suspended process can delay timers until it resumes.
 */
export function createTelemetryLeaseController(options: {
  origin: string;
  transport: typeof fetch;
  adapter: Adapter;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  let token: string | null = null;
  let anonymousId: string | undefined;
  let controller: AbortController | undefined;
  let refresh: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let activeLease: TelemetryLease | undefined;

  function stop() {
    generation++;
    controller?.abort();
    clearTimeout(refresh);
    clearTimeout(expiry);
    refresh = expiry = undefined;
    activeLease = undefined;
    if (active) {
      active = false;
      try {
        options.adapter.stop();
      } catch {
        // Telemetry failures must not affect the application.
      }
    }
  }

  async function acquire(epoch: number) {
    controller = new AbortController();
    try {
      const response = await options.transport(
        `${options.origin}/telemetry/bootstrap`,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(anonymousId ? { anonymousId } : {}),
          signal: controller.signal,
        },
      );
      if (!response.ok || response.status !== 200)
        throw new Error("bootstrap unavailable");
      const lease: unknown = await response.json();
      if (epoch !== generation) return;
      const time = now();
      if (
        !valid(lease, time) ||
        lease.expiresAt - time <= 5_000 ||
        (lease.identified && !token)
      )
        throw new Error("invalid bootstrap");
      // A delayed response must never extend local authorization past 30 seconds.
      const remaining = Math.min(lease.expiresAt - time, 30_000);
      const bounded = { ...lease, expiresAt: time + remaining };
      const unchanged =
        active &&
        activeLease &&
        activeLease.expiresAt > time &&
        activeLease.projectToken === lease.projectToken &&
        activeLease.host === lease.host &&
        activeLease.distinctId === lease.distinctId &&
        activeLease.anonymousId === lease.anonymousId &&
        activeLease.identified === lease.identified;
      if (unchanged && options.adapter.renew) {
        options.adapter.renew(bounded);
      } else {
        if (active) options.adapter.stop();
        active = true;
        options.adapter.start(bounded);
      }
      activeLease = bounded;
      anonymousId = lease.anonymousId;
      clearTimeout(refresh);
      clearTimeout(expiry);
      expiry = setTimeout(stop, remaining);
      refresh = setTimeout(
        () => void acquire(epoch),
        Math.max(0, remaining - 5_000),
      );
    } catch {
      if (epoch === generation) stop();
    }
  }

  return {
    update(input: { enabled: boolean; token: string | null }) {
      const changed = token !== input.token;
      const sameSession =
        token === input.token ||
        (token !== null &&
          input.token !== null &&
          sessionId(token) !== null &&
          sessionId(token) === sessionId(input.token));
      if (input.enabled && sameSession && active) {
        // Cancel the superseded request, but retain the original expiry fence.
        generation++;
        controller?.abort();
        clearTimeout(refresh);
        refresh = undefined;
      } else stop();
      if (
        !input.enabled ||
        (changed &&
          token !== null &&
          sessionId(token) !== sessionId(input.token))
      )
        anonymousId = undefined;
      token = input.token;
      if (input.enabled && (!token || sessionId(token)))
        void acquire(generation);
    },
    stop,
  };
}
