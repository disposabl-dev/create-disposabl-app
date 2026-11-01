import config from "../../../../disposabl.json";

export type Platforms = boolean | { api?: boolean; mcp?: boolean };

/** The generated app config is the source of truth for enabled transports. */
export function getPlatforms() {
  const enabled = new Set(config.platforms);
  return {
    isApiEnabled:
      enabled.has("api") ||
      enabled.has("cli") ||
      enabled.has("python-sdk") ||
      enabled.has("typescript-sdk"),
    isCliEnabled: enabled.has("cli"),
    isMcpEnabled: enabled.has("mcp"),
    isSdkEnabled: enabled.has("python-sdk") || enabled.has("typescript-sdk"),
    isOpenaiPluginEnabled: enabled.has("openai-plugin"),
    isClaudePluginEnabled: enabled.has("claude-code-plugin"),
  };
}
