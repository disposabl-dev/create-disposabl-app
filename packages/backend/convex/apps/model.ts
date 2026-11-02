import { ConvexError, v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const platformNames = [
  "web",
  "android",
  "ios",
  "macos",
  "windows",
  "linux",
  "api",
  "mcp",
  "typescript-sdk",
  "cli",
] as const;
export const platform = v.union(
  ...platformNames.map((name) => v.literal(name)),
);
export const appFields = {
  appId: v.string(),
  name: v.string(),
  platforms: v.array(platform),
};
export const appResult = v.object({ ...appFields, createdAt: v.number() });
export type AppResult = Infer<typeof appResult>;
export const appArgs = {
  name: v.string(),
  platforms: v.array(platform),
  appId: v.optional(v.string()),
};
export const appIdentity = { appId: v.string() };
export function assertAppId(appId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      appId,
    )
  )
    throw new ConvexError("appId must be a lowercase UUID v4.");
}
export async function ownedApp(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  appId: string,
) {
  assertAppId(appId);
  const app = await ctx.db
    .query("apps")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();
  if (!app || app.deletedAt !== undefined || app.userId !== userId)
    throw new ConvexError("App not found.");
  return app;
}
export function presentApp(app: Doc<"apps">): AppResult {
  return {
    appId: app.appId,
    name: app.name,
    platforms: app.platforms,
    createdAt: app._creationTime,
  };
}
