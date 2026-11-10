// The product serves its Convex HTTP routes on the canonical site domain.
export function productionAnalyticsEnabled(env, app, site) {
  const product = env.GH_REPO === "disposabl-dev/create-disposabl-app";
  const backend = app.productionConvexSiteUrl || site.backendOrigin;
  const matchesBackend = !!backend && backend === env.CONVEX_SITE_URL;
  const matchesProductDomain =
    product &&
    !app.productionConvexSiteUrl &&
    !!site.origin &&
    site.origin === env.CONVEX_SITE_URL;
  return (
    env.GITHUB_ACTIONS === "true" &&
    env.GITHUB_EVENT_NAME === "push" &&
    env.GITHUB_REF === "refs/heads/main" &&
    env.CHANNEL === "production" &&
    env.E2E_TELEMETRY_DISABLED !== "1" &&
    env.EXPO_PUBLIC_E2E !== "true" &&
    app.features.includes("analytics") &&
    (matchesBackend || matchesProductDomain)
  );
}
