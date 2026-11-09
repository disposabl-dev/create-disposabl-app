import { webhook as revenueCatWebhook } from "@disposabl/disposabl-kit/server/revenuecat-functions";
import { desktopUpdate } from "./desktopUpdates";
import { page, bootstrap, options as telemetryOptions } from "./telemetry";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";

const http = createHttpRouter();
http.route({
  path: "/revenuecat/webhook",
  method: "POST",
  handler: revenueCatWebhook,
});
http.route({ path: "/telemetry/page", method: "POST", handler: page });
http.route({
  path: "/telemetry/bootstrap",
  method: "POST",
  handler: bootstrap,
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
  pathPrefix: "/desktop/updates/",
  method: "GET",
  handler: desktopUpdate,
});
export default http;
