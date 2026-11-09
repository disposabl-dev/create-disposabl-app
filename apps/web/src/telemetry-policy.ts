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
    source: "web" | "desktop";
    projectToken: string;
    distinctId: string;
  },
) {
  if (!input.active || input.now >= input.deadline) return null;
  const common = {
    token: input.projectToken,
    distinct_id: input.distinctId,
    platform: input.source,
  };
  if (event === "$pageview")
    return { ...common, page: pageCategory(input.page) };
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
