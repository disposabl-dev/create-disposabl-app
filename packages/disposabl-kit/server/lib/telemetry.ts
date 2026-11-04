/** Only explicitly enabled deployments may send analytics. Never send request data. */
export async function captureTelemetry(
  event:
    | "api_operation"
    | "mcp_operation"
    | "page_view"
    | "screen_view"
    | "app_setup",
  properties: {
    source?: "api" | "cli" | "sdk" | "mcp";
    operation?: string;
    outcome?: "success" | "error";
    page?: string;
    duration_ms?: number;
  },
) {
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST;
  if (
    process.env.POSTHOG_ENABLED !== "true" ||
    !token ||
    !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(
      host ?? "",
    )
  )
    return;
  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      signal: AbortSignal.timeout(2000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event,
        properties: {
          distinct_id: crypto.randomUUID(),
          ...(properties.source && { source: properties.source }),
          ...(properties.operation && { operation: properties.operation }),
          ...(properties.outcome && { outcome: properties.outcome }),
          ...(properties.page && { page: properties.page }),
          ...(properties.duration_ms !== undefined && {
            duration_ms: properties.duration_ms,
          }),
          environment: "production",
          $process_person_profile: false,
          $ip: "0.0.0.0",
        },
      }),
    });
    if (!response.ok) console.warn("PostHog capture failed.");
  } catch {
    // Analytics must never interrupt a request.
  }
}
