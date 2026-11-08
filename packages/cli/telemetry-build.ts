/** Public ingestion configuration only. Personal API keys must never be bundled. */
export function telemetryBuildDefine(version: string, env = process.env) {
  const token = env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN ?? "";
  const host = env.DISPOSABL_CLI_POSTHOG_HOST ?? "";
  const valid =
    /^phc_[a-zA-Z0-9]+$/.test(token) &&
    ["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host);
  if ((token || host) && !valid)
    throw new Error(
      "Invalid central PostHog public project token or ingestion host.",
    );
  if (
    !valid &&
    (version !== "0.0.0-development" ||
      env.DISPOSABL_CLI_TELEMETRY_REQUIRED === "1")
  )
    throw new Error(
      "Release requires the central public PostHog project token and ingestion host.",
    );
  return {
    "process.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN": JSON.stringify(token),
    "process.env.DISPOSABL_CLI_POSTHOG_HOST": JSON.stringify(host),
  };
}
