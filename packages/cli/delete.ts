import { openUrl } from "./auth";

/** Only open the verified Expo project returned by the deletion action. */
export function openExpoDeletion(
  body: unknown,
  appId: string,
  browser: boolean,
) {
  if (!body || typeof body !== "object" || !("error" in body)) return;
  const error = body.error;
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    error.code !== "expo_manual_delete_required"
  )
    return;
  if (
    !("appId" in error) ||
    error.appId !== appId ||
    !("projectUrl" in error) ||
    typeof error.projectUrl !== "string"
  )
    throw new Error(
      "Invalid Expo deletion response. The app record has been kept.",
    );
  const url = new URL(error.projectUrl);
  const parts = url.pathname.split("/");
  if (
    url.origin !== "https://expo.dev" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    parts.length !== 7 ||
    parts[1] !== "accounts" ||
    !parts[2] ||
    parts[3] !== "projects" ||
    parts[4] !== `app-${appId}` ||
    parts[5] !== "settings" ||
    parts[6] !== "advanced"
  )
    throw new Error("Invalid Expo project URL. The app record has been kept.");
  console.error(
    `GitHub and Convex cleanup is complete. Finish deleting the Expo project here:\n${url.href}\nSign in to Expo if needed and choose Delete project. Then rerun this command to verify cleanup. The Disposabl app record is still pending deletion.`,
  );
  if (browser) openUrl(url.href);
}
