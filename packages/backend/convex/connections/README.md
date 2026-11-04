# PostHog connection and app setup

PostHog is optional on Connections. An app that selects `analytics` requires a saved PostHog organization as well as GitHub and Convex. Analytics also includes `authentication`.

The generator sends the app's features to `connections status --wait`. When an account is missing, the CLI opens `/dashboard/connections?features=analytics` and waits. Feature choices are saved in `disposabl.json` before authorization, so the same command resumes interrupted setup. API and MCP app creation and resumed setup enforce the same requirement on the backend.

## OAuth

The service exposes `/.well-known/posthog-client.json`. Its public URL is the OAuth client ID, using `CONNECTIONS_ORIGIN` or `https://www.disposabl.dev`. Deploy this endpoint on that origin before trying the Connect button. PostHog must be able to fetch it over HTTPS without authentication or redirects.

The connection uses authorization code flow with PKCE, server-verified single-use state, and US or EU Cloud. It requests `organization:read`, `project:read`, and `project:write`. Grant organization access so the connection can create future app projects. No client secret or pasted personal API key is needed. The existing `CONNECTIONS_ENCRYPTION_KEY` encrypts access and refresh tokens.

After authorization, one available organization is selected automatically. Multiple organizations require a selection. Pending selection survives refresh because credentials remain on the backend. A pending connection does not satisfy Analytics setup.

## Project setup

App setup creates a project in the selected organization. Its name includes the app UUID so interrupted setup can recover it. Subsequent setup reuses the saved project and checks that the connected organization and region still match.

The CLI saves the public ingestion configuration as `analytics` in `disposabl.json`: `projectId`, `projectToken`, and `host`. OAuth access and refresh tokens never leave the service. Turning Analytics off stops requiring PostHog; it does not delete an existing analytics project or its data. Disconnecting removes saved management access, not the project's ingestion token.

This change prepares the connection and project configuration. Generated web/mobile SDK initialization, Convex event capture, API/MCP operation events, replay, errors, and tracing are a separate integration step; selecting the feature alone does not yet send events.

References: [PostHog OAuth](https://posthog.com/docs/api/oauth), [project API](https://posthog.com/docs/api/projects).
