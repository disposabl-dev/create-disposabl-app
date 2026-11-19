import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { guideLessons } from "../../../disposabl-kit/guides";

const lessonIds = new Set(guideLessons.map(({ id }) => id));

export function requireLesson(lessonId: string) {
  if (!lessonIds.has(lessonId)) throw new ConvexError("Guide not found.");
}

export function clearGuideLikes(ctx: MutationCtx, userId: Id<"users">) {
  return ctx.runMutation(components.reactions.lib.clearUser, { userId });
}
