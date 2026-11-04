/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as authSetup from "../authSetup.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as mcpEnterprise_internal from "../mcpEnterprise/internal.js";
import type * as mcpEnterprise_provision from "../mcpEnterprise/provision.js";
import type * as mcpEnterprise_validator from "../mcpEnterprise/validator.js";
import type * as users_index from "../users/index.js";
import type * as users_internal from "../users/internal.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authEmail: typeof authEmail;
  authSetup: typeof authSetup;
  emails: typeof emails;
  http: typeof http;
  mcp: typeof mcp;
  "mcpEnterprise/internal": typeof mcpEnterprise_internal;
  "mcpEnterprise/provision": typeof mcpEnterprise_provision;
  "mcpEnterprise/validator": typeof mcpEnterprise_validator;
  "users/index": typeof users_index;
  "users/internal": typeof users_internal;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  mcp: import("@convex-dev/mcp/_generated/component.js").ComponentApi<"mcp">;
};
