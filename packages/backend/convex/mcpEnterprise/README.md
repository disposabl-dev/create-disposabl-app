# Claude auto-connect

When MCP is enabled, the shared server supports Claude-issued enterprise-managed authorization. Generated apps include it. Each customer organization has its own trusted Claude issuer and member mappings. No organization is trusted by default.

**Status:** organization provisioning is administrator-only. Customer-facing enrollment is not included, and a successful exchange with a real Claude Team/Enterprise organization still needs verification. Disposabl currently uses username/password sign-in, so it has no verified email or organization membership source to connect automatically. Do not announce auto-connect as available until those are wired and Claude's connection test passes.

## Set up an organization

These internal operations are available to deployment administrators. They are absent from public APIs and MCP tools. A customer-facing setup screen must first check the signed-in user's administrator role in the selected organization. A personal Disposabl account does not authorize managing other users.

1. In Claude, open Organization settings → Connectors → your connector → Managed authorization. Choose Claude-issued and copy the organization's issuer URL.
2. Call `mcpEnterprise/provision:configure` with your app's stable `tenantId`, that exact `issuer`, `enabled: true`, and allowed `scopes`. The starter has no named tool scopes, so use `[]`.
3. For each existing member, call `mcpEnterprise/provision:addMember` with the returned `organizationId`, their existing app `userId`, and `verifiedEmail`. Obtain the email and membership from a verified sign-in or directory integration. Never copy an email from a client form into this function.
4. In Claude, leave Tenant ID empty. The issuer identifies the organization. Run Test connection, then enable the connector for the desired roles.
5. Confirm a real tool request as two members and as a member of another organization before rolling out.

An unknown email does not create an account. The first successful grant binds the Claude subject to an existing member. Later grants use that stable subject; a different subject cannot reuse the email to take over the membership.

## Google sign-in

Convex Auth's Google method returns `profile.email` and `profile.emailVerified` from Google's validated ID token. Only use the email when `emailVerified === true`.

Google proves the app account's email. Your app's organization model decides whether that account is a member. Claude proves the member is signed into the configured Claude organization. All three checks are needed.

Wire membership provisioning from a trusted Google `createUser` or `onSignIn` callback after resolving app membership. Account creation alone must not enroll someone in every organization with a matching domain. Existing username accounts need a verified account-linking flow; do not silently merge them by username or an unverified email.

## Disable access

- `configure` with `enabled: false` immediately invalidates the organization's tokens. Every configuration update also invalidates prior tokens.
- `removeMember` immediately invalidates that member's tokens. Re-adding a member creates a new binding, so old tokens stay invalid.
- Removing a user from Claude prevents new assertions. Issued tokens last at most five minutes. Remove the app membership too when someone leaves.
- OAuth token revocation is supported. Managed access has no refresh token.

## Protocol and isolation

Discovery advertises the JWT bearer grant and ID-JAG profile. The server accepts Claude's published public client `https://claude.ai/oauth/mcp-oauth-client-metadata`. It validates the signature, issuer, JWT type, algorithm, audience, client ID, expiry, and optional resource and tenant claims. Unsupported authorization details are rejected.

Discovery and key fetches stay on `https://identity.anthropic.com`, reject redirects, and limit response size. Unknown issuers are rejected before any network request. Assertions are single-use. Tokens are stored as hashes and only work at this app's MCP endpoint. Every request checks membership and organization state. Browser OAuth, device flow, and API keys remain available. API-only apps use the original authorization server.

The adapter wraps the pinned MCP package's routes using Convex's HTTP action invocation method. Recheck that boundary when upgrading either package. No code is patched in `node_modules`.

References: [Claude setup](https://support.claude.com/en/articles/15537633-auto-connect-your-organization-s-apps-to-claude), [MCP enterprise-managed authorization](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization).
