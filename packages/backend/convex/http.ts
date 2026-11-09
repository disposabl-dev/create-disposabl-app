import { webhook as revenueCatWebhook } from "@disposabl/disposabl-kit/server/revenuecat-functions";
import {
  page as telemetryPage,
  options as telemetryOptions,
  bootstrap as telemetryBootstrap,
} from "./telemetry";
import { download } from "./downloads/http";
import { token, report } from "./github/actions/http";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";
import { posthogMetadata } from "./connections/http";
import { desktopUpdate } from "./desktopUpdates";
import { agentApiPolicy, accountEligibility } from "./agent/api_policy";

const http = createHttpRouter(agentApiPolicy, accountEligibility);
http.route({
  path: "/revenuecat/webhook",
  method: "POST",
  handler: revenueCatWebhook,
});
http.route({ path: "/telemetry/page", method: "POST", handler: telemetryPage });
http.route({
  path: "/telemetry/bootstrap",
  method: "POST",
  handler: telemetryBootstrap,
});
http.route({
  path: "/telemetry/bootstrap",
  method: "OPTIONS",
  handler: telemetryOptions,
});
http.route({
  path: "/telemetry/page",
  method: "OPTIONS",
  handler: telemetryOptions,
});
http.route({
  path: "/.well-known/posthog-client.json",
  method: "GET",
  handler: posthogMetadata,
});
http.route({ path: "/github/token", method: "POST", handler: token });
http.route({ path: "/github/report", method: "POST", handler: report });

http.route({
  pathPrefix: "/desktop/updates/",
  method: "GET",
  handler: desktopUpdate,
});

http.route({ pathPrefix: "/downloads/", method: "GET", handler: download });

export default http;
