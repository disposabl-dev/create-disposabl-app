/** Guide files are served by this app's website, including isolated previews. */
export function guideAssetUri(uri: string) {
  return uri.startsWith("/")
    ? new URL(uri, process.env.EXPO_PUBLIC_CONVEX_SITE_URL).href
    : uri;
}
