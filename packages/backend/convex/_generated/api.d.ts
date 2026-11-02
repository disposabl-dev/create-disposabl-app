/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apps_actions_create from "../apps/actions/create.js";
import type * as apps_internal from "../apps/internal.js";
import type * as auth from "../auth.js";
import type * as github_actions_http from "../github/actions/http.js";
import type * as github_actions_internal from "../github/actions/internal.js";
import type * as github_actions_oidc from "../github/actions/oidc.js";
import type * as github_actions_provision from "../github/actions/provision.js";
import type * as github_actions_tokens from "../github/actions/tokens.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as previews_internal from "../previews/internal.js";
import type * as previews_token_actions_create from "../previews/token/actions/create.js";
import type * as previews_token_actions_management from "../previews/token/actions/management.js";
import type * as previews_token_internal from "../previews/token/internal.js";
import type * as releases_internal from "../releases/internal.js";
import type * as users_index from "../users/index.js";
import type * as users_internal from "../users/internal.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "apps/actions/create": typeof apps_actions_create;
  "apps/internal": typeof apps_internal;
  auth: typeof auth;
  "github/actions/http": typeof github_actions_http;
  "github/actions/internal": typeof github_actions_internal;
  "github/actions/oidc": typeof github_actions_oidc;
  "github/actions/provision": typeof github_actions_provision;
  "github/actions/tokens": typeof github_actions_tokens;
  http: typeof http;
  mcp: typeof mcp;
  "previews/internal": typeof previews_internal;
  "previews/token/actions/create": typeof previews_token_actions_create;
  "previews/token/actions/management": typeof previews_token_actions_management;
  "previews/token/internal": typeof previews_token_internal;
  "releases/internal": typeof releases_internal;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
