import project from "../../../package.json";

// Matches the additional scheme registered by apps/mobile/app.config.js.
export const mobileAuthReturnUrl = `disposabl-${project.name.replace(/[^a-z0-9.-]/g, "-")}://login`;
export const mobileAuthPath = "/oauth/mobile";

export function mobileAuthCallback(url: string) {
  const callback = new URL(url);
  const destination = new URL(callback.href);
  destination.search = "";
  if (destination.href !== mobileAuthReturnUrl)
    throw new Error("Invalid sign-in return URL");
  return {
    code: callback.searchParams.get("convexAuthCode"),
    error: callback.searchParams.get("convexAuthError"),
  };
}

/** Forward only Convex's one-time ticket, never a session or caller-selected URL. */
export function mobileAuthRedirect(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL(mobileAuthReturnUrl);
  const code = incoming.searchParams.get("convexAuthCode");
  const error = incoming.searchParams.get("convexAuthError");
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if ((!code && !error) || (code && code.length > 4096))
    return new Response("Invalid sign-in response. Please try again.", {
      status: 400,
      headers,
    });
  if (error)
    target.searchParams.set(
      "convexAuthError",
      error === "access_denied" ? "access_denied" : "oauth_error",
    );
  else target.searchParams.set("convexAuthCode", code!);
  return new Response(null, {
    status: 302,
    headers: { ...headers, Location: target.href },
  });
}
