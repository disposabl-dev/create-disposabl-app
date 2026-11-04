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

import {
  resolveFeatures,
  type Feature,
} from "../disposabl-kit/feature-options";
export {
  features,
  featureDependencies,
  type Feature,
} from "../disposabl-kit/feature-options";
export const requiredFeatures: readonly Feature[] = [];
export type DisposablConfig = {
  appId?: string;
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
  return resolveFeatures(input === "none" ? [] : parseList(input));
}

export function selectedFolders(config: DisposablConfig): string[] {
  const result = ["apps/web"];
  if (config.platforms.includes("typescript-sdk")) result.push("packages/sdk");
  if (
    config.platforms.some(
      (platform) => platform === "android" || platform === "ios",
    )
  )
    result.push("apps/mobile");
  if (
    config.platforms.some((platform) =>
      ["macos", "windows", "linux"].includes(platform),
    )
  )
    result.push("apps/desktop");
  if (config.features.includes("docs")) result.push("apps/docs");
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
