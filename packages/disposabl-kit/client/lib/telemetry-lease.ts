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
  let enabled = false;
  let failures = 0;
  let token: string | null = null;
  let anonymousId: string | undefined;
  let controller: AbortController | undefined;
  let refresh: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let activeLease: TelemetryLease | undefined;

  function halt() {
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

  function stop() {
    enabled = false;
    halt();
  }

  function recover(retryable: boolean) {
    halt();
    if (!enabled || !retryable) return;
    const epoch = generation;
    const delay = Math.min(1_000 * 2 ** Math.min(failures++, 5), 30_000);
    refresh = setTimeout(() => void acquire(epoch), delay);
  }

  async function acquire(epoch: number) {
    if (!enabled || epoch !== generation) return;
    controller = new AbortController();
    let retryable = true;
    const timeout = setTimeout(() => {
      if (epoch === generation) recover(true);
    }, 10_000);
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
      if (epoch !== generation) return;
      if (response.status === 401) anonymousId = undefined;
      retryable = response.status === 429 || response.status >= 500;
      if (!response.ok || response.status !== 200)
        throw new Error("bootstrap unavailable");
      let lease: unknown;
      try {
        lease = await response.json();
      } catch (error) {
        // A truncated transport is recoverable; malformed JSON is not a lease.
        retryable = !(error instanceof SyntaxError);
        throw error;
      }
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
        if (active) {
          active = false;
          options.adapter.stop();
          if (epoch !== generation) return;
        }
        active = true;
        options.adapter.start(bounded);
      }
      if (epoch !== generation) return;
      failures = 0;
      activeLease = bounded;
      anonymousId = lease.anonymousId;
      clearTimeout(refresh);
      clearTimeout(expiry);
      expiry = setTimeout(() => recover(true), remaining);
      refresh = setTimeout(
        () => void acquire(epoch),
        Math.max(0, remaining - 5_000),
      );
    } catch {
      if (epoch === generation) recover(retryable);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    update(input: { enabled: boolean; token: string | null }) {
      enabled = input.enabled && (!input.token || !!sessionId(input.token));
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
      } else halt();
      if (
        !input.enabled ||
        (changed &&
          token !== null &&
          sessionId(token) !== sessionId(input.token))
      )
        anonymousId = undefined;
      token = input.token;
      if (enabled) void acquire(generation);
    },
    stop,
  };
}
