export function screenCategory(path: string) {
  if (path === "/") return "discover";
  if (path === "/apps") return "apps";
  if (path.startsWith("/apps/")) return "app_detail";
  if (path === "/guides") return "guides";
  if (path === "/guide-detail") return "guide_detail";
  if (path === "/settings") return "settings";
  if (path === "/connections") return "connections";
  if (path === "/compose") return "create";
  if (path === "/login" || path === "/signup") return "auth";
  return "other";
}
