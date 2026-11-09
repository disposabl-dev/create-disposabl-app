import { httpRouter } from "convex/server";
import { webhook } from "../../../../disposabl-kit/server/revenuecat-functions";

const http = httpRouter();
http.route({ path: "/revenuecat/webhook", method: "POST", handler: webhook });
export default http;
