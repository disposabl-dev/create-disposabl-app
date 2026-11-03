import { McpServer, type McpUser, type ToolCtx } from "@convex-dev/mcp";
import { httpActionGeneric, httpRouter, type HttpRouter } from "convex/server";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { internal } from "../../../backend/convex/_generated/api";
import {
  claudeIssuer,
  CLAUDE_CLIENT_ID,
  ID_JAG_PROFILE,
  JWT_GRANT,
  TOKEN_PREFIX,
  tokenHash,
} from "./identity";

const headers = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
const invalid = () => json({ error: "invalid_grant" }, 400);

// Only Anthropic's identity host is fetched. Neither JWT headers nor an
// untrusted issuer can supply a URL, and redirects are never followed.
async function identityDocument(
  address: string,
): Promise<Record<string, unknown>> {
  const url = new URL(address);
  if (
    url.origin !== "https://identity.anthropic.com" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Invalid identity document URL");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || !response.body)
    throw new Error("Identity document unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) throw new Error("Identity document too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid identity document");
  return value as Record<string, unknown>;
}

export class EnterpriseMcpServer extends McpServer {
  override authorizationServerMetadata() {
    const metadata = super.authorizationServerMetadata();
    return {
      ...metadata,
      grant_types_supported: [...metadata.grant_types_supported, JWT_GRANT],
      authorization_grant_profiles_supported: [ID_JAG_PROFILE],
    };
  }

  override registerRoutes(http: HttpRouter) {
    const routes = httpRouter();
    super.registerRoutes(routes);
    for (const [path, method, handler] of routes.getRoutes()) {
      // Convex's router invokes this runtime method too; its public declaration
      // strips runtime-only members. Keep the compatibility boundary here.
      const original = handler as typeof handler & {
        invokeHttpAction: (request: Request) => Promise<Response>;
      };
      if (
        method !== "POST" ||
        ![`${this.path}/oauth/token`, `${this.path}/oauth/revoke`].includes(
          path,
        )
      ) {
        http.route({ path, method, handler });
        continue;
      }
      http.route({
        path,
        method,
        handler: httpActionGeneric(async (ctx, request) => {
          // Parse a clone so normal OAuth/device requests retain their original body.
          if (
            !request.headers
              .get("Content-Type")
              ?.startsWith("application/x-www-form-urlencoded")
          )
            return original.invokeHttpAction(request);
          const text = await request.clone().text();
          if (text.length > 32768)
            return json({ error: "invalid_request" }, 400);
          const form = new URLSearchParams(text);
          if (path.endsWith("/token") && form.get("grant_type") === JWT_GRANT) {
            for (const key of new Set(form.keys()))
              if (form.getAll(key).length !== 1)
                return json({ error: "invalid_request" }, 400);
            return this.exchangeAssertion(ctx, form);
          }
          const token = form.get("token");
          if (path.endsWith("/revoke") && token?.startsWith(TOKEN_PREFIX)) {
            await ctx.runMutation(internal.mcpEnterprise.internal.revoke, {
              hash: await tokenHash(token),
            });
            return json({});
          }
          return original.invokeHttpAction(request);
        }),
      });
    }
  }

  override async authenticate(
    ctx: ToolCtx,
    request: Request,
  ): Promise<McpUser | null> {
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token?.startsWith(TOKEN_PREFIX))
      return super.authenticate(ctx, request);
    // Enterprise grants authorize this MCP resource only, never the HTTP API.
    if (
      new URL(request.url).pathname !== this.path ||
      !/^mcp_ema_[0-9a-f]{64}$/.test(token)
    )
      return null;
    return ctx.runQuery(internal.mcpEnterprise.internal.verify, {
      hash: await tokenHash(token),
      now: Date.now(),
    });
  }

  private async exchangeAssertion(
    ctx: ToolCtx,
    form: URLSearchParams,
  ): Promise<Response> {
    try {
      const assertion = form.get("assertion");
      if (
        !assertion ||
        assertion.length > 16384 ||
        form.get("client_id") !== CLAUDE_CLIENT_ID ||
        form.has("client_secret") ||
        form.has("client_assertion")
      )
        return invalid();
      if (form.has("resource") && form.get("resource") !== this.resource)
        return invalid();
      const issuer = claudeIssuer(decodeJwt(assertion).iss ?? "");
      const organization = await ctx.runQuery(
        internal.mcpEnterprise.internal.organization,
        { issuer },
      );
      if (!organization) return invalid();
      const discovery = await identityDocument(
        `${issuer}/.well-known/openid-configuration`,
      );
      if (discovery.issuer !== issuer || typeof discovery.jwks_uri !== "string")
        return invalid();
      const jwks = await identityDocument(discovery.jwks_uri);
      if (!Array.isArray(jwks.keys)) return invalid();
      const { payload } = await jwtVerify(
        assertion,
        createLocalJWKSet({ keys: jwks.keys }),
        {
          issuer,
          audience: this.issuer,
          typ: "oauth-id-jag+jwt",
          algorithms: ["RS256", "ES256"],
          requiredClaims: ["sub", "jti", "iat", "exp", "client_id"],
          maxTokenAge: "10 minutes",
        },
      );
      const now = Date.now() / 1000;
      if (
        payload.client_id !== CLAUDE_CLIENT_ID ||
        !payload.sub ||
        payload.sub.length > 512 ||
        !payload.jti ||
        payload.jti.length > 512 ||
        !payload.exp ||
        !payload.iat ||
        payload.exp - payload.iat > 600 ||
        payload.iat > now ||
        payload.aud !== this.issuer
      )
        return invalid();
      if (payload.resource !== undefined && payload.resource !== this.resource)
        return invalid();
      if (
        payload.tenant !== undefined &&
        payload.tenant !== organization.tenantId
      )
        return invalid();
      if (payload.email !== undefined && typeof payload.email !== "string")
        return invalid();
      if (payload.scope !== undefined && typeof payload.scope !== "string")
        return invalid();
      // No default-to-all scopes. Both the signed grant and tenant policy bound access.
      const scopes =
        typeof payload.scope === "string"
          ? [...new Set(payload.scope.split(/\s+/).filter(Boolean))]
          : [];
      const requested =
        form.get("scope")?.split(/\s+/).filter(Boolean) ?? scopes;
      if (
        requested.some(
          (scope) =>
            !scopes.includes(scope) ||
            !organization.scopes.includes(scope) ||
            !(scope in (this.options.scopes ?? {})),
        )
      )
        return json({ error: "invalid_scope" }, 400);
      const random = crypto.getRandomValues(new Uint8Array(32));
      const token =
        TOKEN_PREFIX +
        Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        );
      const result = await ctx.runMutation(
        internal.mcpEnterprise.internal.exchange,
        {
          issuer,
          revision: organization.revision,
          subject: payload.sub,
          ...(typeof payload.email === "string"
            ? { email: payload.email }
            : {}),
          jti: payload.jti,
          assertionExpiresAt: payload.exp * 1000,
          scopes: requested,
          hash: await tokenHash(token),
        },
      );
      return result
        ? json({
            access_token: token,
            token_type: "Bearer",
            expires_in: result.expiresIn,
            scope: requested.join(" "),
          })
        : invalid();
    } catch {
      // Never log assertions, emails, or tokens, or disclose membership on errors.
      return invalid();
    }
  }
}
