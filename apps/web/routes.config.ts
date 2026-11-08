import { existsSync } from "node:fs";
import app from "../../disposabl.json";
import { createRoutes } from "@disposabl/disposabl-kit/client/vite.config";

export const routes = createRoutes(
  app.features.includes("authentication"),
  !existsSync("src/router/pricing.tsx"),
);
export default {
  routesDirectory: "router",
  routeFileIgnorePattern: "__root\\.tsx$",
  virtualRouteConfig: routes,
};
