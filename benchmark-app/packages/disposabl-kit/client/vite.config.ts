import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  layout,
  physical,
  rootRoute,
  route,
} from "@tanstack/virtual-file-routes";

const kitRoute = (file: string) =>
  relative(
    resolve("src/router"),
    fileURLToPath(new URL(`./routes/${file}`, import.meta.url)),
  );

// Both Vite and `tsr generate` use this route tree.
export const routes = rootRoute("__root.tsx", [
  layout("_providers", kitRoute("route.tsx"), [
    physical("."),
    route("/login", kitRoute("_auth-pages/login.tsx")),
    route("/signup", kitRoute("_auth-pages/signUp.tsx")),
    route("/consent", kitRoute("consent.tsx")),
    layout("_authenticated", kitRoute("_authenticated/route.tsx"), []),
  ]),
]);

export default {
  routesDirectory: "router",
  // The root is registered above, outside the physical subtree.
  routeFileIgnorePattern: "__root\\.tsx$",
  virtualRouteConfig: routes,
};
