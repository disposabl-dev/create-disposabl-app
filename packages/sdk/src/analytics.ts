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

export type SdkAnalyticsEvent = {
  operation: SdkOperation;
  outcome: "success" | "error";
};

/** Opt in explicitly; capture should send to the application owner's project. */
export function createSdkAnalytics(config: {
  enabled: boolean;
  environment: "production" | "development" | "test";
  e2e?: boolean;
  capture: (event: SdkAnalyticsEvent) => void | Promise<void>;
}) {
  const enabled =
    config.enabled &&
    config.environment === "production" &&
    !config.e2e &&
    !(
      (globalThis as { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.E2E_TELEMETRY_DISABLED === "1"
    );
  function capture(operation: SdkOperation, outcome: "success" | "error") {
    if (!enabled || !operations.has(operation)) return;
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
    async track<T>(
      operation: SdkOperation,
      call: () => Promise<T>,
    ): Promise<T> {
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
