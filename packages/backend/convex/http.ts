import { token, report } from "./github/actions/http";
import createHttpRouter from "@disposabl/disposabl-kit/server/http";

const http = createHttpRouter();
http.route({ path: "/github/token", method: "POST", handler: token });
http.route({ path: "/github/report", method: "POST", handler: report });

export default http;
