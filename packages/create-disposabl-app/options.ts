export const platforms = [
  { id: "web", label: "Web", group: "Required", status: "required" },
  { id: "android", label: "Android", group: "Mobile", status: "available" },
  { id: "ios", label: "iOS", group: "Mobile", status: "available" },
  { id: "windows", label: "Windows", group: "Desktop", status: "available" },
  { id: "linux", label: "Linux", group: "Desktop", status: "available" },
  { id: "macos", label: "macOS", group: "Desktop", status: "available" },
  {
    id: "mcp",
    label: "MCP",
    group: "MCP & plugins",
    status: "available",
    description: "Tools for AI assistants",
  },
  {
    id: "openai-plugin",
    label: "OpenAI Plugin",
    description: "Tools and skills for OpenAI",
    group: "MCP & plugins",
    status: "available",
  },
  {
    id: "claude-code-plugin",
    label: "Claude Code Plugin",
    description: "Tools and skills for Claude Code",
    group: "MCP & plugins",
    status: "available",
  },
  { id: "api", label: "API", group: "Coming soon", status: "disabled" },
  { id: "cli", label: "CLI", group: "Coming soon", status: "disabled" },
  {
    id: "python-sdk",
    label: "Python SDK",
    group: "Coming soon",
    status: "disabled",
  },
  {
    id: "typescript-sdk",
    label: "TypeScript SDK",
    group: "Coming soon",
    status: "disabled",
  },
] as const;

export const platformDependencies = {
  "openai-plugin": ["mcp"],
  "claude-code-plugin": ["mcp"],
} as const;

export const features = [
  { id: "docs", label: "Docs", hint: "apps/docs" },
  { id: "blog", label: "Blog", hint: "apps/blog" },
  { id: "changelog", label: "Changelog", hint: "apps/changelog" },
  {
    id: "authentication",
    label: "Authentication",
    hint: "Record selection only",
  },
] as const;

export type Platform = (typeof platforms)[number]["id"];
export type Feature = (typeof features)[number]["id"];
export type DisposablConfig = {
  version: string;
  platforms: Platform[];
  features: Feature[];
};

const parseList = (input: string): string[] =>
  input.split(",").map((value) => value.trim());

export function selectPlatforms(input = "web"): Platform[] {
  const requested = parseList(input);
  for (const id of requested) {
    const option = platforms.find((platform) => platform.id === id);
    if (!option)
      throw new Error(
        "Unknown platform " +
          JSON.stringify(id) +
          ". Use --list-options to see valid IDs.",
      );
    if (option.status === "disabled")
      throw new Error(
        option.label + " is not available yet and cannot be selected.",
      );
  }
  for (const [plugin, dependencies] of Object.entries(platformDependencies)) {
    if (requested.includes(plugin)) requested.push(...dependencies);
  }
  return platforms
    .filter((option) => option.id === "web" || requested.includes(option.id))
    .map((option) => option.id);
}

export function selectFeatures(input = "none"): Feature[] {
  if (input === "none") return [];
  const requested = parseList(input);
  for (const id of requested) {
    if (!features.some((feature) => feature.id === id)) {
      throw new Error(
        "Unknown feature " +
          JSON.stringify(id) +
          ". Use --features none or --list-options to see valid IDs.",
      );
    }
  }
  return features
    .filter((option) => requested.includes(option.id))
    .map((option) => option.id);
}

export function selectedFolders(config: DisposablConfig): string[] {
  const result = ["apps/web"];
  if (
    config.platforms.some(
      (platform) => platform === "android" || platform === "ios",
    )
  )
    result.push("apps/mobile");
  if (
    config.platforms.some((platform) =>
      ["windows", "linux", "macos"].includes(platform),
    )
  )
    result.push("apps/desktop");
  for (const feature of config.features) {
    if (feature !== "authentication") result.push("apps/" + feature);
  }
  return result;
}

export function validateName(name: string): string | undefined {
  if (
    !/^[a-z0-9][a-z0-9._-]*$/.test(name) ||
    name.length > 214 ||
    ["node_modules", "favicon.ico"].includes(name)
  ) {
    return "Use a lowercase project name with letters, numbers, dots, hyphens, or underscores.";
  }
}
