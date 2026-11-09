import { httpRouter, httpActionGeneric as httpAction } from "convex/server";
import {
  bootstrap as productionBootstrap,
  page as productionPage,
  createTelemetryPageHandler,
} from "../../../../backend/convex/telemetry";
import { getActiveSessionUserId } from "../../../../backend/convex/users/deletion";
import { bootstrapTelemetry } from "@disposabl/disposabl-kit/server/lib/telemetry";

const http = httpRouter();
// Test-only configuration; the production gate and capture remain unchanged.
http.route({
  path: "/fixture/page",
  method: "POST",
  handler: httpAction(
    createTelemetryPageHandler(
      () => true,
      async () => {},
    ),
  ),
});
http.route({
  path: "/fixture/bootstrap",
  method: "POST",
  handler: httpAction((ctx, request) =>
    bootstrapTelemetry(ctx, request, getActiveSessionUserId, () => true),
  ),
});
http.route({
  path: "/production/page",
  method: "POST",
  handler: productionPage,
});
http.route({
  path: "/production/bootstrap",
  method: "POST",
  handler: productionBootstrap,
});
export default http;
