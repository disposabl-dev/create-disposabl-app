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
