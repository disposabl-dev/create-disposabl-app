import { getSessionUserId } from "./lib/functions";
import { McpServer } from "@convex-dev/mcp";
import { httpActionGeneric, httpRouter } from "convex/server";
import { components } from "../../backend/convex/_generated/api";
import { env } from "../../backend/convex/_generated/server";
import modules from "../../backend/generated/platforms";
import openapi from "../../backend/generated/openapi.json";
import config from "../../../disposabl.json";
import { authenticationEnabled } from "../features";
import { validatePlatforms } from "../platforms";
// docs:start
import { registerDocsRoutes } from "./lib/docs";
// docs:end
import {
  createOpenApi,
  createPlatforms,
  type ApiPolicy,
  type AccountEligibility,
} from "./lib/platform-spec";
import { registerPageRoutes } from "./lib/static";
import { resend } from "../../backend/convex/emails";
import { googleRelay } from "./google";
import { mobileAuthPath, mobileAuthRedirect } from "../lib/mobile-auth";
import { desktopAuthPath, desktopAuthRedirect } from "../lib/desktop-auth";

export { tool } from "@convex-dev/mcp";
export type { McpServerOptions, McpUser, ToolCtx } from "@convex-dev/mcp";
export type { ApiPolicy, AccountEligibility } from "./lib/platform-spec";

const platforms = createPlatforms(modules);
if (
  JSON.stringify(createOpenApi(platforms.spec).paths) !==
  JSON.stringify(openapi.paths)
)
  throw new Error(
    "Generated API contract is stale. Run bun run generate; review incompatible changes before using --accept-breaking.",
  );
export const platformSpec = platforms.spec;

const enabled = validatePlatforms(config.platforms);
function createMcp(eligibility?: AccountEligibility): McpServer | undefined {
  return enabled.some((platform) => platform === "mcp" || platform === "api")
    ? new McpServer(components.mcp, {
        name: "disposabl",
        title: "Disposabl",
        version: "1.0.0",
        siteUrl: env.CONVEX_SITE_URL,
        consentUrl: `${env.CONVEX_SITE_URL}/consent`,
        scopes: {},
        clientMetadataDocumentHosts: ["claude.ai"],
        tools: eligibility
          ? createPlatforms(modules, eligibility).tools
          : platforms.tools,
      })
    : undefined;
}

/** Protect issuance while retaining listing and revocation for existing grants. */
export function createMcpApi(eligibility?: AccountEligibility) {
  const mcp = createMcp(eligibility);
  if (!mcp) return {} as ReturnType<McpServer["api"]>;
  const standard = mcp.api({ getUserId: getSessionUserId });
  if (!eligibility) return standard;
  const guarded = mcp.api({
    getUserId: async (ctx) => {
      const id = await getSessionUserId(ctx);
      return id &&
        (await eligibility(ctx as Parameters<AccountEligibility>[0], id))
        ? id
        : null;
    },
  });
  return {
    ...standard,
    authorize: guarded.authorize,
    createApiKey: guarded.createApiKey,
  };
}
export const {
  getAuthRequest,
  authorize,
  listConnections,
  revokeConnection,
  createApiKey,
} = createMcpApi();

export default function createHttpRouter(
  apiPolicy?: ApiPolicy,
  eligibility?: AccountEligibility,
) {
  const mcp = createMcp(eligibility);
  const requestPlatforms = eligibility
    ? createPlatforms(modules, eligibility)
    : platforms;
  const http = httpRouter();
  if (authenticationEnabled) {
    if (
      enabled.some((platform) =>
        ["macos", "windows", "linux"].includes(platform),
      )
    )
      http.route({
        path: desktopAuthPath,
        method: "GET",
        handler: httpActionGeneric(async (_ctx, request) =>
          desktopAuthRedirect(
            request,
            "desktopId" in config ? config.desktopId : null,
          ),
        ),
      });
    if (
      enabled.some((platform) => platform === "ios" || platform === "android")
    )
      http.route({
        path: mobileAuthPath,
        method: "GET",
        handler: httpActionGeneric(async (_ctx, request) =>
          mobileAuthRedirect(request),
        ),
      });
    http.route({
      path: "/.well-known/change-password",
      method: "GET",
      handler: httpActionGeneric(
        async () =>
          new Response(null, {
            status: 302,
            headers: {
              Location:
                process.env.AUTH_GOOGLE_ONLY === "true"
                  ? "/login"
                  : "/change-password",
              "Cache-Control": "no-store",
            },
          }),
      ),
    });
  }
  if (env.RESEND_WEBHOOK_SECRET) {
    http.route({
      path: "/resend-webhook",
      method: "POST",
      handler: httpActionGeneric((ctx, request) =>
        resend.handleResendEventWebhook(ctx, request),
      ),
    });
  }
  http.route({
    path: "/oauth/relay/google",
    method: "GET",
    handler: googleRelay,
  });
  if (mcp) {
    const authRoutes = httpRouter();
    mcp.registerRoutes(authRoutes);
    for (const [path, method, handler] of authRoutes.getRoutes()) {
      if (path !== "/mcp" || enabled.includes("mcp"))
        http.route({ path, method, handler });
    }
  }
  if (mcp && enabled.includes("api")) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-Disposabl-Source",
      "Cache-Control": "no-store",
    };
    http.route({
      path: "/openapi.json",
      method: "GET",
      handler: httpActionGeneric(async () =>
        Response.json(
          { ...openapi, servers: [{ url: env.CONVEX_SITE_URL }] },
          { headers: cors },
        ),
      ),
    });
    for (const method of ["GET", "POST", "OPTIONS"] as const)
      http.route({
        pathPrefix: "/api/",
        method,
        handler: httpActionGeneric(async (ctx, request) => {
          const response =
            method === "OPTIONS"
              ? new Response(null, { status: 204 })
              : await requestPlatforms.handleApi(
                  ctx,
                  request,
                  mcp.authenticate.bind(mcp),
                  apiPolicy,
                );
          for (const [key, value] of Object.entries(cors))
            response.headers.set(key, value);
          return response;
        }),
      });
  }
  // docs:start
  if ((config.features as readonly string[]).includes("docs"))
    registerDocsRoutes(http);
  // docs:end
  registerPageRoutes(http);
  return http;
}
