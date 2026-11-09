export function configuredWebsite() {
  return process.env.CONVEX_SITE_URL || process.env.VITE_CONVEX_SITE_URL || '';
}
