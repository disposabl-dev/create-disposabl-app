export const platforms = [
  { id: "web", label: "Web", group: "Required", status: "required" },
  { id: "android", label: "Android", group: "Mobile", status: "available" },
  { id: "ios", label: "iOS", group: "Mobile", status: "available" },
  { id: "macos", label: "macOS", group: "Desktop", status: "available" },
  { id: "windows", label: "Windows", group: "Desktop", status: "available" },
  { id: "linux", label: "Linux", group: "Desktop", status: "available" },
  {
    id: "mcp",
    label: "MCP",
    group: "Developer tools",
    status: "available",
    description: "Tools for AI assistants",
  },
  { id: "api", label: "API", group: "Developer tools", status: "available" },
  { id: "cli", label: "CLI", group: "Developer tools", status: "available" },
  {
    id: "typescript-sdk",
    label: "TypeScript SDK",
    group: "Developer tools",
    status: "available",
  },
] as const;

export type Platform = (typeof platforms)[number]["id"];
export const platformIds = platforms.map(({ id }) => id);
export const requiredPlatform: Platform = "web";
export const platformDependencies: Partial<
  Record<Platform, readonly Platform[]>
> = {
  cli: ["api"],
  "typescript-sdk": ["api"],
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && platformIds.includes(value as Platform);
}
export function parsePlatform(value: unknown): Platform {
  if (isPlatform(value)) return value;
  throw new Error(`Unknown platform ${JSON.stringify(value)}`);
}

/** Validate persisted selections without silently dropping or adding platforms. */
export function validatePlatforms(values: readonly unknown[]): Platform[] {
  const selected = new Set(values.map(parsePlatform));
  if (!selected.has(requiredPlatform)) throw new Error("Web is required");
  for (const id of selected) {
    for (const dependency of platformDependencies[id] ?? []) {
      if (!selected.has(dependency))
        throw new Error(`${id} requires ${dependency}`);
    }
  }
  return platformIds.filter((id) => selected.has(id));
}

/** UI selection adds the required Web platform and dependent transports. */
export function resolvePlatforms(values: readonly unknown[]): Platform[] {
  const selected = new Set(values.map(parsePlatform));
  selected.add(requiredPlatform);
  for (const id of selected)
    for (const dependency of platformDependencies[id] ?? [])
      selected.add(dependency);
  return platformIds.filter((id) => selected.has(id));
}
