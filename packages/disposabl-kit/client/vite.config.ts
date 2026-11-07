import { relative, resolve } from "node:path";
import { readFileSync } from "node:fs";
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
export const createRoutes = (enabled: boolean) =>
  rootRoute("__root.tsx", [
    layout("_providers", kitRoute("route.tsx"), [
      physical("."),
      route("/pricing", kitRoute("pricing.tsx")),
      route("/legal", kitRoute("legal/index.tsx")),
      route("/legal/privacy", kitRoute("legal/privacy.tsx")),
      route("/legal/terms", kitRoute("legal/terms.tsx")),
      route("/legal/privacy-request", kitRoute("legal/privacy-request.tsx")),
      route("/legal/delete-account", kitRoute("legal/delete-account.tsx")),
      ...(enabled
        ? [
            route("/login", kitRoute("_auth-pages/login.tsx")),
            route("/signup", kitRoute("_auth-pages/signUp.tsx")),
            route("/consent", kitRoute("consent.tsx")),
            route(
              "/forgot-password",
              kitRoute("_auth-pages/forgot-password.tsx"),
            ),
            route(
              "/reset-password",
              kitRoute("_auth-pages/reset-password.tsx"),
            ),
            route("/verify-email", kitRoute("_auth-pages/verify-email.tsx")),
          ]
        : []),
      layout(
        "_authenticated",
        kitRoute("_authenticated/route.tsx"),
        enabled
          ? [
              route(
                "/change-password",
                kitRoute("_authenticated/change-password.tsx"),
              ),
            ]
          : [],
      ),
    ]),
  ]);

const config = JSON.parse(
  readFileSync(new URL("../../../disposabl.json", import.meta.url), "utf8"),
) as { features: string[] };
export const routes = createRoutes(config.features.includes("authentication"));

export default {
  routesDirectory: "router",
  // The root is registered above, outside the physical subtree.
  routeFileIgnorePattern: "__root\\.tsx$",
  virtualRouteConfig: routes,
};
