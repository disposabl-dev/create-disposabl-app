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
