/** Publicly reachable account flows still must not appear in search results. */
export const accountPaths = [
  "/login",
  "/signup",
  "/consent",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/change-password",
  "/_shell.html",
];
export const isAccountPage = (path: string) =>
  accountPaths.includes(path.replace(/\/$/, ""));

/** Convex exposes either its deployment host or the app's custom production host. */
export function isProductionSite(
  mode: string,
  backendOrigin: string,
  site: { origin: string; backendOrigin: string },
) {
  return (
    mode === "production" &&
    (!site.backendOrigin ||
      [site.backendOrigin, site.origin].includes(backendOrigin))
  );
}
