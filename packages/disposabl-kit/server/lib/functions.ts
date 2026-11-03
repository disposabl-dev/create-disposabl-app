import { getAuthUserId } from "@convex-dev/auth/server";
import type { Auth } from "convex/server";
import {
  v,
  type GenericValidator,
  type PropertyValidators,
} from "convex/values";
import {
  internalAction as nativeAction,
  internalMutation as nativeMutation,
  internalQuery as nativeQuery,
} from "../../../backend/convex/_generated/server";

// Trusted server entrypoints must supply the user ID after authentication.
export const identityFields = {
  userId: v.string(),
};

const withPlatforms = <TDefinition, TResult extends object>(
  builder: (definition: TDefinition) => TResult,
) => {
  return (
    definition: TDefinition & {
      args: PropertyValidators;
      returns: GenericValidator;
      platforms?: true;
    },
  ): TResult => {
    return Object.assign(builder(definition), {
      platforms: definition.platforms,
      args: definition.args,
      returns: definition.returns,
    });
  };
};

export const internalQuery = withPlatforms(nativeQuery);
export const internalMutation = withPlatforms(nativeMutation);
export const internalAction = withPlatforms(nativeAction);

// The MCP alpha types its callback as auth-only; Convex Auth reboot also
// checks the live session via runQuery. Actual Convex function contexts have it.
export async function getSessionUserId(ctx: { auth: Auth }) {
  if (!("runQuery" in ctx) || typeof ctx.runQuery !== "function")
    throw new Error(
      "Session authentication requires a Convex function context.",
    );
  return getAuthUserId(ctx as Parameters<typeof getAuthUserId>[0]);
}
