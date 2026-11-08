import { existsSync } from "node:fs";
import app from "../../disposabl.json";
import { createRoutes } from "@disposabl/disposabl-kit/client/vite.config";

const features: readonly string[] = app.features;
export const routes = createRoutes(
  features.includes("authentication"),
  !existsSync("src/router/pricing.tsx"),
);
export default {
  routesDirectory: "router",
  routeFileIgnorePattern: "__root\\.tsx$",
  virtualRouteConfig: routes,
};
