/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account_internal from "../account/internal.js";
import type * as apps_internal from "../apps/internal.js";
import type * as apps_model from "../apps/model.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as previews_internal from "../previews/internal.js";
import type * as previews_model from "../previews/model.js";
import type * as previews_token_internal from "../previews/token/internal.js";
import type * as previews_token_management from "../previews/token/management.js";
import type * as previews_token_state from "../previews/token/state.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "account/internal": typeof account_internal;
  "apps/internal": typeof apps_internal;
  "apps/model": typeof apps_model;
  auth: typeof auth;
  http: typeof http;
  mcp: typeof mcp;
  "previews/internal": typeof previews_internal;
  "previews/model": typeof previews_model;
  "previews/token/internal": typeof previews_token_internal;
  "previews/token/management": typeof previews_token_management;
  "previews/token/state": typeof previews_token_state;
  users: typeof users;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
