/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as mcpEnterprise_internal from "../mcpEnterprise/internal.js";
import type * as mcpEnterprise_provision from "../mcpEnterprise/provision.js";
import type * as mcpEnterprise_validator from "../mcpEnterprise/validator.js";
import type * as users_index from "../users/index.js";
import type * as users_internal from "../users/internal.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  mcp: typeof mcp;
  "mcpEnterprise/internal": typeof mcpEnterprise_internal;
  "mcpEnterprise/provision": typeof mcpEnterprise_provision;
  "mcpEnterprise/validator": typeof mcpEnterprise_validator;
  "users/index": typeof users_index;
  "users/internal": typeof users_internal;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  mcp: import("@convex-dev/mcp/_generated/component.js").ComponentApi<"mcp">;
};
