import {
  platforms,
  resolvePlatforms,
  type Platform,
} from "../disposabl-kit/platforms";
export {
  platforms,
  platformDependencies,
  type Platform,
} from "../disposabl-kit/platforms";

export const features = [
  { id: "docs", label: "Docs", hint: "apps/docs" },
  {
    id: "authentication",
    label: "Authentication",
    hint: "Frontend sign-in and sign-up",
  },
] as const;

export type Feature = (typeof features)[number]["id"];
export const requiredFeatures: readonly Feature[] = [];
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
  }
  return resolvePlatforms(requested);
}

export function selectFeatures(input = "authentication"): Feature[] {
  const requested = input === "none" ? [] : parseList(input);
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
  if (config.platforms.includes("cli")) result.push("packages/cli");
  if (config.platforms.includes("typescript-sdk")) result.push("packages/sdk");
  if (
    config.platforms.some(
      (platform) => platform === "android" || platform === "ios",
    )
  )
    result.push("apps/mobile");
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
