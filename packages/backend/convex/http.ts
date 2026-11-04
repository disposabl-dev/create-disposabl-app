import { download } from "./downloads/http";
import { token, report } from "./github/actions/http";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";
import { posthogMetadata } from "./connections/http";

const http = createHttpRouter();
http.route({
  path: "/.well-known/posthog-client.json",
  method: "GET",
  handler: posthogMetadata,
});
http.route({ path: "/github/token", method: "POST", handler: token });
http.route({ path: "/github/report", method: "POST", handler: report });

http.route({ pathPrefix: "/downloads/", method: "GET", handler: download });

export default http;
