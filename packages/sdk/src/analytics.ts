/** Metadata sent to an application owner's analytics sink, never request data. */
export type SdkOperation =
  | "agentAbortMessage"
  | "agentGetMessages"
  | "agentSendMessage"
  | "appsCreate"
  | "appsDelete"
  | "appsGet"
  | "appsList"
  | "appsRepositoryToken"
  | "appsRequestConfiguration"
  | "appsUpdate"
  | "connectionsStatus"
  | "previewsGet"
  | "previewsList"
  | "previewsTokenCreate"
  | "releasesGet"
  | "usersCurrent";

const operations = new Set<SdkOperation>([
  "agentAbortMessage",
  "agentGetMessages",
  "agentSendMessage",
  "appsCreate",
  "appsDelete",
  "appsGet",
  "appsList",
  "appsRepositoryToken",
  "appsRequestConfiguration",
  "appsUpdate",
  "connectionsStatus",
  "previewsGet",
  "previewsList",
  "previewsTokenCreate",
  "releasesGet",
  "usersCurrent",
]);

export type SdkAnalyticsEvent<Operation extends string = SdkOperation> = {
  operation: Operation;
  outcome: "success" | "error";
};

/** Opt in explicitly; capture should send to the application owner's project. */
export function createSdkAnalytics<
  const Operation extends string = SdkOperation,
>(config: {
  enabled?: boolean;
  environment: "production" | "development" | "test";
  e2e?: boolean;
  /** Fixed SDK operation IDs, for APIs generated from the owner's contract. */
  operations?: readonly Operation[];
  capture: (event: SdkAnalyticsEvent<Operation>) => void | Promise<void>;
}) {
  const allowed: ReadonlySet<string> = config.operations
    ? new Set(
        config.operations.filter((name) =>
          /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name),
        ),
      )
    : operations;
  function capture(operation: Operation, outcome: "success" | "error") {
    const env = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    if (
      config.enabled === false ||
      config.environment !== "production" ||
      config.e2e ||
      env?.E2E_TELEMETRY_DISABLED === "1" ||
      env?.DO_NOT_TRACK === "1" ||
      (typeof navigator !== "undefined" && navigator.doNotTrack === "1") ||
      !allowed.has(operation)
    )
      return;
    try {
      void Promise.resolve(config.capture({ operation, outcome })).catch(
        () => {},
      );
    } catch {
      // Analytics must not affect an SDK call.
    }
  }
  return {
    /** Wrap a generated SDK call; handles both thrown and returned errors. */
    async track<T>(operation: Operation, call: () => Promise<T>): Promise<T> {
      try {
        const result = await call();
        const failed =
          result !== null &&
          typeof result === "object" &&
          "error" in result &&
          result.error != null;
        capture(operation, failed ? "error" : "success");
        return result;
      } catch (error) {
        capture(operation, "error");
        throw error;
      }
    },
  };
}
