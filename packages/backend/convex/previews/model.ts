import { ConvexError, v } from "convex/values";
import { platformNames } from "../apps/model";

export const previewPlatformNames = [
  "web",
  "android",
  "ios",
  "macos",
  "windows",
  "linux",
  "api",
  "mcp",
  "sdk",
  "cli",
] as const;
export const platformKey = (name: (typeof platformNames)[number]) =>
  name === "typescript-sdk" ? "sdk" : name;
export const previewIdentity = { appId: v.string(), reference: v.string() };
const link = v.optional(v.union(v.string(), v.null()));
export const release = v.object({
  revision: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("building"),
    v.literal("ready"),
    v.literal("failed"),
  ),
  version: v.optional(v.string()),
  commitSha: v.optional(v.string()),
  url: link,
  githubReleaseUrl: link,
  artifactUrl: link,
  updateUrl: link,
});
export const platformState = v.union(
  v.object({ enabled: v.literal(false) }),
  v.object({
    enabled: v.literal(true),
    url: v.optional(v.string()),
    latest: v.optional(release),
  }),
);
export const deployment = v.object({
  name: v.string(),
  reference: v.string(),
  convexUrl: v.string(),
  convexSiteUrl: v.string(),
});
export const previewFields = {
  ...previewIdentity,
  githubUrl: link,
  platforms: v.object(
    Object.fromEntries(
      previewPlatformNames.map((name) => [name, platformState]),
    ) as Record<(typeof previewPlatformNames)[number], typeof platformState>,
  ),
  deployment: v.optional(deployment),
  updatedAt: v.number(),
};
export const previewResult = v.object(previewFields);
export function validateReference(reference: string) {
  if (
    !reference ||
    reference !== reference.trim() ||
    reference.length > 200 ||
    [...reference].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new ConvexError(
      "Provide a branch, worktree, or PR name (1–200 characters, no whitespace).",
    );
  return reference;
}
export function initialPlatforms(enabled: readonly string[]) {
  return Object.fromEntries(
    platformNames.map((name) => [
      platformKey(name),
      { enabled: enabled.includes(name) },
    ]),
  ) as Record<
    (typeof previewPlatformNames)[number],
    { enabled: true } | { enabled: false }
  >;
}
export function validateLink(value: string | null | undefined, github = false) {
  if (value == null || value === "") return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConvexError("Invalid preview URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (github && url.hostname !== "github.com")
  )
    throw new ConvexError(
      "Preview links must use HTTPS; GitHub links must be on github.com.",
    );
}
