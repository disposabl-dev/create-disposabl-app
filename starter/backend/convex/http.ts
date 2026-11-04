import { page } from "./telemetry";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";

const http = createHttpRouter();
http.route({ path: "/telemetry/page", method: "POST", handler: page });
export default http;
