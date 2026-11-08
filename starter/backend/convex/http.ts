import { webhook as revenueCatWebhook } from "@disposabl/disposabl-kit/server/revenuecat-functions";
import { desktopUpdate } from "./desktopUpdates";
import { page, options as telemetryOptions } from "./telemetry";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";

const http = createHttpRouter();
http.route({
  path: "/revenuecat/webhook",
  method: "POST",
  handler: revenueCatWebhook,
});
http.route({ path: "/telemetry/page", method: "POST", handler: page });
http.route({
  path: "/telemetry/page",
  method: "OPTIONS",
  handler: telemetryOptions,
});
http.route({
  pathPrefix: "/desktop/updates/",
  method: "GET",
  handler: desktopUpdate,
});
export default http;
