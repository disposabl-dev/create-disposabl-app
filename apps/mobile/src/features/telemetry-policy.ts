export const mobileActions = [
  "open_create",
  "open_connections",
  "open_app",
  "open_settings",
] as const;
export type MobileAction = (typeof mobileActions)[number];
export function isMobileAction(value: unknown): value is MobileAction {
  return (
    typeof value === "string" &&
    (mobileActions as readonly string[]).includes(value)
  );
}

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
