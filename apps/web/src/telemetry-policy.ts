import { pageCategory } from "../../../packages/disposabl-kit/lib/telemetry";

// Only server-provided IDs and fixed categories leave the browser.
export function safeTelemetryEvent(
  event: string,
  input: {
    active: boolean;
    deadline: number;
    now: number;
    page: string;
    action?: string;
    sessionId?: unknown;
    windowId?: unknown;
    source: "web" | "desktop";
    projectToken: string;
    distinctId: string;
  },
) {
  if (!input.active || input.now >= input.deadline) return null;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const common = {
    token: input.projectToken,
    distinct_id: input.distinctId,
    platform: input.source,
    ...(typeof input.sessionId === "string" && uuid.test(input.sessionId)
      ? { $session_id: input.sessionId }
      : {}),
    ...(typeof input.windowId === "string" && uuid.test(input.windowId)
      ? { $window_id: input.windowId }
      : {}),
  };
  if (event === "$pageview") {
    const page = pageCategory(input.page);
    const paths: Record<string, string> = {
      home: "/",
      dashboard: "/dashboard",
      connections: "/dashboard/connections",
      login: "/login",
      signup: "/signup",
      account: "/account",
    };
    return {
      ...common,
      page,
      ...(paths[page]
        ? { $current_url: `https://www.disposabl.dev${paths[page]}` }
        : {}),
    };
  }
  if (
    event === "product_action" &&
    (input.action === "open_connections" || input.action === "open_api_keys")
  )
    return { ...common, action: input.action };
  if (event === "$exception")
    return {
      ...common,
      $exception_list: [
        {
          type: "Error",
          value: "Client error",
          mechanism: { handled: false, synthetic: true },
        },
      ],
    };
  return null;
}
