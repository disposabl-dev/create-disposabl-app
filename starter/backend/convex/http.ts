import { page, options as telemetryOptions } from "./telemetry";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";

const http = createHttpRouter();
http.route({ path: "/telemetry/page", method: "POST", handler: page });
http.route({
  path: "/telemetry/page",
  method: "OPTIONS",
  handler: telemetryOptions,
});
export default http;
