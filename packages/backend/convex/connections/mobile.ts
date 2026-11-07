import { mobileAuthReturnUrl } from "../../../disposabl-kit/lib/mobile-auth";

export const mobileConnectionReturnUrl = mobileAuthReturnUrl.replace(
  "://login",
  "://connections",
);
const providers = ["github", "convex", "posthog"] as const;

/** Forward an OAuth callback to a fixed app URL. Completion still requires its owner session. */
export function connectionCallbackRedirect(request: Request) {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const target = state.startsWith("mobile_")
    ? new URL(mobileConnectionReturnUrl)
    : new URL(`/dashboard/connections/${incoming.search}`, incoming.origin);
  if (state.startsWith("mobile_")) {
    if (!/^mobile_[A-Za-z0-9_-]{43}$/.test(state))
      return new Response("Invalid connection callback", { status: 400 });
    target.searchParams.set("state", state);
    const provider = incoming.searchParams.get("provider");
    if (provider && !providers.includes(provider as (typeof providers)[number]))
      return new Response("Invalid connection provider", { status: 400 });
    if (provider) target.searchParams.set("provider", provider);
    for (const key of ["code", "installation_id", "setup_action", "error"]) {
      const value = incoming.searchParams.get(key);
      if (value && value.length <= 4096) target.searchParams.set(key, value);
    }
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function readMobileConnectionCallback(value: string) {
  const url = new URL(value);
  const target = new URL(url.href);
  target.search = "";
  if (target.href !== mobileConnectionReturnUrl)
    throw new Error("Invalid connection return URL.");
  const state = url.searchParams.get("state");
  if (!state || !/^mobile_[A-Za-z0-9_-]{43}$/.test(state))
    throw new Error("Invalid connection state.");
  if (url.searchParams.has("error"))
    throw new Error("Authorization was cancelled. Please try again.");
  const installation =
    url.searchParams.has("installation_id") ||
    url.searchParams.has("setup_action");
  const provider = url.searchParams.get("provider");
  const code = url.searchParams.get("code");
  if (
    !installation &&
    (!code ||
      !provider ||
      !providers.includes(provider as (typeof providers)[number]))
  )
    throw new Error("The connection response is incomplete. Please try again.");
  return {
    state,
    installation,
    provider: provider as (typeof providers)[number],
    code: code ?? "",
  };
}
