/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_activation from "../agent/activation.js";
import type * as agent_access from "../agent/access.js";
import type * as agent_actions_compute from "../agent/actions/compute.js";
import type * as agent_actions_run from "../agent/actions/run.js";
import type * as agent_api_policy from "../agent/api_policy.js";
import type * as agent_attachments from "../agent/attachments.js";
import type * as agent_boat from "../agent/boat.js";
import type * as agent_bootstrap from "../agent/bootstrap.js";
import type * as agent_compute from "../agent/compute.js";
import type * as agent_computeDebit from "../agent/computeDebit.js";
import type * as agent_computeRecovery from "../agent/computeRecovery.js";
import type * as agent_computeValidator from "../agent/computeValidator.js";
import type * as agent_credits from "../agent/credits.js";
import type * as agent_events from "../agent/events.js";
import type * as agent_index from "../agent/index.js";
import type * as agent_internal from "../agent/internal.js";
import type * as agent_state from "../agent/state.js";
import type * as agent_threads from "../agent/threads.js";
import type * as agent_validator from "../agent/validator.js";
import type * as apps_actions_billing from "../apps/actions/billing.js";
import type * as apps_actions_cleanup from "../apps/actions/cleanup.js";
import type * as apps_actions_create from "../apps/actions/create.js";
import type * as apps_actions_delete from "../apps/actions/delete.js";
import type * as apps_actions_expo from "../apps/actions/expo.js";
import type * as apps_actions_posthog from "../apps/actions/posthog.js";
import type * as apps_actions_repository from "../apps/actions/repository.js";
import type * as apps_actions_setup from "../apps/actions/setup.js";
import type * as apps_index from "../apps/index.js";
import type * as apps_internal from "../apps/internal.js";
import type * as apps_operations_internal from "../apps/operations/internal.js";
import type * as apps_posthog from "../apps/posthog.js";
import type * as apps_validator from "../apps/validator.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as authSetup from "../authSetup.js";
import type * as billing from "../billing.js";
import type * as billingHandoff from "../billingHandoff.js";
import type * as browserHandoff from "../browserHandoff.js";
import type * as connections_actions_autumn from "../connections/actions/autumn.js";
import type * as connections_actions_credentials from "../connections/actions/credentials.js";
import type * as connections_actions_expo from "../connections/actions/expo.js";
import type * as connections_actions_github from "../connections/actions/github.js";
import type * as connections_actions_oauth from "../connections/actions/oauth.js";
import type * as connections_actions_posthog from "../connections/actions/posthog.js";
import type * as connections_config from "../connections/config.js";
import type * as connections_http from "../connections/http.js";
import type * as connections_index from "../connections/index.js";
import type * as connections_internal from "../connections/internal.js";
import type * as connections_posthog from "../connections/posthog.js";
import type * as connections_validator from "../connections/validator.js";
import type * as desktopUpdates from "../desktopUpdates.js";
import type * as desktopUpdates_validator from "../desktopUpdates/validator.js";
import type * as downloads_action from "../downloads/action.js";
import type * as downloads_http from "../downloads/http.js";
import type * as downloads_index from "../downloads/index.js";
import type * as downloads_internal from "../downloads/internal.js";
import type * as emails from "../emails.js";
import type * as files_guard from "../files/guard.js";
import type * as files_index from "../files/index.js";
import type * as files_internal from "../files/internal.js";
import type * as github_actions_http from "../github/actions/http.js";
import type * as github_actions_internal from "../github/actions/internal.js";
import type * as github_actions_oidc from "../github/actions/oidc.js";
import type * as github_actions_provision from "../github/actions/provision.js";
import type * as github_actions_secrets from "../github/actions/secrets.js";
import type * as github_actions_signing from "../github/actions/signing.js";
import type * as github_actions_tokens from "../github/actions/tokens.js";
import type * as github_identityCache from "../github/identityCache.js";
import type * as github_internal from "../github/internal.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as previews_index from "../previews/index.js";
import type * as previews_internal from "../previews/internal.js";
import type * as previews_token_actions_create from "../previews/token/actions/create.js";
import type * as previews_token_actions_management from "../previews/token/actions/management.js";
import type * as previews_token_internal from "../previews/token/internal.js";
import type * as product_lowCreditEmail from "../product/lowCreditEmail.js";
import type * as releases_index from "../releases/index.js";
import type * as releases_internal from "../releases/internal.js";
import type * as revenuecat from "../revenuecat.js";
import type * as telemetry from "../telemetry.js";
import type * as users_authDeletion from "../users/authDeletion.js";
import type * as users_deletion from "../users/deletion.js";
import type * as users_ephemeralDeletion from "../users/ephemeralDeletion.js";
import type * as users_fileDeletion from "../users/fileDeletion.js";
import type * as users_index from "../users/index.js";
import type * as users_internal from "../users/internal.js";
import type * as users_localDeletion from "../users/localDeletion.js";
import type * as users_mcpDeletion from "../users/mcpDeletion.js";
import type * as users_validator from "../users/validator.js";
import type * as validator from "../validator.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/activation": typeof agent_activation;
  "agent/access": typeof agent_access;
  "agent/actions/compute": typeof agent_actions_compute;
  "agent/actions/run": typeof agent_actions_run;
  "agent/api_policy": typeof agent_api_policy;
  "agent/attachments": typeof agent_attachments;
  "agent/boat": typeof agent_boat;
  "agent/bootstrap": typeof agent_bootstrap;
  "agent/compute": typeof agent_compute;
  "agent/computeDebit": typeof agent_computeDebit;
  "agent/computeRecovery": typeof agent_computeRecovery;
  "agent/computeValidator": typeof agent_computeValidator;
  "agent/credits": typeof agent_credits;
  "agent/events": typeof agent_events;
  "agent/index": typeof agent_index;
  "agent/internal": typeof agent_internal;
  "agent/state": typeof agent_state;
  "agent/threads": typeof agent_threads;
  "agent/validator": typeof agent_validator;
  "apps/actions/billing": typeof apps_actions_billing;
  "apps/actions/cleanup": typeof apps_actions_cleanup;
  "apps/actions/create": typeof apps_actions_create;
  "apps/actions/delete": typeof apps_actions_delete;
  "apps/actions/expo": typeof apps_actions_expo;
  "apps/actions/posthog": typeof apps_actions_posthog;
  "apps/actions/repository": typeof apps_actions_repository;
  "apps/actions/setup": typeof apps_actions_setup;
  "apps/index": typeof apps_index;
  "apps/internal": typeof apps_internal;
  "apps/operations/internal": typeof apps_operations_internal;
  "apps/posthog": typeof apps_posthog;
  "apps/validator": typeof apps_validator;
  auth: typeof auth;
  authEmail: typeof authEmail;
  authSetup: typeof authSetup;
  billing: typeof billing;
  billingHandoff: typeof billingHandoff;
  browserHandoff: typeof browserHandoff;
  "connections/actions/autumn": typeof connections_actions_autumn;
  "connections/actions/credentials": typeof connections_actions_credentials;
  "connections/actions/expo": typeof connections_actions_expo;
  "connections/actions/github": typeof connections_actions_github;
  "connections/actions/oauth": typeof connections_actions_oauth;
  "connections/actions/posthog": typeof connections_actions_posthog;
  "connections/config": typeof connections_config;
  "connections/http": typeof connections_http;
  "connections/index": typeof connections_index;
  "connections/internal": typeof connections_internal;
  "connections/posthog": typeof connections_posthog;
  "connections/validator": typeof connections_validator;
  desktopUpdates: typeof desktopUpdates;
  "desktopUpdates/validator": typeof desktopUpdates_validator;
  "downloads/action": typeof downloads_action;
  "downloads/http": typeof downloads_http;
  "downloads/index": typeof downloads_index;
  "downloads/internal": typeof downloads_internal;
  emails: typeof emails;
  "files/guard": typeof files_guard;
  "files/index": typeof files_index;
  "files/internal": typeof files_internal;
  "github/actions/http": typeof github_actions_http;
  "github/actions/internal": typeof github_actions_internal;
  "github/actions/oidc": typeof github_actions_oidc;
  "github/actions/provision": typeof github_actions_provision;
  "github/actions/secrets": typeof github_actions_secrets;
  "github/actions/signing": typeof github_actions_signing;
  "github/actions/tokens": typeof github_actions_tokens;
  "github/identityCache": typeof github_identityCache;
  "github/internal": typeof github_internal;
  http: typeof http;
  mcp: typeof mcp;
  "previews/index": typeof previews_index;
  "previews/internal": typeof previews_internal;
  "previews/token/actions/create": typeof previews_token_actions_create;
  "previews/token/actions/management": typeof previews_token_actions_management;
  "previews/token/internal": typeof previews_token_internal;
  "product/lowCreditEmail": typeof product_lowCreditEmail;
  "releases/index": typeof releases_index;
  "releases/internal": typeof releases_internal;
  revenuecat: typeof revenuecat;
  telemetry: typeof telemetry;
  "users/authDeletion": typeof users_authDeletion;
  "users/deletion": typeof users_deletion;
  "users/ephemeralDeletion": typeof users_ephemeralDeletion;
  "users/fileDeletion": typeof users_fileDeletion;
  "users/index": typeof users_index;
  "users/internal": typeof users_internal;
  "users/localDeletion": typeof users_localDeletion;
  "users/mcpDeletion": typeof users_mcpDeletion;
  "users/validator": typeof users_validator;
  validator: typeof validator;
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
  authGoogle: import("@convex-dev/auth/components/google/_generated/component.js").ComponentApi<"authGoogle">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  mcp: import("@convex-dev/mcp/_generated/component.js").ComponentApi<"mcp">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  boat: import("@boatdev/convex/_generated/component.js").ComponentApi<"boat">;
};
