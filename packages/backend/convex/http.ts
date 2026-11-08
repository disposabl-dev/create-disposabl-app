import {
  page as telemetryPage,
  options as telemetryOptions,
} from "./telemetry";
import { download } from "./downloads/http";
import { token, report } from "./github/actions/http";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";
import { posthogMetadata } from "./connections/http";
import { desktopUpdate } from "./desktopUpdates";
import { agentApiPolicy } from "./agent/api_policy";

const http = createHttpRouter(agentApiPolicy);
http.route({ path: "/telemetry/page", method: "POST", handler: telemetryPage });
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
